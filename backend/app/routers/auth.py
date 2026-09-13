"""
Phase 9: The "Identity Layer" — GitHub OAuth Web Application Flow + Skill
Fingerprint. See implementation-garv.md Phase 9 and auth_service.py for the
frozen JWT/UserProfile contract.
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dependencies import get_current_user
from app.services import auth_service, skill_fingerprint
from app.storage.db import get_db
from app.storage.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class ProfileUpdateRequest(BaseModel):
    level: str | None = None
    language: str | None = None
    goal: str | None = None


def _user_to_profile(user: User) -> dict:
    return {
        "github_id": user.github_id,
        "login": user.login,
        "avatar_url": user.avatar_url,
        "level": user.level,
        "language": user.language,
        "goal": user.goal,
        "skill_fingerprint": skill_fingerprint.deserialize(user.skill_fingerprint_json),
    }


@router.get("/github/login")
async def github_login():
    settings = get_settings()
    if not settings.github_oauth_client_id:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured on this server")
    scope = "read:user public_repo"
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_oauth_client_id}&scope={scope.replace(' ', '%20')}"
    )
    return RedirectResponse(url)


@router.get("/github/callback")
async def github_callback(code: str, db: Session = Depends(get_db)):
    settings = get_settings()
    try:
        access_token = await auth_service.exchange_code_for_token(code)
        identity = await auth_service.fetch_github_identity(access_token)
    except Exception as exc:
        logger.error(f"OAuth callback failed: {exc}")
        raise HTTPException(status_code=400, detail="GitHub OAuth exchange failed")

    user = db.query(User).filter(User.github_id == identity["github_id"]).first()
    encrypted = auth_service.encrypt_token(access_token)
    if user:
        user.login = identity["login"]
        user.avatar_url = identity["avatar_url"]
        user.encrypted_github_token = encrypted
    else:
        user = User(
            github_id=identity["github_id"],
            login=identity["login"],
            avatar_url=identity["avatar_url"],
            encrypted_github_token=encrypted,
        )
        db.add(user)
    db.commit()

    jwt_token = auth_service.create_jwt(user.github_id, user.login)
    return RedirectResponse(f"{settings.frontend_url}/?token={jwt_token}")


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.memory_service import touch_streak
    touch_streak(db, current_user.github_id)  # opening DevLens counts toward the weekly streak
    return _user_to_profile(current_user)


@router.post("/me")
async def update_me(
    update: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if update.level is not None:
        current_user.level = update.level
    if update.language is not None:
        current_user.language = update.language
    if update.goal is not None:
        current_user.goal = update.goal
    db.commit()
    return _user_to_profile(current_user)


@router.post("/logout")
async def logout():
    # Stateless JWTs — nothing to revoke server-side today. Frontend drops
    # the token. Endpoint kept for symmetry / a future revocation list.
    return {"status": "ok"}


async def _run_skill_fingerprint_job(github_id: int):
    """Background task: compute + persist the skill fingerprint for a user."""
    from app.storage.db import SessionLocal

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.github_id == github_id).first()
        if not user or not user.encrypted_github_token:
            return
        token = auth_service.decrypt_token(user.encrypted_github_token)
        fingerprint = await skill_fingerprint.compute_skill_fingerprint(token)
        user.skill_fingerprint_json = skill_fingerprint.serialize(fingerprint)
        db.commit()
        from app.services.memory_service import record_fingerprint_snapshot
        record_fingerprint_snapshot(db, github_id, fingerprint["language_distribution"])
    except Exception as exc:
        logger.error(f"Skill fingerprint job failed for user {github_id}: {exc}")
    finally:
        db.close()


@router.get("/user/skill-fingerprint")
async def get_skill_fingerprint(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    if current_user.skill_fingerprint_json:
        return {"status": "done", "skill_fingerprint": skill_fingerprint.deserialize(current_user.skill_fingerprint_json)}

    background_tasks.add_task(_run_skill_fingerprint_job, current_user.github_id)
    return {"status": "processing"}
