"""共有範囲: one post shown in several of my houses.

The post is made in the house of the URL first. For each other house in share_to, the
same post is made there too (with its own copy of the photo / voice, so leaving one house
never breaks another), and every copy keeps a map of all copies in `shared_copies`
({house_id: record_id}). Editing or deleting one copy then does the same to all of them.
"""
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException

MEDIA_FIELDS = ("media_id", "voice_media_id")


def targets(store, uid, house_id, share_to):
    """The other houses to post to; each must be one of mine and not this one."""
    picked = []
    for other in dict.fromkeys(str(h) for h in share_to or []):
        house = store.get(f"houses/{other}")
        if other == house_id or not house or uid not in house.get("member_ids", []):
            raise HTTPException(422, "You can only share to your other houses")
        picked.append(other)
    return picked


def copy_media(store, media, uid, source, target, media_id):
    """The same photo / voice, stored again in the target house. Safe to retry."""
    if not media_id:
        return None
    meta = store.get(f"houses/{source}/media/{media_id}")
    if not meta or meta.get("owner_id") != uid:
        raise HTTPException(422, "Missing or incompatible owned media")
    new_id = str(uuid5(NAMESPACE_URL, f"darupoyo:{media_id}:{target}"))
    path = f"houses/{target}/media/{new_id}"
    if not store.get(path):
        name = f"houses/{target}/{new_id}"
        try:
            media.put(name, media.read(meta["object_name"]), meta["content_type"])
        except Exception:  # noqa: BLE001 -- already there from an interrupted try
            pass
        copy = {**meta, "id": new_id, "object_name": name}
        store.atomic(lambda tx: tx.set(path, copy))
    return new_id


def link(store, collection, copies):
    """Tell every copy where the others are."""
    for house_id, record_id in copies.items():
        path = f"houses/{house_id}/{collection}/{record_id}"

        def save(tx, path=path):
            record = tx.get(path)
            if record:
                record["shared_copies"] = copies
                tx.set(path, record)
            return record

        store.atomic(save)


def fan_out(app, uid, house_id, collection, record, body, make_copy):
    """Make the post in each share_to house with make_copy(other, media_ids) → record.
    Returns the first record, now carrying shared_copies when it went anywhere else."""
    others = targets(app.state.store, uid, house_id, getattr(body, "share_to", []))
    if not others:
        return record
    copies = {house_id: record["id"]}
    for other in others:
        media_ids = {}
        for field in MEDIA_FIELDS:
            copied = copy_media(app.state.store, app.state.media, uid, house_id, other, getattr(body, field, None))
            if copied:
                media_ids[field] = UUID(copied)
        media_ids["request_id"] = uuid5(UUID(str(body.request_id)), other)
        copies[other] = make_copy(other, media_ids)["id"]
    link(app.state.store, collection, copies)
    return {**record, "shared_copies": copies}
