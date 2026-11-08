"""Photo comments, profile photos and opt-in history from a resident's other houses.

- Comments live inside the post (max 50) so Firestore post listeners and
  account deletion already reach them.
- A profile photo is an ``avatar`` media item referenced from the member entry.
- History from other houses is visible to its owner, and to residents of a
  house only after the owner turns on ``share_history`` for that house.
"""

from datetime import UTC, datetime

from fastapi import HTTPException

from .domain import require_member

MAX_COMMENTS = 50
HISTORY_LIMIT = 200
HISTORY_MEDIA_KINDS = {"meal", "cutout", "voice"}
# Only the owner's own content travels to another house; reactions, comments
# and sync partners belong to the original house's residents.
HISTORY_FIELDS = (
    "id", "day", "chore", "method", "created_at", "media_id", "voice_media_id",
    "finished_voice_media_id", "reward", "praise", "gal", "caption",
)


def _now():
    return datetime.now(UTC)


def add_comment(store, uid, house_id, post_id, body, clock=_now):
    path = f"houses/{house_id}/posts/{post_id}"
    text = body.text.strip()
    comment_id = str(body.request_id)

    def run(tx):
        require_member(tx, house_id, uid)
        post = tx.get(path)
        if not post:
            raise HTTPException(404, "Post not found")
        comments = post.setdefault("comments", [])
        prior = next((c for c in comments if c["id"] == comment_id), None)
        if prior:
            if prior["user_id"] != uid or prior["text"] != text:
                raise HTTPException(409, "request_id was already used with different content")
            return post
        if len(comments) >= MAX_COMMENTS:
            raise HTTPException(409, "This photo has too many comments")
        comments.append({"id": comment_id, "user_id": uid, "text": text, "created_at": clock().isoformat()})
        tx.set(path, post)
        return post

    return store.atomic(run)


def delete_comment(store, uid, house_id, post_id, comment_id):
    path = f"houses/{house_id}/posts/{post_id}"

    def run(tx):
        require_member(tx, house_id, uid)
        post = tx.get(path)
        if not post:
            raise HTTPException(404, "Post not found")
        comments = post.get("comments", [])
        mine = [c for c in comments if c["id"] == comment_id and c["user_id"] == uid]
        if not mine:
            raise HTTPException(404, "Own comment not found")
        post["comments"] = [c for c in comments if c["id"] != comment_id]
        tx.set(path, post)
        return post

    return store.atomic(run)


def set_avatar(store, media, uid, house_id, media_id):
    """Set (media_id) or clear (None) this resident's profile photo in one house."""
    def run(tx):
        house = require_member(tx, house_id, uid)
        if media_id:
            meta = tx.get(f"houses/{house_id}/media/{media_id}")
            if not meta or meta["owner_id"] != uid or meta["kind"] != "avatar" or meta.get("retired"):
                raise HTTPException(422, "Missing or incompatible owned profile photo")
        member = house["members"][uid]
        old = member.get("avatar_media_id")
        old_meta = tx.get(f"houses/{house_id}/media/{old}") if old and old != media_id else None
        if media_id:
            member["avatar_media_id"] = media_id
        else:
            member.pop("avatar_media_id", None)
        if old_meta and old_meta["owner_id"] == uid and old_meta["kind"] == "avatar":
            # Fence off a stale concurrent request before deleting the file.
            # Keep metadata until storage succeeds so account cleanup can retry.
            old_meta["retired"] = True
            tx.set(f"houses/{house_id}/media/{old}", old_meta)
        tx.set(f"houses/{house_id}", house)
        return house, old

    house, old = store.atomic(run)
    if old and old != media_id:
        # The replaced photo is no longer shown anywhere; remove the file first so
        # a failure leaves metadata that account deletion can still find.
        meta = store.get(f"houses/{house_id}/media/{old}")
        if meta and meta["owner_id"] == uid and meta["kind"] == "avatar":
            media.delete(meta["object_name"])
            store.atomic(lambda tx: tx.delete(f"houses/{house_id}/media/{old}"))
    return house


def set_history_sharing(store, uid, house_id, enabled):
    def run(tx):
        house = require_member(tx, house_id, uid)
        house["members"][uid]["share_history"] = enabled
        tx.set(f"houses/{house_id}", house)
        return house

    return store.atomic(run)


def _history_access(store, uid, house_id, member_id):
    house = require_member(store, house_id, uid)
    if member_id not in house["member_ids"]:
        raise HTTPException(404, "Resident not found")
    if uid != member_id and not house["members"][member_id].get("share_history"):
        raise HTTPException(403, "This resident keeps other houses private")


def history(store, uid, house_id, member_id, before=None):
    """The member's own records from their other houses, newest first."""
    _history_access(store, uid, house_id, member_id)
    items = []
    for _, other in store.scan("houses"):
        if other["id"] == house_id or member_id not in other["member_ids"]:
            continue
        for _, post in store.scan(f"houses/{other['id']}/posts"):
            if post["user_id"] == member_id and (not before or post["id"] < before):
                items.append({**{k: post.get(k) for k in HISTORY_FIELDS}, "source_house_id": other["id"]})
    items.sort(key=lambda p: p["id"], reverse=True)
    page = items[:HISTORY_LIMIT]
    return {"items": page, "next_cursor": page[-1]["id"] if len(items) > HISTORY_LIMIT else None, "shared": bool(
        require_member(store, house_id, uid)["members"][member_id].get("share_history"))}


def history_media(store, media, uid, house_id, member_id, source_house_id, media_id):
    _history_access(store, uid, house_id, member_id)
    source = store.get(f"houses/{source_house_id}")
    meta = store.get(f"houses/{source_house_id}/media/{media_id}")
    if (not source or member_id not in source["member_ids"] or not meta
            or meta["owner_id"] != member_id or meta["kind"] not in HISTORY_MEDIA_KINDS):
        raise HTTPException(404, "Image not found")
    # Uploaded previews/drafts are not published records, even when their owner
    # opted into sharing completed records with this destination house.
    published = any(post.get("user_id") == member_id and media_id in (
        post.get("media_id"), post.get("voice_media_id"), post.get("finished_voice_media_id")
    ) for _, post in store.scan(f"houses/{source_house_id}/posts"))
    if not published:
        raise HTTPException(404, "Record media not found")
    return media.read(meta["object_name"]), meta["content_type"]
