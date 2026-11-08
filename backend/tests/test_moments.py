"""#157 #158: 「みんなの今」 gets a gal's line and tells the other residents."""

from uuid import uuid4

from src.app import gals, notify
from src.app.services import Praise
from tests.test_api import LOCAL, auth, client, house, join, upload  # noqa: F401 -- fixture


def share(c, h, caption="カフェきた", uid="alice", request_id=None):
    body = {"request_id": request_id or str(uuid4()), "media_id": upload(c, h, "selfie", uid), "caption": caption}
    return c.post(f"/api/houses/{h}/moments", headers=auth(uid), json=body), body


def test_a_shared_moment_gets_a_line_from_the_gal_the_resident_picked(client):
    h = house(client)
    assert client.put(f"/api/houses/{h}/profile", headers=auth(), json={"gal": "hime"}).status_code == 200
    created, body = share(client, h)
    assert created.status_code == 201
    praise = created.json()["praise"]
    assert praise["gal"] == "hime" and praise["source"] == "fallback" and praise["text"] in gals.MOMENT_FALLBACK["hime"]
    # the line is stored with the moment, and a retry neither changes it nor notifies again
    listed = client.get(f"/api/houses/{h}/moments", headers=auth()).json()["items"]
    assert listed[0]["praise"] == praise
    again = client.post(f"/api/houses/{h}/moments", headers=auth(), json=body)
    assert again.json()["praise"] == praise


def test_ノリで_picks_one_of_the_gals(client):
    h = house(client)
    client.put(f"/api/houses/{h}/profile", headers=auth(), json={"gal": "random"})
    assert share(client, h)[0].json()["praise"]["gal"] in gals.GALS


def test_other_residents_with_a_device_hear_about_a_moment(client):
    h = house(client)
    join(client, h, "bob"), join(client, h, "carol")
    for uid in ("alice", "bob"):
        client.put("/api/notifications", headers=auth(uid), json={"token": uid * 20, "gal": "reiwa"})
    sent = client.app.state.notify.sent
    sent.clear()
    created, body = share(client, h)
    assert created.status_code == 201
    # bob has a device; alice shared it herself; carol has no device
    assert [m["uid"] for m in sent] == ["bob"]
    assert sent[0]["title"] == "Aliceが今をシェアしたよ"
    assert sent[0]["body"] in [line.format(name="Alice") for line in notify.MOMENT_FALLBACK["reiwa"]]
    sent.clear()
    client.post(f"/api/houses/{h}/moments", headers=auth(), json=body)  # a retry
    assert sent == []


class FakeGemini:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []
        self.models = self

    def generate_content(self, model, contents, config):
        self.calls.append((contents, config.system_instruction))
        return type("R", (), {"text": self.replies.pop(0)})()


def test_gemini_reads_only_the_caption_and_a_line_about_looks_is_not_used():
    praise = Praise(LOCAL)
    praise.client = FakeGemini(["顔かわいすぎ♡", "カフェ時間、最高すぎ♡"])
    out = praise.moment("hime", "カフェきた")
    assert out == {"text": "カフェ時間、最高すぎ♡", "source": "gemini", "gal": "hime"}
    contents, system = praise.client.calls[0]
    assert contents == "ひとこと：カフェきた" and "写真は見えていない" in system and "姫ギャル" in system
    # two rule-breaking lines fall back to a fixed one
    praise.client = FakeGemini(["メイクいいね", "服かわいい"])
    assert praise.moment("kuro", "")["source"] == "fallback"
    assert praise.client.calls[0][0] == "ひとこと：（なし）"
