from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from src.app.config import Settings
from src.app.domain import Domain
from src.app.main import create_app
from src.app.models import Completion, HouseCreate, Join
from src.app.services import Praise
from src.app.store import MemoryStore

LOCAL = Settings(app_env="test", data_backend="memory", auth_mode="dev")


def test_rhythm_profile_and_public_config(client):
    h = house(client)
    base = f"/api/houses/{h}"
    body = {
        "request_id": str(uuid4()),
        "chore": "laundry",
        "method": "rhythm",
        "hits": 4,
        "total_beats": 8,
        "duration_seconds": 7,
        "gal": "hime",
    }
    result = client.post(base + "/completions", headers=auth(), json=body)
    assert result.status_code == 200
    assert result.json()["post"]["hits"] == 4
    assert result.json()["post"]["gal"] == "hime"
    assert client.post(base + "/completions", headers=auth(), json=body).json()["created"] is False
    for invalid in ({"hits": 9}, {"duration_seconds": 4}, {"hits": 0}, {"method": "sound"}):
        assert (
            client.post(base + "/completions", headers=auth(), json={**body, **invalid}).status_code
            == 422
        )
    assert client.put(base + "/profile", headers=auth(), json={"theme": "mint"}).status_code == 200
    assert (
        client.get(base + "/dashboard", headers=auth()).json()["house"]["members"]["alice"]["theme"]
        == "mint"
    )
    assert (
        client.put(base + "/profile", headers=auth("outsider"), json={"theme": "pink"}).status_code
        == 404
    )
    assert set(client.get("/api/config").json()) == {"auth_mode", "data_backend", "timezone", "firebase"}


def auth(uid="alice"):
    return {"Authorization": f"Bearer dev:{uid}"}


@pytest.fixture
def client():
    with TestClient(create_app(LOCAL)) as c:
        yield c


