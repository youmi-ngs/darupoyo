from uuid import uuid4

from fastapi.testclient import TestClient

from src.app.main import create_app
from tests.test_api import LOCAL, auth, sound, upload
from tests.test_edits import Lines
from tests.test_social import invite_into, meal, own_house


def homes(c):
    c.app.state.praise = Lines()
    a = own_house(c, "alice", "実家")
    b = own_house(c, "alice", "寮")
    invite_into(c, b, "alice", "bob")
    return a, b


def test_a_chore_record_goes_to_every_picked_house_with_its_own_photo():
    with TestClient(create_app(LOCAL)) as c:
        a, b = homes(c)
        store, media = c.app.state.store, c.app.state.media
        photo = upload(c, a)
        body = {**meal(photo), "caption": "カレー", "share_to": [b]}
        post = c.post(f"/api/houses/{a}/completions", headers=auth(), json=body).json()["post"]
        copies = post["shared_copies"]
        assert set(copies) == {a, b}
        there = c.get(f"/api/houses/{b}/posts", headers=auth("bob")).json()["items"]
        assert [p["id"] for p in there] == [copies[b]]
        copy = there[0]
        assert copy["caption"] == "カレー" and copy["praise"] == post["praise"] and copy["shared_copies"] == copies
        # its own photo: the house has its own file, readable by the people there
        assert copy["media_id"] != photo and store.get(f"houses/{b}/media/{copy['media_id']}")
        assert c.get(f"/api/houses/{b}/media/{copy['media_id']}", headers=auth("bob")).status_code == 200
        # it counts as done in that house too (the room light)
        assert c.get(f"/api/houses/{b}/dashboard", headers=auth("bob")).json()["state"]["completed"]["alice"] == ["meal"]
        # a retry does not make another copy
        c.post(f"/api/houses/{a}/completions", headers=auth(), json=body)
        assert len(c.get(f"/api/houses/{b}/posts", headers=auth("bob")).json()["items"]) == 1
        assert len([k for k in media.memory if k.startswith(f"houses/{b}/")]) == 1


def test_editing_or_deleting_one_copy_does_it_everywhere():
    with TestClient(create_app(LOCAL)) as c:
        a, b = homes(c)
        post = c.post(f"/api/houses/{a}/completions", headers=auth(), json={**sound(), "caption": "かわいた", "share_to": [b]}).json()["post"]
        copy_id = post["shared_copies"][b]
        # edit from the other house
        edited = c.patch(f"/api/houses/{b}/posts/{copy_id}", headers=auth(), json={"caption": "サラサラ"}).json()
        first = c.get(f"/api/houses/{a}/posts", headers=auth()).json()["items"][0]
        assert first["caption"] == "サラサラ" and first["praise"] == edited["praise"] == {"text": "ほめ:サラサラ", "source": "gemini"}
        assert c.app.state.praise.calls.count(("post", "サラサラ")) == 1  # one new line, shared
        c.delete(f"/api/houses/{a}/posts/{post['id']}", headers=auth())
        assert c.get(f"/api/houses/{a}/posts", headers=auth()).json()["items"] == []
        assert c.get(f"/api/houses/{b}/posts", headers=auth("bob")).json()["items"] == []
        assert "alice" not in c.get(f"/api/houses/{b}/dashboard", headers=auth("bob")).json()["state"]["completed"]


def test_moments_and_darupoyo_can_be_shared_too():
    with TestClient(create_app(LOCAL)) as c:
        a, b = homes(c)
        moment = c.post(f"/api/houses/{a}/moments", headers=auth(), json={"request_id": str(uuid4()), "media_id": upload(c, a, "selfie"), "caption": "おは", "share_to": [b]}).json()
        there = c.get(f"/api/houses/{b}/moments", headers=auth("bob")).json()["items"]
        assert [m["id"] for m in there] == [moment["shared_copies"][b]] and there[0]["praise"] == moment["praise"]
        record = c.post(f"/api/houses/{a}/darupoyo", headers=auth(), json={"request_id": str(uuid4()), "chore": "meal", "share_to": [b]}).json()["record"]
        assert [r["id"] for r in c.get(f"/api/houses/{b}/darupoyo", headers=auth("bob")).json()["items"]] == [record["shared_copies"][b]]
        assert c.get(f"/api/houses/{b}/dashboard", headers=auth("bob")).json()["state"]["darupoyo_shared"]["alice"] is True


def test_only_your_own_other_houses_can_be_picked_and_nothing_is_saved_otherwise():
    with TestClient(create_app(LOCAL)) as c:
        a, b = homes(c)
        stranger = own_house(c, "carol", "よそ")
        for bad in (a, stranger, str(uuid4())):
            assert c.post(f"/api/houses/{a}/completions", headers=auth(), json={**sound(), "share_to": [bad]}).status_code == 422
        assert c.get(f"/api/houses/{a}/posts", headers=auth()).json()["items"] == []
        # without share_to, nothing changes
        post = c.post(f"/api/houses/{a}/completions", headers=auth(), json=sound()).json()["post"]
        assert "shared_copies" not in post
