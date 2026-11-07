from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4
from PIL import Image
from fastapi.testclient import TestClient
from src.app.main import create_app
from test_api import LOCAL, auth, house, join, upload


def record(**kwargs):
    return {'request_id': str(uuid4()), 'chore': 'garbage', 'caption': '今日はそのまま。こんな日もかわいい', **kwargs}


def photo(c, h, uid='alice'):
    out = BytesIO(); Image.new('RGB', (50,60)).save(out, format='JPEG')
    return c.post(f'/api/houses/{h}/media?kind=darupoyo', headers=auth(uid), content=out.getvalue()).json()['id']


def test_record_shares_without_completion_and_retries_without_duplicates():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c); join(c,h); base = f'/api/houses/{h}'
        before = c.get(base+'/dashboard', headers=auth()).json()
        data = record(caption='  おやすみ  ')
        first = c.post(base+'/darupoyo', headers=auth(), json=data)
        assert first.status_code == 201
        assert first.json()['record']['caption'] == 'おやすみ'
        assert first.json()['record']['kind'] == 'darupoyo'
        again = c.post(base+'/darupoyo', headers=auth(), json=data).json()
        assert not again['created'] and again['record'] == first.json()['record']
        assert c.post(base+'/darupoyo', headers=auth(), json={**data,'caption':'変更'}).status_code == 409
        assert len(c.get(base+'/darupoyo', headers=auth('bob')).json()['items']) == 1
        after = c.get(base+'/dashboard', headers=auth()).json()
        assert after['lights'] == before['lights']
        assert after['happiness'] == before['happiness']
        for key in ('completed','goals','poses','recent','latest','activity'):
            assert after['state'][key] == before['state'][key]
        assert c.get(base+'/posts', headers=auth()).json()['items'] == []
        assert c.get(base+'/darupoyo', headers=auth('outsider')).status_code == 404
        assert c.post(base+'/darupoyo', headers=auth('outsider'), json=record()).status_code == 404
        assert c.get(base+'/darupoyo').status_code == 401


def test_record_validates_content_and_photo_ownership():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c); join(c,h); base = f'/api/houses/{h}'
        for fields in ({'caption':'   '},{'caption':'x'*141},{'chore':'unknown'},{'media_id':str(uuid4())}):
            assert c.post(base+'/darupoyo', headers=auth(), json=record(**fields)).status_code == 422
        wrong_kind = upload(c,h)
        other_photo = photo(c,h,'bob')
        other_house = house(c)
        other_house_photo = photo(c,other_house)
        for media_id in (wrong_kind,other_photo,other_house_photo):
            assert c.post(base+'/darupoyo', headers=auth(), json=record(media_id=media_id)).status_code == 422
        media_id = photo(c,h)
        r = c.post(base+'/darupoyo', headers=auth(), json=record(caption='',media_id=media_id))
        assert r.status_code == 201 and r.json()['record']['media_id'] == media_id


def test_day_boundary_and_paginated_history():
    now = [datetime(2026,11,7,18,59,tzinfo=UTC)]  # Nov 8 03:59 JST
    with TestClient(create_app(LOCAL, clock=lambda:now[0])) as c:
        h = house(c); base = f'/api/houses/{h}'
        r = c.post(base+'/darupoyo',headers=auth(),json=record()).json()['record']
        assert r['day'] == '2026-11-07'
        now[0] = datetime(2026,11,7,19,0,tzinfo=UTC)
        r = c.post(base+'/darupoyo',headers=auth(),json=record()).json()['record']
        assert r['day'] == '2026-11-08'
        for _ in range(29): c.post(base+'/darupoyo',headers=auth(),json=record())
        first = c.get(base+'/darupoyo',headers=auth()).json()
        second = c.get(base+'/darupoyo',params={'before':first['next_cursor']},headers=auth()).json()
        assert len(first['items']) == 30 and len(second['items']) == 1
        assert not {r['id'] for r in first['items']} & {r['id'] for r in second['items']}
        assert not second['next_cursor']


def test_account_deletion_removes_records_requests_and_photos_only_for_owner():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c); join(c,h); base = f'/api/houses/{h}'
        for uid in ('alice','bob'):
            c.post(base+'/darupoyo',headers=auth(uid),json=record(media_id=photo(c,h,uid)))
        assert c.delete('/api/me',headers=auth()).status_code == 204
        records = c.get(base+'/darupoyo',headers=auth('bob')).json()['items']
        assert len(records) == 1 and records[0]['user_id'] == 'bob'
        store = c.app.state.store
        requests = store.scan(f'houses/{h}/darupoyo_requests')
        assert len(requests) == 1 and requests[0][1]['user_id'] == 'bob'
        assert len(c.app.state.media.memory) == 1
        assert c.delete('/api/me',headers=auth('bob')).status_code == 204
        assert not store.scan(f'houses/{h}/darupoyo_records')
        assert not store.scan(f'houses/{h}/darupoyo_requests')
        assert not c.app.state.media.memory
