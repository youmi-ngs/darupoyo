from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_api import LOCAL, auth, house, join, upload

from src.app import weather
from src.app.main import create_app

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 400


class FakeGemini:
    """Stands in for Praise: answers the いただきます question from a fixed script."""
    def __init__(self, answers):
        self.answers, self.calls = list(answers), []
        self.settings = SimpleNamespace(model="test-model")
        self.client = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

    def _generate(self, model, contents, config):
        self.calls.append(contents[0].inline_data.mime_type)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return SimpleNamespace(text='{"heard": %s}' % ("true" if answer else "false"))

    def generate(self, chore, gal="reiwa", context=None):
        return {"text": "えらい", "source": "fallback"}

    def close(self):
        pass


def meal(c, h, voice, uid="alice"):
    return c.post(f"/api/houses/{h}/completions", headers=auth(uid), json={
        "request_id": str(uuid4()), "chore": "meal", "method": "photo_voice",
        "media_id": upload(c, h, uid=uid), "voice_media_id": voice, "itadakimasu": True,
    })


def test_a_meal_counts_with_voice_only_after_gemini_hears_itadakimasu():
    gemini = FakeGemini([False, True, RuntimeError("offline")])
    with TestClient(create_app(LOCAL, praise=gemini)) as c:
        h = house(c)
        join(c, h)
        quiet = c.post(f"/api/houses/{h}/media?kind=voice", headers=auth(), content=WEBM).json()["id"]
        said = c.post(f"/api/houses/{h}/media?kind=voice", headers=auth(), content=WEBM).json()["id"]
        # Unchecked or not heard: refused.
        assert meal(c, h, said).status_code == 422
        assert c.post(f"/api/houses/{h}/media/{quiet}/itadakimasu", headers=auth()).json() == {"heard": False}
        assert meal(c, h, quiet).status_code == 422
        assert c.post(f"/api/houses/{h}/media/{said}/itadakimasu", headers=auth()).json() == {"heard": True}
        assert meal(c, h, said).status_code == 200
        # The answer is kept: asking again does not call Gemini again.
        assert c.post(f"/api/houses/{h}/media/{said}/itadakimasu", headers=auth()).json() == {"heard": True}
        assert gemini.calls == ["audio/webm", "audio/webm"]
        # Only the owner can have their recording checked; a photo is not a recording.
        assert c.post(f"/api/houses/{h}/media/{said}/itadakimasu", headers=auth("bob")).status_code == 404
        assert c.post(f"/api/houses/{h}/media/{upload(c, h)}/itadakimasu", headers=auth()).status_code == 404
        # A failed check can be retried and leaks no details.
        third = c.post(f"/api/houses/{h}/media?kind=voice", headers=auth(), content=WEBM).json()["id"]
        failed = c.post(f"/api/houses/{h}/media/{third}/itadakimasu", headers=auth())
        assert failed.status_code == 503 and "offline" not in failed.text
        # A photo_voice meal without a recording is no longer accepted.
        body = {"request_id": str(uuid4()), "chore": "meal", "method": "photo_voice", "media_id": upload(c, h), "itadakimasu": True}
        assert c.post(f"/api/houses/{h}/completions", headers=auth(), json=body).status_code == 422


def test_without_a_model_recordings_pass_locally_but_not_in_production():
    with TestClient(create_app(LOCAL)) as c:
        h = house(c)
        voice = c.post(f"/api/houses/{h}/media?kind=voice", headers=auth(), content=WEBM).json()["id"]
        assert c.post(f"/api/houses/{h}/media/{voice}/itadakimasu", headers=auth()).json() == {"heard": True}
        c.app.state.settings = replace(LOCAL, app_env="production")
        other = c.post(f"/api/houses/{h}/media?kind=voice", headers=auth(), content=WEBM).json()["id"]
        assert c.post(f"/api/houses/{h}/media/{other}/itadakimasu", headers=auth()).status_code == 503


@pytest.mark.parametrize("condition,expected", [
    ("CLEAR", "clear"), ("MOSTLY_CLEAR", "clear"), ("PARTLY_CLOUDY", "cloudy"), ("CLOUDY", "cloudy"),
    ("LIGHT_RAIN", "rain"), ("SCATTERED_SHOWERS", "rain"), ("THUNDERSTORM", "rain"),
    ("LIGHT_SNOW", "snow"), ("RAIN_AND_SNOW", "snow"), ("HAIL", "snow"), (None, "clear"),
])
def test_google_conditions_map_to_the_four_skies(condition, expected):
    assert weather.kind(condition) == expected


def test_weather_needs_a_key_and_sign_in_and_is_cached(monkeypatch):
    weather._cache.update(at=0.0, value=None)
    with TestClient(create_app(LOCAL)) as c:
        assert c.get("/api/weather").status_code == 401
        monkeypatch.delenv("GOOGLE_WEATHER_API_KEY", raising=False)
        assert c.get("/api/weather", headers=auth()).status_code == 503
        monkeypatch.setenv("GOOGLE_WEATHER_API_KEY", "secret-key")
        calls = []
        def fake(key):
            calls.append(key)
            return {"weatherCondition": {"type": "LIGHT_RAIN"}}
        assert weather.current(get=fake) == {"kind": "rain", "source": "google"}
        assert weather.current(get=fake) == {"kind": "rain", "source": "google"}
        assert calls == ["secret-key"]
        weather._cache.update(at=0.0, value=None)
        def broken(key):
            raise OSError("key secret-key rejected")
        with pytest.raises(Exception) as error:
            weather.current(get=broken)
        assert "secret-key" not in str(error.value.detail)
