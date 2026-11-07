from datetime import UTC, datetime, timedelta
from uuid import uuid4
from fastapi.testclient import TestClient
from src.app.main import create_app
from test_api import LOCAL, auth, house, join, upload


def test_meal_finish_is_owned_idempotent_and_updates_shared_state():
    now = [datetime(2026, 11, 7, 10, 0, tzinfo=UTC)]
    with TestClient(create_app(LOCAL, clock=lambda: now[0])) as c:
        h = house(c); join(c, h)
        photo = upload(c, h)
        post = c.post(f'/api/houses/{h}/completions', headers=auth(), json={
            'request_id': str(uuid4()), 'chore':'meal', 'method':'photo', 'media_id':photo, 'gal':'hime',
        }).json()['post']
        voice = c.post(f'/api/houses/{h}/media?kind=voice', headers=auth(), content=b'\x1a\x45\xdf\xa3' + b'0' * 300).json()['id']
        path = f'/api/houses/{h}/posts/{post["id"]}/meal-finish'
        assert c.put(path, headers=auth('bob'), json={'voice_media_id':voice}).status_code == 404
        assert c.put(path, headers=auth(), json={'voice_media_id':photo}).status_code == 422
        assert c.put(path, headers=auth(), json={'voice_media_id':voice}).status_code == 200
        again = c.put(path, headers=auth(), json={'voice_media_id':voice})
        assert again.status_code == 200
        assert again.json()['media_id'] == photo
        dashboard = c.get(f'/api/houses/{h}/dashboard', headers=auth('bob')).json()
        assert dashboard['state']['activity']['alice']['phase'] == 'finished'
        assert dashboard['state']['activity']['alice']['gal'] == 'hime'
        assert dashboard['state']['completed']['alice'] == ['meal']
        assert len(c.get(f'/api/houses/{h}/posts', headers=auth()).json()['items']) == 1
        now[0] += timedelta(days=1)
        assert c.put(path, headers=auth(), json={'voice_media_id':voice}).status_code == 409
        assert c.get(f'/api/houses/{h}/dashboard', headers=auth()).json()['state']['activity'] == {}
