from uuid import uuid4

from fastapi.testclient import TestClient
from test_api import LOCAL, auth, house, join, sound, upload

from src.app.main import create_app


def meal(media_id):
    return {"request_id": str(uuid4()), "chore": "meal", "method": "photo", "media_id": media_id}


def own_house(c, uid, name):
    r = c.post("/api/houses", headers=auth(uid), json={"name": name, "display_name": uid})
    assert r.status_code == 201
    return r.json()["id"]


def invite_into(c, h, owner, guest):
    code = c.post(f"/api/houses/{h}/invites", headers=auth(owner)).json()["token"]
    assert c.post("/api/join", headers=auth(guest), json={"token": code, "display_name": guest}).status_code == 200


def test_residents_comment_on_photos_once_and_remove_only_their_own():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        join(c, h)
        post = c.post(f"/api/houses/{h}/completions", headers=auth(), json=meal(upload(c, h))).json()["post"]
        base = f"/api/houses/{h}/posts/{post['id']}/comments"
        body = {"request_id": str(uuid4()), "text": " おいしそう！ "}
        first = c.post(base, headers=auth("bob"), json=body)
        assert first.status_code == 201
        assert [x["text"] for x in first.json()["comments"]] == ["おいしそう！"]
        # Retrying the same request does not duplicate; reusing its id for other text does not overwrite.
        assert len(c.post(base, headers=auth("bob"), json=body).json()["comments"]) == 1
        assert c.post(base, headers=auth("bob"), json={**body, "text": "別"}).status_code == 409
        assert c.post(base, headers=auth("outsider"), json={"request_id": str(uuid4()), "text": "x"}).status_code == 404
        for text in ("", "   ", "あ" * 201):
            assert c.post(base, headers=auth("bob"), json={"request_id": str(uuid4()), "text": text}).status_code == 422
        # Comments ride along with the post, so the album and timeline already have them.
        listed = c.get(f"/api/houses/{h}/posts", headers=auth()).json()["items"][0]
        assert listed["comments"][0]["user_id"] == "bob"
        cid = body["request_id"]
        assert c.delete(f"{base}/{cid}", headers=auth()).status_code == 404
        assert c.delete(f"{base}/{cid}", headers=auth("bob")).json()["comments"] == []


def test_a_photo_holds_at_most_fifty_comments():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        post = c.post(f"/api/houses/{h}/completions", headers=auth(), json=sound()).json()["post"]
        base = f"/api/houses/{h}/posts/{post['id']}/comments"
        for _ in range(50):
            assert c.post(base, headers=auth(), json={"request_id": str(uuid4()), "text": "a"}).status_code == 201
        assert c.post(base, headers=auth(), json={"request_id": str(uuid4()), "text": "a"}).status_code == 409


def test_profile_photo_uses_own_avatar_and_removes_the_replaced_file():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        join(c, h)
        store, media = c.app.state.store, c.app.state.media
        first, second = upload(c, h, "avatar"), upload(c, h, "avatar")
        assert c.put(f"/api/houses/{h}/avatar", headers=auth(), json={"media_id": upload(c, h)}).status_code == 422
        assert c.put(f"/api/houses/{h}/avatar", headers=auth(), json={"media_id": upload(c, h, "avatar", "bob")}).status_code == 422
        r = c.put(f"/api/houses/{h}/avatar", headers=auth(), json={"media_id": first})
        assert r.json()["members"]["alice"]["avatar_media_id"] == first
        # Housemates can load it like any house photo.
        assert c.get(f"/api/houses/{h}/media/{first}", headers=auth("bob")).status_code == 200
        first_object = store.get(f"houses/{h}/media/{first}")["object_name"]
        c.put(f"/api/houses/{h}/avatar", headers=auth(), json={"media_id": second})
        assert first_object not in media.memory and store.get(f"houses/{h}/media/{first}") is None
        second_object = store.get(f"houses/{h}/media/{second}")["object_name"]
        cleared = c.delete(f"/api/houses/{h}/avatar", headers=auth()).json()
        assert "avatar_media_id" not in cleared["members"]["alice"]
        assert second_object not in media.memory


