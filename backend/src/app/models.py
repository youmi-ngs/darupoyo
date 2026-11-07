from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Chore(StrEnum):
    laundry = "laundry"
    meal = "meal"
    dryer = "dryer"
    garbage = "garbage"


class HouseCreate(Model):
    name: str = Field(min_length=1, max_length=60, pattern=r"\S")
    display_name: str = Field(min_length=1, max_length=40, pattern=r"\S")


class Join(Model):
    # Short code (8 chars, any case, optional hyphen) or an older long link token.
    token: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=1, max_length=40, pattern=r"\S")


class Goals(Model):
    chores: list[Chore] = Field(max_length=4)


class Landmark(Model):
    x: float = Field(ge=-5, le=5)
    y: float = Field(ge=-5, le=5)
    z: float = Field(ge=-5, le=5)
    visibility: float = Field(ge=0, le=1)


class Completion(Model):
    # Generated once by the client, reused unchanged on retry.
    request_id: UUID
    chore: Chore
    method: Literal["pose", "photo_voice", "photo", "sound", "rhythm"]
    media_id: UUID | None = None
    # Recorded いただきます; only with photo_voice.
    voice_media_id: UUID | None = None
    duration_seconds: float | None = Field(default=None, ge=0, le=600)
    itadakimasu: bool = False
    landmarks: list[Landmark] | None = Field(default=None, min_length=33, max_length=33)
    pose_name: str | None = Field(default=None, min_length=1, max_length=50)
    similarity: float | None = Field(default=None, ge=0, le=100)
    reference_post_id: str | None = Field(default=None, max_length=64)
    hits: int | None = Field(default=None, ge=0, le=1000)
    total_beats: int | None = Field(default=None, ge=1, le=1000)
    gal: Literal["heisei", "reiwa", "kuro", "hime"] = "reiwa"

    @model_validator(mode="after")
    def evidence(self):
        allowed = {
            Chore.laundry: {"rhythm"},
            Chore.meal: {"photo_voice", "photo"},
            Chore.dryer: {"sound"},
            Chore.garbage: {"pose"},
        }
        if self.method not in allowed[self.chore]:
            raise ValueError("Unsupported method for chore")
        if self.method == "pose" and (not self.media_id or not self.landmarks):
            raise ValueError("Pose requires cutout media and 33 landmarks")
        if self.method == "photo_voice" and (not self.media_id or not self.itadakimasu):
            raise ValueError("Meal requires photo and itadakimasu confirmation")
        if self.method == "photo" and not self.media_id:
            raise ValueError("Meal requires a photo")
        if self.voice_media_id and self.method != "photo_voice":
            raise ValueError("Voice recording only applies to itadakimasu")
        if self.method == "rhythm":
            if self.hits is None or self.total_beats is None or self.hits > self.total_beats:
                raise ValueError("Rhythm requires hits <= total_beats")
            if self.duration_seconds is None or self.duration_seconds < 5 or self.hits < 1:
                raise ValueError("Play at least 5 seconds and hit at least one beat")
            if self.media_id:
                raise ValueError("Rhythm does not upload images")
        elif self.hits is not None or self.total_beats is not None:
            raise ValueError("Rhythm fields only apply to rhythm completion")
        if self.method == "sound" and (self.duration_seconds is None or self.duration_seconds < 10):
            raise ValueError("Sound requires at least 10 detected seconds")
        if self.method == "sound" and self.media_id:
            raise ValueError("Sound completion does not upload raw audio or images")
        if self.method != "pose" and (
            self.landmarks
            or self.pose_name
            or self.similarity is not None
            or self.reference_post_id
        ):
            raise ValueError("Pose fields only apply to pose completion")
        if self.similarity is not None and not self.reference_post_id:
            raise ValueError("Similarity requires reference_post_id")
        return self


class Reaction(Model):
    emoji: Literal["heart", "clap", "sparkles"]


class Profile(Model):
    # Send either or both; omitted fields stay as they are.
    theme: Literal["pink", "lilac", "cyan", "lime", "peach", "mint", "cream", "night"] | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=40, pattern=r"\S")

    @model_validator(mode="after")
    def any_field(self):
        if self.theme is None and self.display_name is None:
            raise ValueError("Send theme or display_name")
        return self


class HouseUpdate(Model):
    name: str = Field(min_length=1, max_length=60, pattern=r"\S")


class NotifySettings(Model):
    # FCM registration token of this device; omit to only change the gal.
    token: str | None = Field(default=None, min_length=20, max_length=4096)
    enabled: bool = True
    gal: Literal["heisei", "reiwa", "kuro", "hime", "random"] | None = None
