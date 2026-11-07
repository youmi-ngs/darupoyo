from fastapi.testclient import TestClient
from src.app.main import create_app
from test_api import LOCAL, auth, house, join, upload, sound


def test_delete_account_preserves_housemates_and_removes_files_and_references():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        join(c, h)
        alice_media = upload(c, h)
        bob_media = upload(c, h, uid='bob')
        post = c.post(f'/api/houses/{h}/completions', headers=auth(), json=sound()).json()['post']
        other = c.post(f'/api/houses/{h}/completions', headers=auth('bob'), json=sound()).json()['post']
        c.put(f"/api/houses/{h}/posts/{other['id']}/reaction", headers=auth(), json={'emoji': 'heart'})
        store, media = c.app.state.store, c.app.state.media
        alice_object = store.get(f'houses/{h}/media/{alice_media}')['object_name']
        store.set('notify/alice', {'tokens': ['test']})
        assert c.delete('/api/me', headers=auth()).status_code == 204
        assert alice_object not in media.memory
        assert store.get(f'houses/{h}/posts/{post["id"]}') is None
        remaining = c.get(f'/api/houses/{h}/dashboard', headers=auth('bob')).json()
        assert remaining['house']['member_ids'] == ['bob']
        assert remaining['house']['owner_id'] == 'bob'
        assert 'alice' not in remaining['state']['completed']
        assert store.get(f'houses/{h}/posts/{other["id"]}')['reactions'] == {}
        assert store.get(f'houses/{h}/posts/{other["id"]}')['sync_with'] == []
        assert c.get(f'/api/houses/{h}/media/{bob_media}', headers=auth('bob')).status_code == 200
        assert store.get('notify/alice') is None
        assert c.get(f'/api/houses/{h}/dashboard', headers=auth()).status_code == 409
        assert c.delete('/api/me', headers=auth('bob')).status_code == 204
        assert all(path.startswith('account_deletions/') and value == {'houses': [], 'complete': True} for path, value in store.docs.items())
        assert not media.memory


def test_failed_storage_delete_can_retry_after_membership_is_removed(monkeypatch):
    with TestClient(create_app(LOCAL), raise_server_exceptions=False) as c:
        h = house(c)
        upload(c, h)
        media, store = c.app.state.media, c.app.state.store
        real_delete = media.delete
        monkeypatch.setattr(media, 'delete', lambda name: (_ for _ in ()).throw(RuntimeError('offline')))
        assert c.delete('/api/me', headers=auth()).status_code == 500
        assert store.get('account_deletions/alice')['houses'] == [h]
        assert c.post('/api/houses', headers=auth(), json={'name': 'new', 'display_name': 'a'}).status_code == 409
        assert c.get('/api/houses', headers=auth()).status_code == 409
        monkeypatch.setattr(media, 'delete', real_delete)
        assert c.delete('/api/me', headers=auth()).status_code == 204
        assert all(path.startswith('account_deletions/') and value == {'houses': [], 'complete': True} for path, value in store.docs.items()) and not media.memory


def test_anonymous_deletion_is_rejected():
    with TestClient(create_app(LOCAL)) as c:
        assert c.delete('/api/me').status_code == 401


def test_firebase_login_deleted_last_and_recent_sign_in_required(monkeypatch):
    import time
    from dataclasses import replace
    from firebase_admin import auth as firebase_auth
    with TestClient(create_app(LOCAL)) as c:
        h = house(c); upload(c, h)
        c.app.state.settings = replace(LOCAL, auth_mode='firebase')
        c.app.state.firebase = object()
        claims = {'uid': 'alice', 'auth_time': time.time() - 600}
        monkeypatch.setattr(firebase_auth, 'verify_id_token', lambda *a, **kw: claims)
        calls = []
        def delete_login(uid, **kw):
            assert not c.app.state.media.memory
            assert c.app.state.store.get(f'houses/{h}') is None
            calls.append(uid)
        monkeypatch.setattr(firebase_auth, 'delete_user', delete_login)
        assert c.delete('/api/me', headers=auth()).status_code == 401
        assert not calls and c.app.state.media.memory
        claims['auth_time'] = time.time()
        assert c.delete('/api/me', headers=auth()).status_code == 204
        assert calls == ['alice']
        # An already-authenticated, delayed request cannot recreate deleted data.
        assert c.post('/api/houses', headers=auth(), json={'name': 'late', 'display_name': 'a'}).status_code == 409

