"""
Phase 9: Auth dependencies.

These are applied per-route via `Depends(...)` only — never as global
middleware. Integration Check 3: anonymous flows (`ingest`, `chatbot`,
`gatekeeper`, `explain`, `intent`, and Haragam's pre-login security scanner)
must stay reachable without a token; only routes that explicitly opt in via
these dependencies require one.
"""

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.services.auth_service import decode_jwt, InvalidTokenError
from app.storage.db import get_db
from app.storage.models import User


def _extract_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]


def get_current_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        claims = decode_jwt(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.github_id == int(claims["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_user_optional(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User | None:
    token = _extract_token(authorization)
    if not token:
        return None
    try:
        claims = decode_jwt(token)
    except InvalidTokenError:
        return None
    return db.query(User).filter(User.github_id == int(claims["sub"])).first()
