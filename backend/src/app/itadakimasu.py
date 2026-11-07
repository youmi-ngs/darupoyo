"""「いただきます」 (#120): a recorded voice counts only after Gemini hears the phrase in it.

The recording is checked once and the answer is kept on its media record; a meal is
recorded as photo_voice only with a recording that passed. Without a model (local
development and tests) recordings are accepted so the flow can be tried offline.
"""

import json
import logging

from fastapi import HTTPException

from .domain import require_member

PROMPT = (
    "この音声で、話している人は日本語の「いただきます」と言っていますか？"
    "「いただきまーす」「いただきます！」のような言い方のゆれは含めます。"
    "ほかの言葉だけ、無音、雑音だけのときは false。JSON で {\"heard\": true または false} だけを返してください。"
)
SCHEMA = {"type": "object", "properties": {"heard": {"type": "boolean"}}, "required": ["heard"]}


def heard(praise, data, content_type):
    """True/False from Gemini; None when no model is configured."""
    if praise.client is None:
        return None
    from google.genai import types

    result = praise.client.models.generate_content(
        model=praise.settings.model,
        contents=[types.Part.from_bytes(data=data, mime_type=content_type), PROMPT],
        config=types.GenerateContentConfig(
            temperature=0, max_output_tokens=20, response_mime_type="application/json", response_schema=SCHEMA,
        ),
    )
    return bool(json.loads(result.text or "{}").get("heard"))


def check(store, media, praise, settings, uid, house_id, media_id):
    require_member(store, house_id, uid)
    path = f"houses/{house_id}/media/{media_id}"
    meta = store.get(path)
    if not meta or meta["owner_id"] != uid or meta["kind"] != "voice":
        raise HTTPException(404, "Own voice recording not found")
    if meta.get("itadakimasu") is not None:
        return {"heard": meta["itadakimasu"]}
    try:
        result = heard(praise, media.read(meta["object_name"]), meta["content_type"])
    except Exception:  # noqa: BLE001 -- the provider must not leak details; the client can retry
        logging.getLogger(__name__).warning("itadakimasu_check_unavailable")
        raise HTTPException(503, "Could not check the recording; try again or record the photo only") from None
    if result is None:
        if settings.app_env == "production":
            raise HTTPException(503, "Voice check is not configured")
        result = True

    def save(tx):
        current = tx.get(path)
        if current:
            current["itadakimasu"] = result
            tx.set(path, current)

    store.atomic(save)
    return {"heard": result}
