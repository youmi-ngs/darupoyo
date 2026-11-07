"""Clean Your Life API. Firebase tokens, never client-supplied identity in production."""

import os
import re
from contextlib import asynccontextmanager
from datetime import date
from typing import Literal
from uuid import UUID, uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Path, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .config import Settings
from .accounts import delete_account, require_active
from .domain import Domain, require_member
from .models import (
    Avatar,
    Comment,
    Completion,
    MealFinish,
    Goals,
    HistorySharing,
    HouseCreate,
    HouseUpdate,
    Join,
    NotifySettings,
    Moment,
    Profile,
    Reaction,
)
from .notify import Notifier
from . import social
from .services import MAX_IMAGE_BYTES, MediaStorage, Praise, normalize_image, normalize_voice
from .store import FirestoreStore, MemoryStore


def current_user(request: Request, authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            401, "Firebase ID token required", headers={"WWW-Authenticate": "Bearer"}
        )
    token = authorization[7:]
    if request.app.state.settings.auth_mode == "dev":
        if not re.fullmatch(r"dev:[a-zA-Z0-9_-]{1,64}", token):
            raise HTTPException(401, "Local token format: dev:alice")
        uid = token[4:]
        if request.url.path != "/api/me":
            require_active(request.app.state.store, uid)
        return uid
    from firebase_admin import auth

    try:
        claims = auth.verify_id_token(token, app=request.app.state.firebase, check_revoked=True)
        request.state.auth_claims = claims
        if request.url.path != "/api/me":
            require_active(request.app.state.store, claims["uid"])
        return claims["uid"]
    except (auth.InvalidIdTokenError, auth.RevokedIdTokenError, auth.UserDisabledError, auth.UserNotFoundError, ValueError):
        raise HTTPException(401, "Invalid Firebase ID token") from None


