from uuid import uuid4

from fastapi.testclient import TestClient

from src.app.main import create_app
from tests.test_api import LOCAL, auth, house, join, sound, upload
from tests.test_social import meal


class Lines:
    """Stands in for Praise and remembers what each new line was written from."""
    def __init__(self):
        self.calls = []

    def generate(self, chore, gal="reiwa", context=None):
        self.calls.append(("post", (context or {}).get("caption")))
        return {"text": "ほめ:" + ((context or {}).get("caption") or ""), "source": "gemini"}

    def moment(self, gal, caption="", photo=None):
        self.calls.append(("moment", caption, bool(photo)))
        return {"text": "なう:" + caption, "source": "gemini", "gal": gal}

    def darupoyo(self, gal, chore, caption="", photo=None):
        self.calls.append(("darupoyo", chore, caption, bool(photo)))
        return {"text": "だる:" + caption, "source": "gemini", "gal": gal}

    def close(self):
        pass


def setup(c):
    c.app.state.praise = Lines()
    h = house(c)
    join(c, h)
    return h


def test_editing_a_post_changes_only_its_words_and_writes_the_gal_line_again():
    with TestClient(create_app(LOCAL)) as c:
        h = setup(c)
        post = c.post(f"/api/houses/{h}/completions", headers=auth(), json={**meal(upload(c, h)), "caption": "カレー"}).json()["post"]
        url = f"/api/houses/{h}/posts/{post['id']}"
        res = c.patch(url, headers=auth(), json={"caption": " オムライス "})
        assert res.status_code == 200
        edited = res.json()
        assert edited["caption"] == "オムライス" and edited["praise"]["text"] == "ほめ:オムライス" and edited["edited_at"]
        assert edited["media_id"] == post["media_id"] and edited["chore"] == "meal"
        # the same words again: no new line
        calls = len(c.app.state.praise.calls)
        c.patch(url, headers=auth(), json={"caption": "オムライス"})
        assert len(c.app.state.praise.calls) == calls
        # only the poster, only the text, only 30 characters
        assert c.patch(url, headers=auth("bob"), json={"caption": "x"}).status_code == 404
        assert c.patch(url, headers=auth(), json={"caption": "x", "chore": "dryer"}).status_code == 422
        assert c.patch(url, headers=auth(), json={"caption": "あ" * 31}).status_code == 422
        assert c.patch(f"/api/houses/{h}/posts/nope", headers=auth(), json={"caption": "x"}).status_code == 422


def test_editing_a_moment_lets_the_gal_look_at_the_photo_again():
    with TestClient(create_app(LOCAL)) as c:
        h = setup(c)
        moment = c.post(f"/api/houses/{h}/moments", headers=auth(), json={"request_id": str(uuid4()), "media_id": upload(c, h, "selfie"), "caption": "おは"}).json()
        edited = c.patch(f"/api/houses/{h}/moments/{moment['id']}", headers=auth(), json={"caption": "カフェきた"}).json()
        assert edited["caption"] == "カフェきた" and edited["praise"]["text"] == "なう:カフェきた"
        assert c.app.state.praise.calls[-1] == ("moment", "カフェきた", True)


def test_editing_darupoyo_changes_its_words_and_the_gal_answers_again():
    with TestClient(create_app(LOCAL)) as c:
        h = setup(c)
        record = c.post(f"/api/houses/{h}/darupoyo", headers=auth(), json={"request_id": str(uuid4()), "chore": "meal"}).json()["record"]
        assert record["praise"]["text"] == "だる:"  # the gal answers every だるぽよ
        edited = c.patch(f"/api/houses/{h}/darupoyo/{record['id']}", headers=auth(), json={"caption": "あした やる"}).json()
        assert edited["caption"] == "あした やる" and edited["praise"]["text"] == "だる:あした やる"


def test_deleting_a_post_takes_it_out_of_the_day_and_removes_its_photo():
    with TestClient(create_app(LOCAL)) as c:
        h = setup(c)
        store, media = c.app.state.store, c.app.state.media
        photo = upload(c, h)
        body = {**meal(photo), "caption": "カレー"}
        post = c.post(f"/api/houses/{h}/completions", headers=auth(), json=body).json()["post"]
        obj = store.get(f"houses/{h}/media/{photo}")["object_name"]
        assert c.get(f"/api/houses/{h}/dashboard", headers=auth()).json()["state"]["completed"]["alice"] == ["meal"]
        assert c.delete(f"/api/houses/{h}/posts/{post['id']}", headers=auth("bob")).status_code == 404
        assert c.delete(f"/api/houses/{h}/posts/{post['id']}", headers=auth()).json() == {"deleted": post["id"]}
        assert c.get(f"/api/houses/{h}/posts", headers=auth()).json()["items"] == []
        state = c.get(f"/api/houses/{h}/dashboard", headers=auth()).json()["state"]
        assert "alice" not in state["completed"] and state["recent"] == []
        assert obj not in media.memory and store.get(f"houses/{h}/media/{photo}") is None
        # retrying the old request does not bring it back as nothing
        again = c.post(f"/api/houses/{h}/completions", headers=auth(), json={**meal(upload(c, h)), "request_id": body["request_id"]})
        assert again.status_code in (200, 201) and again.json()["post"]["id"] != post["id"]
        assert c.delete(f"/api/houses/{h}/posts/{post['id']}", headers=auth()).status_code == 404


def test_deleting_one_of_two_records_of_a_chore_keeps_the_chore_done():
    with TestClient(create_app(LOCAL)) as c:
        h = setup(c)
        first = c.post(f"/api/houses/{h}/completions", headers=auth(), json=sound()).json()["post"]
        c.post(f"/api/houses/{h}/completions", headers=auth(), json=sound()).json()
        c.delete(f"/api/houses/{h}/posts/{first['id']}", headers=auth())
        assert c.get(f"/api/houses/{h}/dashboard", headers=auth()).json()["state"]["completed"]["alice"] == ["dryer"]


def test_deleting_moments_and_darupoyo():
    with TestClient(create_app(LOCAL)) as c:
        h = setup(c)
        store = c.app.state.store
        photo = upload(c, h, "selfie")
        moment = c.post(f"/api/houses/{h}/moments", headers=auth(), json={"request_id": str(uuid4()), "media_id": photo, "caption": ""}).json()
        c.delete(f"/api/houses/{h}/moments/{moment['id']}", headers=auth())
        assert c.get(f"/api/houses/{h}/moments", headers=auth()).json()["items"] == []
        assert store.get(f"houses/{h}/media/{photo}") is None
        record = c.post(f"/api/houses/{h}/darupoyo", headers=auth(), json={"request_id": str(uuid4()), "chore": "meal"}).json()["record"]
        dash = lambda: c.get(f"/api/houses/{h}/dashboard", headers=auth()).json()  # noqa: E731
        assert dash()["state"]["darupoyo_shared"]["alice"] is True
        c.delete(f"/api/houses/{h}/darupoyo/{record['id']}", headers=auth())
        assert c.get(f"/api/houses/{h}/darupoyo", headers=auth()).json()["items"] == []
        assert "alice" not in dash()["state"].get("darupoyo_shared", {})


def test_a_browser_on_another_origin_may_send_patch():
    from dataclasses import replace
    settings = replace(LOCAL, origins="http://127.0.0.1:5173")
    with TestClient(create_app(settings)) as c:
        res = c.options("/api/houses/x/posts/y", headers={"Origin": "http://127.0.0.1:5173", "Access-Control-Request-Method": "PATCH"})
        assert res.status_code == 200 and "PATCH" in res.headers["access-control-allow-methods"]
