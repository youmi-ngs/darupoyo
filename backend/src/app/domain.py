import hashlib
import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from .services import REWARDS
from .accounts import require_active
from .themes import normalize_themes, taken_by_other


def utcnow():
    return datetime.now(UTC)


# No 0/O or 1/I so codes survive being read aloud or retyped.
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
INVITE_LENGTH = 8


def normalize_invite(token):
    """Accept short codes typed as k7pm-3qxd or with spaces; older long link tokens stay as-is."""
    compact = re.sub(r"[\s-]", "", token)
    return compact.upper() if len(compact) == INVITE_LENGTH else token


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def require_member(store, house_id, uid):
    require_active(store, uid)
    house = store.get(f"houses/{house_id}")
    if not house or uid not in house["member_ids"]:
        raise HTTPException(404, "House not found")
    return house


def new_day(day):
    return {"day": day, "goals": {}, "completed": {}, "poses": {}, "recent": [], "latest": {}, "activity": {}}


class Domain:
    def __init__(self, store, settings, clock=utcnow):
        self.store, self.settings, self.clock = store, settings, clock

    def day(self, now=None):
        # A household day runs from local 04:00 through the next 03:59.
        local = (now or self.clock()).astimezone(ZoneInfo(self.settings.timezone))
        return (local - timedelta(hours=4)).date().isoformat()

    def create_house(self, uid, body):
        house_id = str(uuid4())
        house = {
            "id": house_id,
            "name": body.name,
            "owner_id": uid,
            "member_ids": [uid],
            "members": {uid: {"display_name": body.display_name, "theme": "pink"}},
            "created_at": self.clock().isoformat(),
        }
        def create(tx):
            require_active(tx, uid)
            tx.set(f"houses/{house_id}", house)
        self.store.atomic(create)
        return house

    def invite(self, uid, house_id):
        expires = (self.clock() + timedelta(days=7)).isoformat()

        def run(tx):
            require_member(tx, house_id, uid)
            # Short code people can read aloud or type; retry on the rare collision.
            while True:
                code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(INVITE_LENGTH))
                if not tx.get(f"invites/{digest(code)}"):
                    break
            tx.set(f"invites/{digest(code)}", {"house_id": house_id, "expires_at": expires, "created_by": uid})
            return code

        token = self.store.atomic(run)
        return {"token": token, "expires_at": expires}

    def join(self, uid, body):
        def run(tx):
            require_active(tx, uid)
            invitation = tx.get(f"invites/{digest(normalize_invite(body.token))}")
            if not invitation or datetime.fromisoformat(invitation["expires_at"]) <= self.clock():
                raise HTTPException(404, "Invite not found or expired")
            path = f"houses/{invitation['house_id']}"
            house = tx.get(path)
            if not house or not house["member_ids"]:
                raise HTTPException(404, "House not found")
            if uid in house["member_ids"]:
                return house
            if len(house["member_ids"]) >= 6:
                raise HTTPException(409, "House is full")
            house["member_ids"].append(uid)
            house["members"][uid] = {"display_name": body.display_name}
            normalize_themes(house)  # the newcomer gets the first free color
            tx.set(path, house)
            return house

        return self.store.atomic(run)

    def share_moment(self, uid, house_id, body):
        now = self.clock()
        path = f"houses/{house_id}/moment_requests/{uid}_{body.request_id}"
        fingerprint = digest(body.model_dump_json())
        def apply(tx):
            require_member(tx, house_id, uid)
            prior = tx.get(path)
            if prior:
                if prior["fingerprint"] != fingerprint:
                    raise HTTPException(409, "Request ID already used")
                return tx.get(f"houses/{house_id}/moments/{prior['id']}")
            media = tx.get(f"houses/{house_id}/media/{body.media_id}")
            if not media or media["owner_id"] != uid or media["kind"] != "selfie":
                raise HTTPException(422, "Missing or incompatible owned selfie")
            moment = {"id": now.strftime("%Y%m%dT%H%M%S%f") + "_" + uuid4().hex,
                      "user_id": uid, "media_id": str(body.media_id),
                      "caption": body.caption.strip(), "created_at": now.isoformat()}
            tx.set(f"houses/{house_id}/moments/{moment['id']}", moment)
            tx.set(path, {"id": moment["id"], "fingerprint": fingerprint, "user_id": uid})
            return moment
        return self.store.atomic(apply)

    def dashboard(self, uid, house_id, day=None):
        house = require_member(self.store, house_id, uid)
        date = day or self.day()
        state = self.store.get(f"houses/{house_id}/days/{date}") or new_day(date)
        lights = {member: bool(state["completed"].get(member)) for member in house["member_ids"]}
        return {
            "house": house,
            "state": state,
            "lights": lights,
            "happiness": round(100 * sum(lights.values()) / len(lights)),
            "timezone": self.settings.timezone,
        }

    def goals(self, uid, house_id, body):
        day = self.day()
        path = f"houses/{house_id}/days/{day}"

        def run(tx):
            require_member(tx, house_id, uid)
            state = tx.get(path) or new_day(day)
            state["goals"][uid] = list(dict.fromkeys(c.value for c in body.chores))
            tx.set(path, state)
            return state

        return self.store.atomic(run)

    def complete(self, uid, house_id, body):
        now = self.clock()
        day = self.day(now)
        day_path = f"houses/{house_id}/days/{day}"
        request_path = f"houses/{house_id}/requests/{digest(uid + ':' + str(body.request_id))}"
        fingerprint = digest(json.dumps(body.model_dump(mode="json"), sort_keys=True))
        post_id = now.strftime("%Y%m%dT%H%M%S%f") + "_" + uuid4().hex
        chore = body.chore.value

        def run(tx):
            house = require_member(tx, house_id, uid)
            prior = tx.get(request_path)
            if prior:
                if prior["fingerprint"] != fingerprint:
                    raise HTTPException(409, "request_id was already used with different content")
                return tx.get(f"houses/{house_id}/posts/{prior['post_id']}"), False
            state = tx.get(day_path) or new_day(day)
            if body.media_id:
                media = tx.get(f"houses/{house_id}/media/{body.media_id}")
                expected = "cutout" if body.method == "pose" else "meal"
                if not media or media["owner_id"] != uid or media["kind"] != expected:
                    raise HTTPException(422, "Missing or incompatible owned media")
            if body.voice_media_id:
                voice = tx.get(f"houses/{house_id}/media/{body.voice_media_id}")
                if not voice or voice["owner_id"] != uid or voice["kind"] != "voice":
                    raise HTTPException(422, "Missing or incompatible owned voice")
            # Ignore a departed resident's template while their deletion cleans
            # up historical records; never create a new dangling reference.
            state['poses'] = {k: p for k, p in state['poses'].items() if p['user_id'] in house['member_ids']}
            # All reads precede writes for Firestore transactions.
            first = chore not in state["poses"] and body.method == "pose"
            template = state["poses"].get(chore)
            if body.reference_post_id and (
                not template or template["post_id"] != body.reference_post_id
            ):
                raise HTTPException(409, "Pose reference changed; fetch today's pose and retry")
            if first:
                template = {
                    "user_id": uid,
                    "post_id": post_id,
                    "media_id": str(body.media_id),
                    "name": body.pose_name or "今日のオリジナルポーズ",
                    "landmarks": [p.model_dump() for p in body.landmarks],
                }
                state["poses"][chore] = template
            sync = [
                other
                for other, latest in state["latest"].get(chore, {}).items()
                if other != uid and other in house["member_ids"]
                and 0
                <= (now - datetime.fromisoformat(latest)).total_seconds()
                <= self.settings.sync_seconds
            ]
            post = {
                "id": post_id,
                "user_id": uid,
                "day": day,
                "chore": chore,
                "method": body.method,
                "created_at": now.isoformat(),
                "media_id": str(body.media_id) if body.media_id else None,
                "voice_media_id": str(body.voice_media_id) if body.voice_media_id else None,
                "duration_seconds": body.duration_seconds,
                "hits": body.hits,
                "total_beats": body.total_beats,
                "gal": body.gal,
                "similarity": body.similarity,
                "pose_template_post_id": template["post_id"] if template else None,
                "is_first_pose": first,
                "sync_with": sync,
                "reward": REWARDS[chore],
                "reactions": {},
                "praise": {
                    "text": "今日の自分、えらすぎ！小さな一歩に拍手〜✨",
                    "source": "fallback",
                },
            }
            completed = state["completed"].setdefault(uid, [])
            if chore not in completed:
                completed.append(chore)
            state["latest"].setdefault(chore, {})[uid] = now.isoformat()
            state.setdefault("activity", {})[uid] = {
                "chore": chore, "phase": "eating" if chore == "meal" else "done",
                "gal": body.gal, "at": now.isoformat(), "post_id": post_id,
            }
            state["recent"] = [
                {
                    k: post[k]
                    for k in ("id", "user_id", "chore", "created_at", "reward", "sync_with")
                }
            ] + state["recent"][:49]
            tx.set(f"houses/{house_id}/posts/{post_id}", post)
            tx.set(day_path, state)
            tx.set(request_path, {"fingerprint": fingerprint, "post_id": post_id, "user_id": uid})
            return post, True

        return self.store.atomic(run)

    def set_praise(self, house_id, post_id, praise):
        path = f"houses/{house_id}/posts/{post_id}"

        def run(tx):
            post = tx.get(path)
            if not post:
                raise HTTPException(409, "Post was removed")
            require_active(tx, post["user_id"])
            post["praise"] = praise
            tx.set(path, post)
            return post

        return self.store.atomic(run)

    def profile(self, uid, house_id, body):
        def run(tx):
            house = require_member(tx, house_id, uid)
            member = house["members"][uid]
            if body.gal is not None:
                member["gal"] = body.gal
            if body.theme is not None:
                if taken_by_other(house, uid, body.theme):
                    raise HTTPException(409, "Another resident already uses this color")
                member["theme"] = body.theme
            normalize_themes(house)
            if body.display_name is not None:
                member["display_name"] = body.display_name.strip()
            tx.set(f"houses/{house_id}", house)
            return house

        return self.store.atomic(run)

    def rename_house(self, uid, house_id, body):
        # Any member may rename the shared house.
        def run(tx):
            house = require_member(tx, house_id, uid)
            house["name"] = body.name.strip()
            tx.set(f"houses/{house_id}", house)
            return house

        return self.store.atomic(run)

    def react(self, uid, house_id, post_id, emoji):
        path = f"houses/{house_id}/posts/{post_id}"

        def run(tx):
            require_member(tx, house_id, uid)
            post = tx.get(path)
            if not post:
                raise HTTPException(404, "Post not found")
            post["reactions"][uid] = emoji
            tx.set(path, post)
            return post

        return self.store.atomic(run)


    def finish_meal(self, uid, house_id, post_id, body):
        now = self.clock()
        path = f"houses/{house_id}/posts/{post_id}"
        day_path = f"houses/{house_id}/days/{self.day(now)}"
        def run(tx):
            require_member(tx, house_id, uid)
            post = tx.get(path)
            voice = tx.get(f"houses/{house_id}/media/{body.voice_media_id}")
            state = tx.get(day_path)
            if not post or post['user_id'] != uid or post['chore'] != 'meal':
                raise HTTPException(404, "Own meal not found")
            if post['day'] != self.day(now):
                raise HTTPException(409, "This meal belongs to a previous day")
            if not voice or voice['owner_id'] != uid or voice['kind'] != 'voice':
                raise HTTPException(422, "Missing owned voice recording")
            if post.get('finished_voice_media_id'):
                if post['finished_voice_media_id'] != str(body.voice_media_id):
                    raise HTTPException(409, "This meal is already finished")
                return post
            post['finished_voice_media_id'] = str(body.voice_media_id)
            post['finished_at'] = now.isoformat()
            state = state or new_day(self.day(now))
            state.setdefault('activity', {})[uid] = {
                'chore': 'meal', 'phase': 'finished', 'gal': post['gal'],
                'at': now.isoformat(), 'post_id': post_id,
            }
            tx.set(path, post)
            tx.set(day_path, state)
            return post
        return self.store.atomic(run)
