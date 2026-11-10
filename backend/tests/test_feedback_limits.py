from uuid import uuid4
import pytest
from pydantic import ValidationError
from src.app.models import HouseCreate, HouseUpdate, Profile, Join, Moment, Completion
from src.app.darupoyo import DarupoyoRecord

@pytest.mark.parametrize('symbol', ['あ', 'a', '👨‍👩‍👧‍👦', 'か\u3099', '🇯🇵'])
def test_name_boundaries(symbol):
    HouseCreate(name=symbol * 20, display_name=symbol * 12)
    for model, field, limit, other in [
        (HouseCreate, 'name', 20, {'display_name':'a'}),
        (HouseCreate, 'display_name', 12, {'name':'a'}),
        (HouseUpdate, 'name', 20, {}),
        (Profile, 'display_name', 12, {}),
        (Join, 'display_name', 12, {'token':'ABCDEFGH'}),
    ]:
        with pytest.raises(ValidationError): model(**other, **{field:symbol * (limit+1)})

@pytest.mark.parametrize('model,extra', [
    (Moment, {'media_id':uuid4()}),
    (DarupoyoRecord, {'chore':'meal'}),
    (Completion, {'chore':'dryer','method':'sound','duration_seconds':10}),
])
def test_all_post_types_use_visible_30_characters(model, extra):
    for text in ['', 'あ'*30, '👨‍👩‍👧‍👦'*30]:
        assert model(request_id=uuid4(),caption=text,**extra).caption == text
    with pytest.raises(ValidationError):
        model(request_id=uuid4(),caption='👨‍👩‍👧‍👦'*31,**extra)
