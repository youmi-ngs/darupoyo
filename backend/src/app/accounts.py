"""Resumable removal of one resident's data, followed by their login account.

The private deletion marker blocks writes before membership is removed. Its house
list survives partial failures; object deletion precedes metadata deletion so a
retry can find every remaining file. Other residents' records are edited in small
transactions, avoiding Firestore's transaction write limit.
"""
from fastapi import HTTPException


def require_active(store, uid):
    if store.get(f"account_deletions/{uid}"):
        raise HTTPException(409, "Account deletion in progress; retry deletion")


def delete_account(store, media, uid, delete_login):
    marker = f"account_deletions/{uid}"
    def begin(tx):
        job = tx.get(marker)
        if not job:
            job = {"houses": None}
            tx.set(marker, job)
        return job
    job = store.atomic(begin)
    if job["houses"] is None:
        # No new house/join can commit after the marker was written.
        job["houses"] = [path.split('/')[-1] for path, h in store.scan('houses') if uid in h['member_ids']]
        def remember(tx):
            current = tx.get(marker) or {"houses": None}
            if current["houses"] is None:
                current = job
                tx.set(marker, current)
            return current
        job = store.atomic(remember)

    for house_id in job["houses"]:
        root = f"houses/{house_id}"
        def detach(tx):
            house = tx.get(root)
            if not house:
                return True
            house['member_ids'] = [m for m in house['member_ids'] if m != uid]
            house['members'].pop(uid, None)
            if house.get('owner_id') == uid:
                house['owner_id'] = next(iter(house['member_ids']), None)
            # Keep an empty house inaccessible until all its children are gone.
            tx.set(root, house)
            return not house['member_ids']
        empty = store.atomic(detach)
        removed_posts = {path.split('/')[-1] for path, p in store.scan(root + '/posts') if empty or p['user_id'] == uid}
        removed_moments = {path.split('/')[-1] for path, p in store.scan(root + '/moments') if empty or p['user_id'] == uid}
        # Mark ownership on new request records; older records can be resolved
        # from their referenced post before it is deleted.
        for collection, field, removed in [('requests', 'post_id', removed_posts), ('moment_requests', 'id', removed_moments)]:
            for path, value in store.scan(root + '/' + collection):
                if empty or value.get('user_id') == uid or value.get(field) in removed:
                    store.atomic(lambda tx, path=path: tx.delete(path))
        for collection in ('posts', 'moments', 'days'):
            for path, _ in store.scan(root + '/' + collection):
                def scrub(tx):
                    value = tx.get(path)
                    if not value:
                        return
                    if empty or value.get('user_id') == uid:
                        tx.delete(path)
                        return
                    if collection == 'days':
                        for key in ('goals', 'completed', 'activity'):
                            value.get(key, {}).pop(uid, None)
                        value['poses'] = {k: p for k, p in value.get('poses', {}).items() if p['user_id'] != uid}
                        for latest in value.get('latest', {}).values():
                            latest.pop(uid, None)
                        value['recent'] = [p for p in value.get('recent', []) if p['user_id'] != uid]
                        for recent in value['recent']:
                            recent['sync_with'] = [m for m in recent.get('sync_with', []) if m != uid]
                    else:
                        value.get('reactions', {}).pop(uid, None)
                        value['sync_with'] = [m for m in value.get('sync_with', []) if m != uid]
                        # A copied pose remains the other user's own photo.
                        if value.get('pose_template_post_id') and (value['pose_template_post_id'] in removed_posts or not tx.get(root + '/posts/' + value['pose_template_post_id'])):
                            value['pose_template_post_id'] = None
                    tx.set(path, value)
                store.atomic(scrub)
        for path, meta in store.scan(root + '/media'):
            if empty or meta['owner_id'] == uid:
                media.delete(meta['object_name'])
                store.atomic(lambda tx, path=path: tx.delete(path))
        for path, invite in store.scan('invites'):
            if invite['house_id'] == house_id and (empty or invite.get('created_by') in (None, uid)):
                store.atomic(lambda tx, path=path: tx.delete(path))
        if empty:
            store.atomic(lambda tx: tx.delete(root))
    store.atomic(lambda tx: tx.delete(f'notify/{uid}'))
    # Do not remove login credentials until data cleanup succeeds, so the user
    # can authenticate a retry after any storage/API failure.
    delete_login(uid)
    # Keep only a completion fence, with no house IDs or user content. Requests
    # authenticated before deletion may still be in flight; removing the fence
    # would let them recreate a house or notification registration afterwards.
    store.atomic(lambda tx: tx.set(marker, {"houses": [], "complete": True}))
