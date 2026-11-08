"""Moving out of a house, and deleting a house you are the last resident of."""

from uuid import uuid4

from tests.test_api import auth, client, house, join, sound, upload  # noqa: F401 -- fixture


def test_leaving_removes_only_your_own_records_and_hands_the_house_on(client):
    h = house(client)
    assert join(client, h, "bob").status_code == 200
    base = f"/api/houses/{h}"
    mine = client.post(base + "/completions", headers=auth(), json=sound()).json()["post"]
    theirs = client.post(base + "/completions", headers=auth("bob"), json=sound()).json()["post"]
    photo = upload(client, h, "selfie")
    client.post(base + "/moments", headers=auth(), json={"request_id": str(uuid4()), "media_id": photo})

    assert client.post(base + "/leave", headers=auth()).status_code == 204
    # alice is out: she cannot see the house, and it is gone from her list
    assert client.get(base + "/dashboard", headers=auth()).status_code == 404
    assert client.get("/api/houses", headers=auth()).json()["items"] == []
    # bob keeps the house (now its owner) and his own post; alice's post, selfie and photo are gone
    home = client.get(base + "/dashboard", headers=auth("bob")).json()["house"]
    assert home["member_ids"] == ["bob"] and home["owner_id"] == "bob"
    ids = [p["id"] for p in client.get(base + "/posts", headers=auth("bob")).json()["items"]]
    assert ids == [theirs["id"]] and mine["id"] not in ids
    assert client.get(base + "/moments", headers=auth("bob")).json()["items"] == []
    assert client.get(base + "/media/" + photo, headers=auth("bob")).status_code == 404


def test_a_house_can_be_deleted_only_by_its_last_resident(client):
    h = house(client)
    join(client, h, "bob")
    base = f"/api/houses/{h}"
    client.post(base + "/completions", headers=auth(), json=sound())
    # others still live here
    assert client.delete(base, headers=auth()).status_code == 409
    assert client.delete(base, headers=auth("outsider")).status_code == 404
    assert client.post(base + "/leave", headers=auth("bob")).status_code == 204
    # alone now: the house and everything in it goes
    assert client.delete(base, headers=auth()).status_code == 204
    assert client.get(base + "/dashboard", headers=auth()).status_code == 404
    assert client.get("/api/houses", headers=auth()).json()["items"] == []
    store = client.app.state.store
    assert [p for p, _ in store.scan(f"houses/{h}/posts")] == [] and store.get(f"houses/{h}") is None


def test_the_last_resident_moving_out_takes_the_house_with_them(client):
    h = house(client)
    assert client.post(f"/api/houses/{h}/leave", headers=auth()).status_code == 204
    assert client.app.state.store.get(f"houses/{h}") is None
    assert client.post(f"/api/houses/{h}/leave", headers=auth()).status_code == 404