def test_records_from_other_houses_are_private_until_the_owner_shares_them_in_that_house():
    with TestClient(create_app(LOCAL)) as c:
        old = house(c)                      # alice's earlier house, with carol
        invite_into(c, old, "alice", "carol")
        photo = upload(c, old)
        mine = c.post(f"/api/houses/{old}/completions", headers=auth(), json=meal(photo)).json()["post"]
        c.post(f"/api/houses/{old}/posts/{mine['id']}/comments", headers=auth("carol"), json={"request_id": str(uuid4()), "text": "秘密"})
        c.put(f"/api/houses/{old}/posts/{mine['id']}/reaction", headers=auth("carol"), json={"emoji": "heart"})
        c.post(f"/api/houses/{old}/completions", headers=auth("carol"), json=sound())
        selfie = upload(c, old, "selfie")
        unpublished = upload(c, old)
        new = own_house(c, "bob", "新居")
        invite_into(c, new, "bob", "alice")
        url = f"/api/houses/{new}/members/alice/history"

        own = c.get(url, headers=auth())
        assert own.status_code == 200 and own.json()["shared"] is False
        items = own.json()["items"]
        assert [p["id"] for p in items] == [mine["id"]]          # only alice's own posts
        assert items[0]["source_house_id"] == old
        assert not {"comments", "reactions", "sync_with", "user_id"} & set(items[0])
        assert c.get(url, headers=auth("bob")).status_code == 403
        assert c.get(f"/api/houses/{new}/members/alice/history/{old}/media/{photo}", headers=auth("bob")).status_code == 403

        assert c.put(f"/api/houses/{new}/history-sharing", headers=auth(), json={"enabled": True}).status_code == 200
        assert [p["id"] for p in c.get(url, headers=auth("bob")).json()["items"]] == [mine["id"]]
        assert c.get(f"/api/houses/{new}/members/alice/history/{old}/media/{photo}", headers=auth("bob")).status_code == 200
        assert c.get(f"/api/houses/{new}/members/alice/history/{old}/media/{unpublished}", headers=auth("bob")).status_code == 404
        # Only record media travels; selfies and outsiders stay out.
        assert c.get(f"/api/houses/{new}/members/alice/history/{old}/media/{selfie}", headers=auth("bob")).status_code == 404
        assert c.get(url, headers=auth("carol")).status_code == 404
        assert c.get(f"/api/houses/{new}/members/carol/history", headers=auth("bob")).status_code == 404
        # Sharing in one house does not share in another.
        assert c.get(f"/api/houses/{old}/members/alice/history", headers=auth("carol")).status_code == 403

        c.put(f"/api/houses/{new}/history-sharing", headers=auth(), json={"enabled": False})
        assert c.get(url, headers=auth("bob")).status_code == 403


def test_account_deletion_removes_comments_profile_photo_and_sharing():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        join(c, h)
        store, media = c.app.state.store, c.app.state.media
        post = c.post(f"/api/houses/{h}/completions", headers=auth(), json=sound()).json()["post"]
        base = f"/api/houses/{h}/posts/{post['id']}/comments"
        c.post(base, headers=auth("bob"), json={"request_id": str(uuid4()), "text": "bob"})
        c.post(base, headers=auth(), json={"request_id": str(uuid4()), "text": "alice"})
        avatar = upload(c, h, "avatar", "bob")
        c.put(f"/api/houses/{h}/avatar", headers=auth("bob"), json={"media_id": avatar})
        c.put(f"/api/houses/{h}/history-sharing", headers=auth("bob"), json={"enabled": True})
        avatar_object = store.get(f"houses/{h}/media/{avatar}")["object_name"]
        assert c.delete("/api/me", headers=auth("bob")).status_code == 204
        assert [x["text"] for x in store.get(f"houses/{h}/posts/{post['id']}")["comments"]] == ["alice"]
        assert avatar_object not in media.memory
        assert "bob" not in store.get(f"houses/{h}")["members"]


