"""Non-completion records, kept separate from chores and their rewards."""
from uuid import UUID, uuid4
from fastapi import Depends, HTTPException, Query
from pydantic import Field, model_validator
from .domain import digest, new_day, require_member
from .models import Chore, Model


class DarupoyoRecord(Model):
    request_id: UUID
    chore: Chore
    caption: str = Field(default="", max_length=140)
    media_id: UUID | None = None

    @model_validator(mode="after")
    def has_content(self):
        self.caption = self.caption.strip()
        if not self.caption and not self.media_id:
            raise ValueError("A photo or caption is required")
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
        state['darupoyo_updated_at'] = now.isoformat()
        tx.set(f"{root}/darupoyo_records/{record['id']}", record)
        tx.set(request_path, {"id": record['id'], "user_id": uid, "fingerprint": fingerprint})
        tx.set(f"{root}/days/{day}", state)
        return {"record": record, "created": True}
    return domain.store.atomic(run)


def register_darupoyo_routes(app, current_user):
    @app.post('/api/houses/{house_id}/darupoyo', status_code=201)
    def create_record(house_id: UUID, body: DarupoyoRecord, uid=Depends(current_user)):
        return share(app.state.domain, uid, str(house_id), body)

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
