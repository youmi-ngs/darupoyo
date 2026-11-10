"""Editing and deleting your own posts: chore records, うちらのなう and だるぽよ.

Only the text (caption) can be edited. When it changes, the gal's line is written again
from the new text, the same way as when the post was made. Deleting a post also removes
its photo / voice and undoes what it changed on that day (the room light, today's pose).
"""
import re
from uuid import UUID

from fastapi import Depends, HTTPException

from .domain import require_member
from .notify import voice
from .models import Model
from .text_limits import Caption

RECORD_ID = r"[0-9]{8}T[0-9]{12}_[a-f0-9]{32}"
# kind in the URL → collection, and the request log that points back at the record
KINDS = {
    "posts": ("posts", "requests", "post_id"),
    "moments": ("moments", "moment_requests", "id"),
    "darupoyo": ("darupoyo_records", "darupoyo_requests", "id"),
}


class CaptionEdit(Model):
    caption: Caption = ""


def _own(tx, house_id, uid, collection, record_id):
    require_member(tx, house_id, uid)
    record = tx.get(f"houses/{house_id}/{collection}/{record_id}")
    if not record or record.get("user_id") != uid:
        raise HTTPException(404, "Own post not found")
    return record


def _copies(record, house_id):
    """The other houses' copies of a shared post (共有範囲): [(house_id, record_id)]."""
    return [(h, r) for h, r in (record.get("shared_copies") or {}).items() if h != house_id]


def _set_copy(app, uid, house_id, kind, record_id, caption, praise):
    """Give one copy the new words (and the gal's new line). A house I left is skipped."""
    path = f"houses/{house_id}/{KINDS[kind][0]}/{record_id}"

    def save(tx):
        try:
            record = _own(tx, house_id, uid, KINDS[kind][0], record_id)
        except HTTPException:
            return
        record["caption"] = caption
        record["edited_at"] = app.state.domain.clock().isoformat()
        if praise is not None:
            record["praise"] = praise
        tx.set(path, record)

    app.state.store.atomic(save)


def edit_caption(app, uid, house_id, kind, record_id, caption):
    record = _edit_one(app, uid, house_id, kind, record_id, caption)
    for other, copy_id in _copies(record, house_id):  # 共有範囲: the same words everywhere
        _set_copy(app, uid, other, kind, copy_id, record.get("caption", ""), record.get("praise"))
    return record


def _edit_one(app, uid, house_id, kind, record_id, caption):
    collection = KINDS[kind][0]
    path = f"houses/{house_id}/{collection}/{record_id}"
    caption = caption.strip()

    def save(tx):
        record = _own(tx, house_id, uid, collection, record_id)
        changed = record.get("caption", "") != caption
        record["caption"] = caption
        if changed:
            record["edited_at"] = app.state.domain.clock().isoformat()
        tx.set(path, record)
        return record, changed

    record, changed = app.state.store.atomic(save)
    if not changed or kind == "darupoyo":  # だるぽよ has no gal line
        return record
    if kind == "posts":
        line = app.state.praise.generate(record["chore"], record.get("gal"), record)
        return app.state.domain.set_praise(house_id, record_id, line)
    # うちらのなう: the same gal looks at the photo again with the new words.
    house = require_member(app.state.store, house_id, uid)
    gal = (record.get("praise") or {}).get("gal") or voice(house["members"][uid].get("gal"))
    photo = None
    try:
        meta = app.state.store.get(f"houses/{house_id}/media/{record['media_id']}")
        photo = (app.state.media.read(meta["object_name"]), meta["content_type"])
    except Exception:  # noqa: BLE001 -- without the photo the line comes from the words
        photo = None
    return app.state.domain.set_moment_praise(house_id, record_id, app.state.praise.moment(gal, caption, photo))


def _undo_day(tx, house_id, uid, kind, record, others):
    """Take this record back out of its day. others: the same resident's other records that day."""
    path = f"houses/{house_id}/days/{record['day']}"
    state = tx.get(path)
    if not state:
        return None
    if kind == "darupoyo":
        if not others:
            state.get("darupoyo_shared", {}).pop(uid, None)
        return path, state
    chore, record_id = record["chore"], record["id"]
    same = [p for p in others if p.get("chore") == chore]
    if not same:
        done = state.get("completed", {})
        if chore in done.get(uid, []):
            done[uid].remove(chore)
        if uid in done and not done[uid]:
            done.pop(uid)
        state.get("latest", {}).get(chore, {}).pop(uid, None)
    else:
        state.setdefault("latest", {}).setdefault(chore, {})[uid] = max(p["created_at"] for p in same)
    if (state.get("activity", {}).get(uid) or {}).get("post_id") == record_id:
        state["activity"].pop(uid, None)
    if (state.get("poses", {}).get(chore) or {}).get("post_id") == record_id:
        state["poses"].pop(chore, None)
    state["recent"] = [p for p in state.get("recent", []) if p.get("id") != record_id]
    return path, state


def delete_record(app, uid, house_id, kind, record_id):
    record = _delete_one(app, uid, house_id, kind, record_id)
    for other, copy_id in _copies(record, house_id):  # 共有範囲: gone from every house
        try:
            _delete_one(app, uid, other, kind, copy_id)
        except HTTPException:
            pass  # already gone, or a house I left


def _delete_one(app, uid, house_id, kind, record_id):
    store, media = app.state.store, app.state.media
    collection, requests, field = KINDS[kind]
    root = f"houses/{house_id}"
    record = _own(store, house_id, uid, collection, record_id)
    # Reads that a transaction cannot do: the resident's other records that day.
    others = [p for _, p in store.scan(f"{root}/{collection}")
              if p.get("user_id") == uid and p.get("day") == record.get("day") and p.get("id") != record_id]

    def remove(tx):
        current = _own(tx, house_id, uid, collection, record_id)
        day = _undo_day(tx, house_id, uid, kind, current, others) if kind != "moments" and current.get("day") else None
        tx.delete(f"{root}/{collection}/{record_id}")
        if day:
            tx.set(*day)
        return current

    removed = store.atomic(remove)
    # A retry of the old request must not bring back a post that is gone.
    for path, value in store.scan(f"{root}/{requests}"):
        if value.get(field) == record_id:
            store.atomic(lambda tx, path=path: tx.delete(path))
    for key in ("media_id", "voice_media_id", "finished_voice_media_id"):
        media_id = removed.get(key)
        meta = store.get(f"{root}/media/{media_id}") if media_id else None
        if meta and meta.get("owner_id") == uid:
            media.delete(meta["object_name"])
            store.atomic(lambda tx, media_id=media_id: tx.delete(f"{root}/media/{media_id}"))
    return removed


def register_edit_routes(app, current_user):
    def check(record_id):
        if not re.fullmatch(RECORD_ID, record_id):
            raise HTTPException(422, "Invalid post id")

    for kind in KINDS:
        def patch(house_id: UUID, record_id: str, body: CaptionEdit, uid=Depends(current_user), kind=kind):
            check(record_id)
            return edit_caption(app, uid, str(house_id), kind, record_id, body.caption)

        def delete(house_id: UUID, record_id: str, uid=Depends(current_user), kind=kind):
            check(record_id)
            delete_record(app, uid, str(house_id), kind, record_id)
            return {"deleted": record_id}

        app.patch(f"/api/houses/{{house_id}}/{kind}/{{record_id}}")(patch)
        app.delete(f"/api/houses/{{house_id}}/{kind}/{{record_id}}")(delete)
