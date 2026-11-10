"""Non-completion records, kept separate from chores and their rewards."""
from .text_limits import Caption
from uuid import UUID, uuid4
from fastapi import Depends, HTTPException, Query
from pydantic import Field, model_validator
from .domain import digest, new_day, require_member
from .models import Chore, Model


class DarupoyoRecord(Model):
    request_id: UUID
    chore: Chore
    caption: Caption = ""
    media_id: UUID | None = None
    # 共有範囲: my other houses that get this record too.
    share_to: list[UUID] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def tidy(self):
        # #142: a photo and a caption are both optional; 「だるぽよ」 by itself is a record.
        self.caption = self.caption.strip()
        return self


def share(domain, uid, house_id, body):
    now = domain.clock()
    day = domain.day(now)
    root = f"houses/{house_id}"
    request_path = f"{root}/darupoyo_requests/{uid}_{body.request_id}"
    fingerprint = digest(body.model_dump_json())

    def run(tx):
        require_member(tx, house_id, uid)
        prior = tx.get(request_path)
        if prior:
            if prior['fingerprint'] != fingerprint:
                raise HTTPException(409, "Request ID already used")
            return {"record": tx.get(f"{root}/darupoyo_records/{prior['id']}"), "created": False}
        if body.media_id:
            media = tx.get(f"{root}/media/{body.media_id}")
            if not media or media['owner_id'] != uid or media['kind'] != 'darupoyo':
                raise HTTPException(422, "Missing or incompatible owned photo")
        state = tx.get(f"{root}/days/{day}") or new_day(day)
        record = {
            "id": now.strftime('%Y%m%dT%H%M%S%f') + '_' + uuid4().hex,
            "kind": "darupoyo", "user_id": uid, "chore": body.chore.value,
            "caption": body.caption, "media_id": str(body.media_id) if body.media_id else None,
            "day": day, "created_at": now.isoformat(),
        }
        # Wake the existing days subscription without recording any completion,
        # pose, activity avatar, reward or friend-cleared notification.
        state.setdefault('darupoyo_shared', {})[uid] = True
        state['darupoyo_updated_at'] = now.isoformat()
        tx.set(f"{root}/darupoyo_records/{record['id']}", record)
        tx.set(request_path, {"id": record['id'], "user_id": uid, "fingerprint": fingerprint})
        tx.set(f"{root}/days/{day}", state)
        return {"record": record, "created": True}
    return domain.store.atomic(run)


def set_praise(store, house_id, record_id, praise):
    path = f"houses/{house_id}/darupoyo_records/{record_id}"

    def save(tx):
        record = tx.get(path)
        if not record:
            raise HTTPException(409, "Record was removed")
        record["praise"] = praise
        tx.set(path, record)
        return record

    return store.atomic(save)


def add_praise(app, uid, house_id, record):
    """The resident's gal answers the だるぽよ (with the photo, if there is one)."""
    from .notify import voice
    store = app.state.store
    gal = voice(require_member(store, house_id, uid)["members"][uid].get("gal"))
    photo = None
    if record.get("media_id"):
        try:
            meta = store.get(f"houses/{house_id}/media/{record['media_id']}")
            photo = (app.state.media.read(meta["object_name"]), meta["content_type"])
        except Exception:  # noqa: BLE001 -- without the photo the line comes from the words
            photo = None
    line = app.state.praise.darupoyo(gal, record["chore"], record.get("caption", ""), photo)
    return set_praise(store, house_id, record["id"], line)


def register_darupoyo_routes(app, current_user):
    @app.post('/api/houses/{house_id}/darupoyo', status_code=201)
    def create_record(house_id: UUID, body: DarupoyoRecord, uid=Depends(current_user)):
        from .sharing import fan_out, targets
        house = str(house_id)
        targets(app.state.store, uid, house, body.share_to)  # check before anything is saved
        result = share(app.state.domain, uid, house, body)
        if "praise" not in result["record"]:  # new: the gal answers (a retry already has her line)
            result["record"] = add_praise(app, uid, house, result["record"])

        def copy(other, media_ids):
            made = share(app.state.domain, uid, other, body.model_copy(update={**media_ids, "share_to": []}))["record"]
            if "praise" not in made and result["record"].get("praise"):
                made = set_praise(app.state.store, other, made["id"], result["record"]["praise"])
            return made

        result["record"] = fan_out(app, uid, house, "darupoyo_records", result["record"], body, copy)
        return result

    @app.get('/api/houses/{house_id}/darupoyo')
    def records(
        house_id: UUID,
        before: str | None = Query(default=None, max_length=64, pattern=r'^[0-9]{8}T[0-9]{12}_[a-f0-9]{32}$'),
        uid=Depends(current_user),
    ):
        house = str(house_id)
        require_member(app.state.store, house, uid)
        items = app.state.store.list(f'houses/{house}/darupoyo_records', limit=30, before=before)
        return {"items": items, "next_cursor": items[-1]['id'] if len(items) == 30 else None}
