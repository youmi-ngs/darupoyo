"""Weather for the house scenes (#125) from Google Maps Platform's Weather API.

The API key stays on the server (Secret Manager → GOOGLE_WEATHER_API_KEY). The answer
is reduced to clear / cloudy / rain / snow and cached for 15 minutes per instance.
"""

import json
import os
import time
import urllib.parse
import urllib.request

from fastapi import HTTPException

TOKYO = {"location.latitude": 35.68, "location.longitude": 139.76}  # fixed; no device location
CACHE_SECONDS = 15 * 60
_cache = {"at": 0.0, "value": None}


def kind(condition):
    """Google's weatherCondition.type → the four skies the house can draw."""
    c = (condition or "").upper()
    if "SNOW" in c or "HAIL" in c:
        return "snow"
    if any(word in c for word in ("RAIN", "SHOWER", "THUNDER", "DRIZZLE")):
        return "rain"
    if any(word in c for word in ("CLOUD", "FOG", "HAZE", "WIND")) and c != "MOSTLY_CLEAR":
        return "cloudy"
    return "clear"


def fetch(key):
    url = "https://weather.googleapis.com/v1/currentConditions:lookup?" + urllib.parse.urlencode({**TOKYO, "key": key})
    with urllib.request.urlopen(url, timeout=6) as response:  # noqa: S310 -- fixed https URL
        return json.load(response)


def current(now=time.time, get=fetch):
    key = os.getenv("GOOGLE_WEATHER_API_KEY", "")
    if not key:
        raise HTTPException(503, "Weather is not configured")
    if _cache["value"] and now() - _cache["at"] < CACHE_SECONDS:
        return _cache["value"]
    try:
        data = get(key)
    except Exception:  # noqa: BLE001 -- never forward the key or provider errors
        raise HTTPException(502, "Weather unavailable") from None
    value = {"kind": kind(data.get("weatherCondition", {}).get("type")), "source": "google"}
    _cache.update(at=now(), value=value)
    return value
