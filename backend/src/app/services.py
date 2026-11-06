import logging
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from . import gals

LABELS = {"laundry": "洗濯", "meal": "ごはん", "dryer": "ドライヤー", "garbage": "ゴミ捨て"}
REWARDS = {"laundry": "いい匂いの服", "meal": "ツヤ肌", "dryer": "美髪", "garbage": "スッキリ玄関"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def normalize_image(raw: bytes, kind: str):
    """Re-encode to discard EXIF/GPS; cutouts must have actual transparency."""
    try:
        with Image.open(BytesIO(raw)) as image:
            if (
                image.format not in {"PNG", "JPEG", "WEBP"}
                or image.width * image.height > 12_000_000
            ):
                raise ValueError()
            image.load()
            if kind == "cutout":
                image = image.convert("RGBA")
                lo, hi = image.getchannel("A").getextrema()
                if lo == 255 or hi == 0:
                    raise ValueError()
            else:
                image = image.convert("RGB")
            # New image explicitly strips all embedded metadata.
            clean = Image.new(image.mode, image.size)
            clean.paste(image)
            out = BytesIO()
            clean.save(out, format="PNG" if kind == "cutout" else "JPEG")
            data = out.getvalue()
            if len(data) > MAX_IMAGE_BYTES:
                raise ValueError()
            return data, "image/png" if kind == "cutout" else "image/jpeg"
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(
            422, "Invalid image; cutout must have a transparent background"
        ) from None


class MediaStorage:
    def __init__(self, settings):
        self.memory = {} if settings.data_backend == "memory" else None
        if self.memory is None:
            from google.cloud import storage

            self.bucket = storage.Client(project=settings.project).bucket(settings.bucket)

    def put(self, name, data, content_type):
        if self.memory is not None:
            self.memory[name] = data
        else:
            self.bucket.blob(name).upload_from_string(
                data, content_type=content_type, if_generation_match=0, timeout=30
            )

    def read(self, name):
        if self.memory is not None:
            return self.memory[name]
        return self.bucket.blob(name).download_as_bytes(timeout=30)


class Praise:
    def __init__(self, settings):
        self.settings = settings
        self.client = None
        if settings.praise_backend == "vertex":
            from google import genai
            from google.genai import types

            self.client = genai.Client(
                vertexai=True,
                project=settings.project,
                location=settings.location,
                http_options=types.HttpOptions(timeout=8000),
            )

    def generate(self, chore, gal="reiwa", context=None):
        """A praise line in the chosen gal's voice; never fails the completion."""
        fallback = {"text": gals.fallback_line(chore, gal), "source": "fallback"}
        if self.client is None:
            return fallback
        try:
            from google.genai import types

            system, contents = gals.prompt(chore, gal, context)
            # One retry if the line breaks a rule (e.g. mentions how a meal was made).
            for _ in range(2):
                result = self.client.models.generate_content(
                    model=self.settings.model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system, temperature=1.0, max_output_tokens=200
                    ),
                )
                text = (result.text or "").strip().strip("「」\"")
                if gals.acceptable(chore, text):
                    return {"text": text, "source": "gemini"}
        except Exception:  # noqa: BLE001 -- optional provider must never invalidate a completed chore
            # Do not log tokens, user media, or provider exception payloads.
            logging.getLogger(__name__).warning("praise_provider_unavailable")
        return fallback

    def close(self):
        if self.client is not None:
            self.client.close()