def test_history_paginates_own_records_without_housemates_hiding_older_entries():
    with TestClient(create_app(LOCAL)) as c:
        old = house(c); new = house(c)
        store = c.app.state.store
        for i in range(205):
            pid = f"20261107T120000{i:06d}_" + 'a'*32
            store.set(f"houses/{old}/posts/{pid}", {"id":pid,"user_id":"alice","chore":"dryer"})
        for i in range(220):
            pid = f"20261108T120000{i:06d}_" + 'b'*32
            store.set(f"houses/{old}/posts/{pid}", {"id":pid,"user_id":"bob","chore":"dryer"})
        url = f"/api/houses/{new}/members/alice/history"
        first = c.get(url,headers=auth()).json()
        assert len(first['items']) == 200 and first['next_cursor']
        second = c.get(url,headers=auth(),params={'before':first['next_cursor']}).json()
        assert len(second['items']) == 5 and second['next_cursor'] is None
        assert not {p['id'] for p in first['items']} & {p['id'] for p in second['items']}


def test_replaced_avatar_cannot_be_reselected_during_file_cleanup(monkeypatch):
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        first, second = upload(c,h,'avatar'), upload(c,h,'avatar')
        endpoint = f'/api/houses/{h}/avatar'
        c.put(endpoint,headers=auth(),json={'media_id':first})
        media = c.app.state.media
        original = media.delete
        attempted = []
        def interleaved_delete(name):
            attempted.append(c.put(endpoint,headers=auth(),json={'media_id':first}).status_code)
            original(name)
        monkeypatch.setattr(media,'delete',interleaved_delete)
        result = c.put(endpoint,headers=auth(),json={'media_id':second})
        assert result.status_code == 200 and attempted == [422]
        assert c.get(f'/api/houses/{h}/dashboard',headers=auth()).json()['house']['members']['alice']['avatar_media_id'] == second
        assert c.get(f'/api/houses/{h}/media/{second}',headers=auth()).status_code == 200


def test_each_resident_gets_a_color_nobody_else_in_the_house_uses():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        for uid in ("bob", "carol"):
            invite_into(c, h, "alice", uid)
        members = c.get(f"/api/houses/{h}/dashboard", headers=auth()).json()["house"]["members"]
        assert [members[u]["theme"] for u in ("alice", "bob", "carol")] == ["pink", "cyan", "lilac"]
        # A color in use is refused; a free one of the 16 is fine.
        assert c.put(f"/api/houses/{h}/profile", headers=auth("bob"), json={"theme": "pink"}).status_code == 409
        assert c.put(f"/api/houses/{h}/profile", headers=auth("bob"), json={"theme": "cocoa"}).status_code == 200
        assert c.put(f"/api/houses/{h}/profile", headers=auth("bob"), json={"theme": "rainbow"}).status_code == 422
        # An older house where two residents share a color: the earlier resident keeps it.
        store = c.app.state.store
        doc = store.get(f"houses/{h}")
        doc["members"]["carol"]["theme"] = "pink"
        store.set(f"houses/{h}", doc)
        c.put(f"/api/houses/{h}/profile", headers=auth("carol"), json={"display_name": "キャロル"})
        members = c.get(f"/api/houses/{h}/dashboard", headers=auth()).json()["house"]["members"]
        assert members["alice"]["theme"] == "pink" and members["carol"]["theme"] not in ("pink", "cocoa")


