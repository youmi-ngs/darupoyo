"""Explicit local-only development mode; production never trusts client user IDs."""

import os
from dataclasses import dataclass
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class Settings:
    app_env: str = "production"
    data_backend: str = "firestore"
    auth_mode: str = "firebase"
    praise_backend: str = "fallback"
    project: str = ""
    bucket: str = ""
    location: str = "global"
    model: str = ""
    origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    timezone: str = "Asia/Tokyo"
    sync_seconds: int = 300

    @classmethod
    def from_env(cls):
        return cls(
            app_env=os.getenv("APP_ENV", "production"),
            data_backend=os.getenv("DATA_BACKEND", "firestore"),
            auth_mode=os.getenv("AUTH_MODE", "firebase"),
            praise_backend=os.getenv("PRAISE_BACKEND", "fallback"),
            project=os.getenv("GOOGLE_CLOUD_PROJECT", ""),
            bucket=os.getenv("STORAGE_BUCKET", ""),
            location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"),
            model=os.getenv("GEMINI_MODEL", ""),
            origins=os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"),
            timezone=os.getenv("DAY_TIMEZONE", "Asia/Tokyo"),
            sync_seconds=int(os.getenv("SYNC_WINDOW_SECONDS", "300")),
        )

    def validate(self):
        if self.app_env not in {"local", "test", "production"}:
            raise ValueError("Invalid APP_ENV")
        if self.auth_mode not in {"firebase", "dev"} or self.data_backend not in {
            "firestore",
            "memory",
        }:
            raise ValueError("Invalid auth/storage backend")
        if self.praise_backend not in {"vertex", "fallback"}:
            raise ValueError("Invalid PRAISE_BACKEND")
        if self.app_env == "production" or os.getenv("K_SERVICE"):
            if self.auth_mode != "firebase" or self.data_backend != "firestore":
                raise ValueError("Cloud/production requires Firebase auth and Firestore")
            if os.getenv("FIREBASE_AUTH_EMULATOR_HOST") or os.getenv("FIRESTORE_EMULATOR_HOST"):
                raise ValueError("Emulator credentials are forbidden in production")
        if self.data_backend == "firestore" and not (self.project and self.bucket):
            raise ValueError("GOOGLE_CLOUD_PROJECT and STORAGE_BUCKET are required")
        if self.auth_mode == "firebase" and not self.project:
            raise ValueError("Firebase auth requires GOOGLE_CLOUD_PROJECT")
        if self.praise_backend == "vertex" and not (self.project and self.model):
            raise ValueError("Vertex requires GOOGLE_CLOUD_PROJECT and GEMINI_MODEL")
        if "*" in self.origins or not 1 <= self.sync_seconds <= 3600:
            raise ValueError("Use exact origins and SYNC_WINDOW_SECONDS between 1 and 3600")
        ZoneInfo(self.timezone)