def create_app(settings=None, store=None, praise=None, clock=None):
    @asynccontextmanager
    async def lifespan(application):
        config = settings or Settings.from_env()
        config.validate()
        application.state.settings = config
        application.state.store = store or (
            MemoryStore() if config.data_backend == "memory" else FirestoreStore(config.project)
        )
        application.state.domain = Domain(
            application.state.store, config, **({"clock": clock} if clock else {})
        )
        application.state.media = MediaStorage(config)
        application.state.praise = praise or Praise(config)
        if config.auth_mode == "firebase":
            import firebase_admin

            application.state.firebase = firebase_admin.initialize_app(
                options={"projectId": config.project}, name="ontama-" + uuid4().hex
            )
        application.state.notify = Notifier(
            config, getattr(application.state, "firebase", None), application.state.praise
        )
        yield
        application.state.praise.close()
        if config.auth_mode == "firebase":
            import firebase_admin

            firebase_admin.delete_app(application.state.firebase)

    app = FastAPI(title="Clean Your Life / 温玉", version="0.2.0", lifespan=lifespan)
    origins = (settings or Settings.from_env()).origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[s.strip() for s in origins.split(",") if s.strip()],
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def body_limit(request, call_next):
        limit = MAX_IMAGE_BYTES if request.url.path.endswith("/media") else 64 * 1024
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > limit:
                return Response(status_code=413)
        request._body = bytes(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/api/healthz")
    @app.get("/healthz")
    def health():
        return {"status": "ok"}

    @app.get("/api/config")
    def public_config():
        # Firebase web config identifies a project, not Admin SDK credentials.
        config = app.state.settings
        return {
            "auth_mode": config.auth_mode,
            "data_backend": config.data_backend,
            "timezone": config.timezone,
            # Public web push key (Firebase console → Cloud Messaging); empty = notifications off.
            "push": {"vapid_key": os.getenv("FIREBASE_VAPID_KEY", "")},
            "firebase": {
                "apiKey": os.getenv("FIREBASE_WEB_API_KEY", ""),
                "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", ""),
                "projectId": config.project,
                "appId": os.getenv("FIREBASE_APP_ID", ""),
                "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID", ""),
            },
        }

    @app.put("/api/notifications")
    def notifications(body: NotifySettings, uid=Depends(current_user)):
        return Notifier.save(app.state.store, uid, body.token, body.enabled, body.gal)

    @app.post("/api/tasks/evening")
    def evening(authorization: str | None = Header(default=None)):
        # Called by Cloud Scheduler at 19:00 with a Google-signed OIDC token.
        config = app.state.settings
        if config.auth_mode != "dev":
            expected = os.getenv("SCHEDULER_EMAIL", "")
            audience = os.getenv("SCHEDULER_AUDIENCE", "")
            if not expected or not audience or not (authorization or "").startswith("Bearer "):
                raise HTTPException(403, "Scheduler only")
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token

            try:
                claims = id_token.verify_oauth2_token(
                    authorization[7:], google_requests.Request(), audience=audience
                )
            except ValueError:
                raise HTTPException(403, "Scheduler only") from None
            if claims.get("email") != expected or not claims.get("email_verified"):
                raise HTTPException(403, "Scheduler only")
        return {"nudged": app.state.notify.evening(app.state.store, app.state.domain.day())}

    @app.get("/api/me")
    def me(uid=Depends(current_user)):
        return {"uid": uid, "deletion_pending": bool(app.state.store.get(f"account_deletions/{uid}"))}

    @app.delete("/api/me", status_code=204)
    def remove_account(request: Request, uid=Depends(current_user)):
        if app.state.settings.auth_mode == "firebase":
            import time
            if time.time() - getattr(request.state, 'auth_claims', {}).get('auth_time', 0) > 300:
                raise HTTPException(401, "Sign in again before deleting your account")
        def remove_login(user_id):
            if app.state.settings.auth_mode == "firebase":
                from firebase_admin import auth
                try:
                    auth.delete_user(user_id, app=app.state.firebase)
                except auth.UserNotFoundError:
                    pass
        delete_account(app.state.store, app.state.media, uid, remove_login)
        return Response(status_code=204)

    @app.post("/api/houses", status_code=201)
    def create_house(body: HouseCreate, uid=Depends(current_user)):
        return app.state.domain.create_house(uid, body)

    @app.get("/api/houses")
    def houses(uid=Depends(current_user)):
        return {"items": app.state.store.list("houses", member=uid)}

    @app.post("/api/houses/{house_id}/invites", status_code=201)
    def invite(house_id: UUID, uid=Depends(current_user)):
        return app.state.domain.invite(uid, str(house_id))

    @app.post("/api/join")
    def join(body: Join, uid=Depends(current_user)):
        return app.state.domain.join(uid, body)

    @app.get("/api/houses/{house_id}/dashboard")
    def dashboard(house_id: UUID, day: date | None = None, uid=Depends(current_user)):
        return app.state.domain.dashboard(uid, str(house_id), str(day) if day else None)

    @app.put("/api/houses/{house_id}/goals")
    def goals(house_id: UUID, body: Goals, uid=Depends(current_user)):
        return app.state.domain.goals(uid, str(house_id), body)

    @app.put("/api/houses/{house_id}")
    def rename_house(house_id: UUID, body: HouseUpdate, uid=Depends(current_user)):
        return app.state.domain.rename_house(uid, str(house_id), body)

    @app.put("/api/houses/{house_id}/profile")
    def profile(house_id: UUID, body: Profile, uid=Depends(current_user)):
        return app.state.domain.profile(uid, str(house_id), body)

    @app.post("/api/houses/{house_id}/media", status_code=201)
    async def upload(
        house_id: UUID, request: Request, kind: Literal["meal", "cutout", "voice", "selfie", "avatar"],
        uid=Depends(current_user),
    ):
        house = str(house_id)
        await run_in_threadpool(require_member, app.state.store, house, uid)
        raw = await request.body()
        if kind == "voice":
            data, content_type = normalize_voice(raw)
        else:
            data, content_type = await run_in_threadpool(normalize_image, raw, kind)
        media_id = str(uuid4())
        name = f"houses/{house}/{media_id}"
        await run_in_threadpool(app.state.media.put, name, data, content_type)
        meta = {
            "id": media_id,
            "owner_id": uid,
            "object_name": name,
            "kind": kind,
            "content_type": content_type,
        }
        def save_media(tx):
            require_member(tx, house, uid)
            tx.set(f"houses/{house}/media/{media_id}", meta)
        try:
            await run_in_threadpool(app.state.store.atomic, save_media)
        except Exception:
            await run_in_threadpool(app.state.media.delete, name)
            raise
        return {"id": media_id, "kind": kind}

    @app.get("/api/houses/{house_id}/media/{media_id}")
    def media(house_id: UUID, media_id: UUID, uid=Depends(current_user)):
        house = str(house_id)
        require_member(app.state.store, house, uid)
        meta = app.state.store.get(f"houses/{house}/media/{media_id}")
        if not meta:
            raise HTTPException(404, "Image not found")
        return Response(app.state.media.read(meta["object_name"]), media_type=meta["content_type"])

    @app.post("/api/houses/{house_id}/moments", status_code=201)
    def share_moment(house_id: UUID, body: Moment, uid=Depends(current_user)):
        return app.state.domain.share_moment(uid, str(house_id), body)

    @app.get("/api/houses/{house_id}/moments")
    def moments(house_id: UUID, before: str | None = Query(default=None, max_length=100), uid=Depends(current_user)):
        house = str(house_id)
        require_member(app.state.store, house, uid)
        items = app.state.store.list(f"houses/{house}/moments", limit=30, before=before)
        return {"items": items, "next_cursor": items[-1]["id"] if len(items) == 30 else None}

    @app.post("/api/houses/{house_id}/completions")
    def complete(
        house_id: UUID, body: Completion, tasks: BackgroundTasks, uid=Depends(current_user)
    ):
        house = str(house_id)
        post, created = app.state.domain.complete(uid, house, body)
        if created:
            post = app.state.domain.set_praise(
                house, post["id"], app.state.praise.generate(body.chore.value, body.gal, post)
            )
            # Tell the other members after the response is sent.
            store = app.state.store
            tasks.add_task(
                app.state.notify.friend_cleared,
                store,
                require_member(store, house, uid),
                uid,
                body.chore.value,
            )
        return {"post": post, "created": created}

    @app.get("/api/houses/{house_id}/posts")
    def posts(
        house_id: UUID,
        limit: int = Query(30, ge=1, le=100),
        before: str | None = Query(
            None, max_length=64, pattern=r"^[0-9]{8}T[0-9]{12}_[a-f0-9]{32}$"
        ),
        uid=Depends(current_user),
    ):
        house = str(house_id)
        require_member(app.state.store, house, uid)
        items = app.state.store.list(f"houses/{house}/posts", limit=limit, before=before)
        return {"items": items, "next_cursor": items[-1]["id"] if len(items) == limit else None}

    @app.put("/api/houses/{house_id}/posts/{post_id}/meal-finish")
    def finish_meal(house_id: UUID, post_id: str, body: MealFinish, uid=Depends(current_user)):
        if not re.fullmatch(r"[0-9]{8}T[0-9]{12}_[a-f0-9]{32}", post_id):
            raise HTTPException(422, "Invalid post id")
        return app.state.domain.finish_meal(uid, str(house_id), post_id, body)

    @app.put("/api/houses/{house_id}/posts/{post_id}/reaction")
    def react(house_id: UUID, post_id: str, body: Reaction, uid=Depends(current_user)):
        if not re.fullmatch(r"[0-9]{8}T[0-9]{12}_[a-f0-9]{32}", post_id):
            raise HTTPException(422, "Invalid post id")
        return app.state.domain.react(uid, str(house_id), post_id, body.emoji)

    # ---------- photos and sharing (comments, profile photo, other houses) ----------
    POST_ID = r"[0-9]{8}T[0-9]{12}_[a-f0-9]{32}"

    def post_id_ok(post_id):
        if not re.fullmatch(POST_ID, post_id):
            raise HTTPException(422, "Invalid post id")

    @app.post("/api/houses/{house_id}/posts/{post_id}/comments", status_code=201)
    def comment(house_id: UUID, post_id: str, body: Comment, uid=Depends(current_user)):
        post_id_ok(post_id)
        return social.add_comment(app.state.store, uid, str(house_id), post_id, body, app.state.domain.clock)

    @app.delete("/api/houses/{house_id}/posts/{post_id}/comments/{comment_id}")
    def uncomment(house_id: UUID, post_id: str, comment_id: UUID, uid=Depends(current_user)):
        post_id_ok(post_id)
        return social.delete_comment(app.state.store, uid, str(house_id), post_id, str(comment_id))

    @app.put("/api/houses/{house_id}/avatar")
    def avatar(house_id: UUID, body: Avatar, uid=Depends(current_user)):
        return social.set_avatar(app.state.store, app.state.media, uid, str(house_id), str(body.media_id))

    @app.delete("/api/houses/{house_id}/avatar")
    def remove_avatar(house_id: UUID, uid=Depends(current_user)):
        return social.set_avatar(app.state.store, app.state.media, uid, str(house_id), None)

    @app.put("/api/houses/{house_id}/history-sharing")
    def history_sharing(house_id: UUID, body: HistorySharing, uid=Depends(current_user)):
        return social.set_history_sharing(app.state.store, uid, str(house_id), body.enabled)

    @app.get("/api/houses/{house_id}/members/{member_id}/history")
    def member_history(house_id: UUID, member_id: str = Path(max_length=128), uid=Depends(current_user)):
        return social.history(app.state.store, uid, str(house_id), member_id)

    @app.get("/api/houses/{house_id}/members/{member_id}/history/{source_id}/media/{media_id}")
    def member_history_media(house_id: UUID, source_id: UUID, media_id: UUID, member_id: str = Path(max_length=128), uid=Depends(current_user)):
        data, content_type = social.history_media(
            app.state.store, app.state.media, uid, str(house_id), member_id, str(source_id), str(media_id))
        return Response(data, media_type=content_type)

    @app.api_route("/api/{unknown:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    def unknown_api(unknown: str):
        raise HTTPException(404, "API not found")

    return app


app = create_app()