def test_moments_and_darupoyo_take_comments_like_chore_posts():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        join(c, h)
        moment = c.post(f"/api/houses/{h}/moments", headers=auth(),
                        json={"request_id": str(uuid4()), "media_id": upload(c, h, "selfie"), "caption": "おは"}).json()
        record = c.post(f"/api/houses/{h}/darupoyo", headers=auth(),
                        json={"request_id": str(uuid4()), "chore": "meal"}).json()["record"]
        for kind, rid, listing in (("moments", moment["id"], "moments"), ("darupoyo", record["id"], "darupoyo")):
            base = f"/api/houses/{h}/{kind}/{rid}/comments"
            body = {"request_id": str(uuid4()), "text": " えらい！ "}
            first = c.post(base, headers=auth("bob"), json=body)
            assert first.status_code == 201
            assert [x["text"] for x in first.json()["comments"]] == ["えらい！"]
            assert len(c.post(base, headers=auth("bob"), json=body).json()["comments"]) == 1
            assert c.post(base, headers=auth("outsider"), json={"request_id": str(uuid4()), "text": "x"}).status_code == 404
            assert c.post(f"/api/houses/{h}/{kind}/nope/comments", headers=auth("bob"), json=body).status_code == 422
            # the comment rides along in the listing
            assert c.get(f"/api/houses/{h}/{listing}", headers=auth()).json()["items"][0]["comments"][0]["user_id"] == "bob"
            assert c.delete(f"{base}/{body['request_id']}", headers=auth()).status_code == 404
            assert c.delete(f"{base}/{body['request_id']}", headers=auth("bob")).json()["comments"] == []


def test_account_deletion_removes_comments_on_moments_and_darupoyo():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        join(c, h)
        store = c.app.state.store
        moment = c.post(f"/api/houses/{h}/moments", headers=auth(),
                        json={"request_id": str(uuid4()), "media_id": upload(c, h, "selfie"), "caption": ""}).json()
        record = c.post(f"/api/houses/{h}/darupoyo", headers=auth(),
                        json={"request_id": str(uuid4()), "chore": "meal"}).json()["record"]
        c.post(f"/api/houses/{h}/moments/{moment['id']}/comments", headers=auth("bob"), json={"request_id": str(uuid4()), "text": "bob"})
        c.post(f"/api/houses/{h}/darupoyo/{record['id']}/comments", headers=auth("bob"), json={"request_id": str(uuid4()), "text": "bob"})
        assert c.delete("/api/me", headers=auth("bob")).status_code == 204
        assert store.get(f"houses/{h}/moments/{moment['id']}")["comments"] == []
        kept = store.get(f"houses/{h}/darupoyo_records/{record['id']}")
        assert kept["comments"] == [] and "sync_with" not in kept


def test_moments_and_darupoyo_take_reactions_too():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        join(c, h)
        moment = c.post(f"/api/houses/{h}/moments", headers=auth(), json={"request_id": str(uuid4()), "media_id": upload(c, h, "selfie"), "caption": ""}).json()
        record = c.post(f"/api/houses/{h}/darupoyo", headers=auth(), json={"request_id": str(uuid4()), "chore": "meal"}).json()["record"]
        for kind, rid, listing in (("moments", moment["id"], "moments"), ("darupoyo", record["id"], "darupoyo")):
            url = f"/api/houses/{h}/{kind}/{rid}/reaction"
            assert c.put(url, headers=auth("bob"), json={"emoji": "heart"}).json()["reactions"] == {"bob": "heart"}
            assert c.put(url, headers=auth("bob"), json={"emoji": "clap"}).json()["reactions"] == {"bob": "clap"}
            assert c.put(url, headers=auth("outsider"), json={"emoji": "heart"}).status_code == 404
            assert c.put(url, headers=auth("bob"), json={"emoji": "poop"}).status_code == 422
            assert c.get(f"/api/houses/{h}/{listing}", headers=auth()).json()["items"][0]["reactions"] == {"bob": "clap"}
        # leaving clears your reactions on others' records
        c.delete("/api/me", headers=auth("bob"))
        assert c.app.state.store.get(f"houses/{h}/moments/{moment['id']}")["reactions"] == {}
        assert c.app.state.store.get(f"houses/{h}/darupoyo_records/{record['id']}")["reactions"] == {}
