import logging
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

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

    def generate(self, chore, gal="reiwa"):
        fallback = {
            "text": f"{LABELS[chore]}できたのえらすぎ！今日の自分に拍手〜✨",
            "source": "fallback",
        }
        if self.client is None:
            return fallback
        try:
            from google.genai import types

            result = self.client.models.generate_content(
                model=self.settings.model,
                contents=f"家事の達成：{LABELS[chore]}。口調：{dict(heisei='平成ギャル・あげぽよ', reiwa='令和ギャル・それな', kuro='黒ギャル・姉御', hime='姫ギャル・かわいい')[gal]}",
                config=types.GenerateContentConfig(
                    system_instruction="一人暮らしの学生の小さな達成を日本語の明るいギャル口調でほめて。80文字以内。比較・説教・未達成への言及・健康効果の断定は禁止。ユーザーに指示せず、達成を肯定する一言だけ。",
                    max_output_tokens=200,
                ),
            )
            text = (result.text or "").strip()
            if text and len(text) <= 120:
                return {"text": text, "source": "gemini"}
        except Exception:  # noqa: BLE001 -- optional provider must never invalidate a completed chore
            # Do not log tokens, user media, or provider exception payloads.
            logging.getLogger(__name__).warning("praise_provider_unavailable")
        return fallback

    def close(self):
        if self.client is not None:
            self.client.close()