def house(c):
    r = c.post("/api/houses", headers=auth(), json={"name": "温玉ハウス", "display_name": "Alice"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def join(c, h, uid="bob"):
    invite = c.post(f"/api/houses/{h}/invites", headers=auth()).json()["token"]
    return c.post("/api/join", headers=auth(uid), json={"token": invite, "display_name": uid})


def sound(chore="dryer"):
    return {"request_id": str(uuid4()), "chore": chore, "method": "sound", "duration_seconds": 10}


def image_bytes(cutout=False):
    im = Image.new(
        "RGBA" if cutout else "RGB", (4, 4), (10, 20, 30, 255) if cutout else (10, 20, 30)
    )
    if cutout:
        im.putpixel((0, 0), (0, 0, 0, 0))
    out = BytesIO()
    im.save(out, format="PNG")
    return out.getvalue()


def upload(c, h, kind="meal", uid="alice"):
    r = c.post(
        f"/api/houses/{h}/media?kind={kind}",
        headers=auth(uid),
        content=image_bytes(kind == "cutout"),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_health_auth_and_legacy_removed(client):
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/api/healthz").json() == {"status": "ok"}
    assert client.get("/api/houses").status_code == 401
    assert client.get("/api/houses", headers={"Authorization": "Bearer garbage"}).status_code == 401
    assert client.post("/api/input", json={}).status_code == 404
    assert client.get("/api/me", headers=auth()).json() == {"uid": "alice"}


def test_group_capacity_and_idempotent_join(client):
    h = house(client)
    for uid in ["b", "c", "d", "e", "f"]:
        assert join(client, h, uid).status_code == 200
    assert join(client, h, "g").status_code == 409
    assert join(client, h, "b").status_code == 200
    assert len(client.get("/api/houses", headers=auth("b")).json()["items"]) == 1
    assert client.get("/api/houses", headers=auth("g")).json()["items"] == []


def test_outsider_cannot_access_or_mutate(client):
    h = house(client)
    for path in ["dashboard", "posts"]:
        assert client.get(f"/api/houses/{h}/{path}", headers=auth("outsider")).status_code == 404
    assert (
        client.post(
            f"/api/houses/{h}/completions", headers=auth("outsider"), json=sound()
        ).status_code
        == 404
    )
    assert client.post(f"/api/houses/{h}/invites", headers=auth("outsider")).status_code == 404
    assert (
        client.put(
            f"/api/houses/{h}/goals", headers=auth("outsider"), json={"chores": []}
        ).status_code
        == 404
    )


def test_completion_retry_sync_reactions_and_pagination(client):
    h = house(client)
    join(client, h)
    data = sound()
    a = client.post(f"/api/houses/{h}/completions", headers=auth(), json=data).json()
    retry = client.post(f"/api/houses/{h}/completions", headers=auth(), json=data).json()
    assert a["created"] and not retry["created"]
    assert a["post"]["id"] == retry["post"]["id"]
    conflict = {**data, "duration_seconds": 11}
    assert (
        client.post(f"/api/houses/{h}/completions", headers=auth(), json=conflict).status_code
        == 409
    )
    b = client.post(f"/api/houses/{h}/completions", headers=auth("bob"), json=sound()).json()[
        "post"
    ]
    assert b["sync_with"] == ["alice"]
    dashboard = client.get(f"/api/houses/{h}/dashboard", headers=auth()).json()
    assert dashboard["lights"] == {"alice": True, "bob": True}
    assert dashboard["happiness"] == 100
    post_id = a["post"]["id"]
    reaction = client.put(
        f"/api/houses/{h}/posts/{post_id}/reaction", headers=auth("bob"), json={"emoji": "clap"}
    )
    assert reaction.status_code == 200
    assert reaction.json()["reactions"] == {"bob": "clap"}
    first = client.get(f"/api/houses/{h}/posts?limit=1", headers=auth()).json()
    second = client.get(
        f"/api/houses/{h}/posts", params={"before": first["next_cursor"]}, headers=auth()
    ).json()
    assert len(second["items"]) == 1
    assert second["items"][0]["id"] != first["items"][0]["id"]


def test_goals_are_optional(client):
    h = house(client)
    assert (
        client.put(f"/api/houses/{h}/goals", headers=auth(), json={"chores": []}).status_code == 200
    )
    assert (
        client.post(f"/api/houses/{h}/completions", headers=auth(), json=sound()).status_code == 200
    )


@pytest.mark.parametrize(
    "body",
    [
        {**sound(), "duration_seconds": 9},
        {**sound(), "user_id": "someone-else"},
        {**sound(), "chore": "garbage"},
        {"request_id": str(uuid4()), "chore": "meal", "method": "photo_voice", "itadakimasu": True},
    ],
)
def test_invalid_evidence(client, body):
    assert (
        client.post(
            f"/api/houses/{house(client)}/completions", headers=auth(), json=body
        ).status_code
        == 422
    )


def test_meals_repeat_and_media_is_private(client):
    h = house(client)
    join(client, h)
    media_id = upload(client, h)
    body = {
        "request_id": str(uuid4()),
        "chore": "meal",
        "method": "photo_voice",
        "media_id": media_id,
        "itadakimasu": True,
    }
    for _ in range(2):
        body["request_id"] = str(uuid4())
        assert (
            client.post(f"/api/houses/{h}/completions", headers=auth(), json=body).status_code
            == 200
        )
    assert (
        client.post(f"/api/houses/{h}/completions", headers=auth("bob"), json=body).status_code
        == 422
    )
    assert client.get(f"/api/houses/{h}/media/{media_id}", headers=auth("bob")).status_code == 200
    assert client.get(f"/api/houses/{h}/media/{media_id}", headers=auth("eve")).status_code == 404


def test_image_validation_and_request_limits(client):
    h = house(client)
    assert (
        client.post(
            f"/api/houses/{h}/media?kind=cutout", headers=auth(), content=image_bytes()
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/houses/{h}/media?kind=meal", headers=auth(), content=b"not an image"
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/houses/{h}/media?kind=meal", headers=auth(), content=b"x" * (5 * 1024 * 1024 + 1)
        ).status_code
        == 413
    )
    assert client.post("/api/houses", headers=auth(), content=b"x" * 65537).status_code == 413


def test_first_pose_concurrent_and_reference_guard(client):
    h = house(client)
    join(client, h)
    media = {u: upload(client, h, "cutout", u) for u in ("alice", "bob")}

    def submit(u):
        body = Completion(
            request_id=uuid4(),
            chore="garbage",
            method="pose",
            media_id=media[u],
            landmarks=[{"x": 0.1, "y": 0.2, "z": 0, "visibility": 1}] * 33,
        )
        return client.app.state.domain.complete(u, h, body)[0]

    with ThreadPoolExecutor(max_workers=2) as pool:
        posts = list(pool.map(submit, ["alice", "bob"]))
    assert sum(p["is_first_pose"] for p in posts) == 1
    assert len({p["pose_template_post_id"] for p in posts}) == 1
    with pytest.raises(HTTPException) as e:
        client.app.state.domain.complete(
            "alice",
            h,
            Completion(
                request_id=uuid4(),
                chore="garbage",
                method="pose",
                media_id=media["alice"],
                landmarks=[{"x": 0, "y": 0, "z": 0, "visibility": 1}] * 33,
                reference_post_id="wrong",
                similarity=90,
            ),
        )
    assert e.value.status_code == 409


def test_midnight_reset_and_expired_invitation():
    now = [datetime(2026, 11, 5, 14, 59, tzinfo=UTC)]
    domain = Domain(MemoryStore(), LOCAL, clock=lambda: now[0])
    h = domain.create_house("alice", HouseCreate(name="home", display_name="a"))["id"]
    token = domain.invite("alice", h)["token"]
    domain.complete("alice", h, Completion(**sound()))
    assert domain.dashboard("alice", h)["lights"]["alice"]
    now[0] += timedelta(minutes=2)
    assert not domain.dashboard("alice", h)["lights"]["alice"]
    assert domain.dashboard("alice", h, "2026-11-05")["lights"]["alice"]
    now[0] += timedelta(days=8)
    with pytest.raises(HTTPException) as e:
        domain.join("bob", Join(token=token, display_name="b"))
    assert e.value.status_code == 404


def test_same_request_concurrent():
    store = MemoryStore()
    d = Domain(store, LOCAL)
    h = d.create_house("a", HouseCreate(name="home", display_name="a"))["id"]
    body = Completion(**sound())
    with ThreadPoolExecutor(max_workers=6) as pool:
        responses = list(pool.map(lambda _: d.complete("a", h, body), range(12)))
    assert sum(created for _, created in responses) == 1
    assert len(store.list(f"houses/{h}/posts")) == 1


def test_production_cannot_enable_dev_mode(monkeypatch):
    with pytest.raises(ValueError):
        replace(LOCAL, app_env="production").validate()
    monkeypatch.setenv("K_SERVICE", "deployed")
    with pytest.raises(ValueError):
        LOCAL.validate()


def test_firebase_invalid_token_rejected(client, monkeypatch):
    from firebase_admin import auth as firebase_auth

    client.app.state.settings = replace(LOCAL, auth_mode="firebase")
    client.app.state.firebase = object()

    def invalid(*args, **kwargs):
        raise firebase_auth.InvalidIdTokenError("invalid")

    monkeypatch.setattr(firebase_auth, "verify_id_token", invalid)
    assert client.get("/api/me", headers=auth()).status_code == 401


def test_praise_provider_failure_keeps_positive_fallback():
    p = Praise(LOCAL)

    class Broken:
        def generate_content(self, **kwargs):
            raise RuntimeError("provider down")

    class Client:
        models = Broken()

    p.client = Client()
    assert p.generate("dryer")["source"] == "fallback"


def test_cors_is_exact(client):
    good = client.options(
        "/api/houses",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert good.headers["access-control-allow-origin"] == "http://localhost:5173"
    bad = client.options(
        "/api/houses",
        headers={"Origin": "https://attacker.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in bad.headers


def test_firebase_team_mode_uses_verified_identity_with_memory_data(client, monkeypatch):
    from firebase_admin import auth as firebase_auth

    config = replace(LOCAL, auth_mode="firebase", project="darupoyo-ontama")
    config.validate()
    client.app.state.settings = config
    client.app.state.firebase = object()
    seen = []

    def verify(token, *, app, check_revoked):
        seen.append((token, check_revoked))
        if token != "test-google-token":
            raise firebase_auth.InvalidIdTokenError("invalid")
        return {"uid": "google-user"}

    monkeypatch.setattr(firebase_auth, "verify_id_token", verify)
    public_config = client.get("/api/config").json()
    assert public_config["auth_mode"] == "firebase"
    assert public_config["data_backend"] == "memory"
    assert client.get("/api/houses", headers=auth()).status_code == 401
    headers = {"Authorization": "Bearer test-google-token"}
    response = client.post("/api/houses", headers=headers,
                           json={"name": "Team", "display_name": "Tester"})
    assert response.status_code == 201
    assert response.json()["member_ids"] == ["google-user"]
    assert len(client.get("/api/houses", headers=headers).json()["items"]) == 1
    assert all(check_revoked for _, check_revoked in seen)
    with pytest.raises(ValueError):
        replace(config, app_env="production").validate()
