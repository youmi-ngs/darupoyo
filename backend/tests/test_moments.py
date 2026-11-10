"""#157 #158: 「うちらのなう」 gets a gal's line and tells the other residents."""

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
    assert f"house={h}" in sent[0]["link"] and created.json()["id"] in sent[0]["link"] and "kind=moment" in sent[0]["link"]
    # bob has a device; alice shared it herself; carol has no device
    assert [m["uid"] for m in sent] == ["bob"]
    assert sent[0]["title"] == "Aliceがなうをシェアしたよ"
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


def test_a_chore_record_keeps_its_word_and_the_gal_hears_it(client):
    from tests.test_api import sound
    h = house(client)
    body = {**sound("dryer"), "caption": "  髪さらさら〜  "}
    post = client.post(f"/api/houses/{h}/completions", headers=auth(), json=body).json()["post"]
    assert post["caption"] == "髪さらさら〜"
    assert client.get(f"/api/houses/{h}/posts", headers=auth()).json()["items"][0]["caption"] == "髪さらさら〜"
    assert client.post(f"/api/houses/{h}/completions", headers=auth(), json={**sound(), "caption": "あ" * 141}).status_code == 422
    # without a word nothing changes
    assert client.post(f"/api/houses/{h}/completions", headers=auth(), json=sound()).json()["post"]["caption"] == ""
    assert "本人のひとこと「髪さらさら〜」" in gals.prompt("dryer", "reiwa", {"caption": "髪さらさら〜"})[1]


def test_the_gal_does_not_assume_the_photo_is_a_selfie():
    # #184: うちらのなう can be food, a view or a pet, so no line calls it a selfie.
    system, _ = gals.moment_prompt("reiwa", "")
    assert "自撮りを" not in system and "決めつける言葉は使わない" in system
    praise = Praise(LOCAL)
    praise.client = FakeGemini(["自撮りたすかる〜", "近況ありがと、それな"])
    assert praise.moment("reiwa", "")["text"] == "近況ありがと、それな"
    for lines in gals.MOMENT_FALLBACK.values():
        assert not any(word in line for line in lines for word in ("自撮り", "じぶん"))


def test_gemini_sees_the_photo_and_reacts_to_it_without_judging_looks():
    praise = Praise(LOCAL)
    praise.client = FakeGemini(["顔ちっちゃ", "ねこかわいすぎ、癒やされる〜"])
    out = praise.moment("reiwa", "", (b"jpeg", "image/jpeg"))
    assert out == {"text": "ねこかわいすぎ、癒やされる〜", "source": "gemini", "gal": "reiwa"}
    contents, system = praise.client.calls[0]
    assert contents[0].inline_data.mime_type == "image/jpeg" and contents[1] == "ひとこと：（なし）"
    assert "写真が添付されている" in system and "見た目の評価はせず" in system


def test_sharing_a_moment_hands_its_photo_to_the_gal(client):
    seen = []
    client.app.state.praise.moment = lambda gal, caption, photo=None: seen.append(photo) or {"text": "いいね", "source": "fallback", "gal": gal}
    h = house(client)
    photo = upload(client, h, "selfie")
    client.post(f"/api/houses/{h}/moments", headers=auth(), json={"request_id": str(uuid4()), "media_id": photo, "caption": ""})
    assert seen and seen[0][1].startswith("image/") and len(seen[0][0]) > 0


def test_darupoyo_gets_a_gentle_gal_line_that_never_pushes_the_chore():
    system, text = gals.darupoyo_prompt("kuro", "laundry", "ねむい")
    assert "洗濯" in system and "責める" in system and text == "ひとこと：ねむい"
    praise = Praise(LOCAL)
    praise.client = FakeGemini(["明日こそやろう！", "休むのも最強！ウチら味方だから"])
    assert praise.darupoyo("kuro", "laundry", "ねむい")["text"] == "休むのも最強！ウチら味方だから"
    # with a photo, Gemini sees it
    praise.client = FakeGemini(["ねこと休憩、最高じゃん"])
    out = praise.darupoyo("reiwa", "meal", "", (b"jpeg", "image/jpeg"))
    assert out["source"] == "gemini" and praise.client.calls[0][0][0].inline_data.mime_type == "image/jpeg"
    for lines in gals.DARUPOYO_FALLBACK.values():
        assert all(gals.darupoyo_acceptable(line) for line in lines)


def test_sharing_a_darupoyo_comes_back_with_the_gal_line(client):
    h = house(client)
    record = client.post(f"/api/houses/{h}/darupoyo", headers=auth(), json={"request_id": str(uuid4()), "chore": "dryer"}).json()["record"]
    assert record["praise"]["source"] == "fallback" and record["praise"]["text"]
    assert client.get(f"/api/houses/{h}/darupoyo", headers=auth()).json()["items"][0]["praise"] == record["praise"]
