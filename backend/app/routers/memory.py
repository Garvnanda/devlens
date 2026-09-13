"""
Phase 14: The "Memory & Motivation" layer.

  GET  /api/v1/memory/dashboard          — "pick up where you left off" (signed in)
  POST /api/v1/memory/contributions      — verify one of your PRs for the portfolio (signed in)
  GET  /api/v1/contests/recommend        — open-source programs, fingerprint-ranked when signed in
  GET  /api/v1/user/{username}/portfolio — public, shareable, verified contributions only
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_current_user_optional
from app.routers.search import _user_token
from app.services import contest_service, memory_service, skill_fingerprint
from app.storage.db import get_db
from app.storage.models import User

router = APIRouter(prefix="/api/v1", tags=["memory"])


class VerifyRequest(BaseModel):
    pr_url: str


@router.get("/memory/dashboard")
async def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return memory_service.get_dashboard(db, user)


@router.post("/memory/contributions")
async def verify_contribution(body: VerifyRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return await memory_service.verify_pull_request(db, user, body.pr_url.strip(), _user_token(user))
    except memory_service.VerificationError as exc:
        raise HTTPException(exc.status_code, str(exc))
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"GitHub returned {exc.response.status_code} while checking the pull request.")


@router.get("/contests/recommend")
async def contests(user: User | None = Depends(get_current_user_optional)):
    fingerprint = skill_fingerprint.deserialize(user.skill_fingerprint_json) if user else None
    return await contest_service.recommend_contests((fingerprint or {}).get("vector"))


@router.get("/user/{username}/portfolio")
async def portfolio(username: str, db: Session = Depends(get_db)):
    data = memory_service.get_portfolio(db, username)
    if data is None:
        raise HTTPException(404, f"No DevLens portfolio for @{username}.")
    return data
