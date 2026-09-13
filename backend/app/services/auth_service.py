"""
Phase 9: Identity Layer — JWT issuance/verification, GitHub token encryption,
and the OAuth code-exchange/identity-fetch calls.

Frozen contract (do not change field names without syncing with Haragam —
see Integration Check 1 in implementation-garv.md):

JWT payload:  {"sub": <github_id str>, "login": <username>, "iat", "exp"}
"""

import time
import logging

import httpx
import jwt
from cryptography.fernet import Fernet

from app.config import get_settings

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
JWT_TTL_SECONDS = 24 * 60 * 60  # 24h


class InvalidTokenError(Exception):
    pass


# ── JWT ──────────────────────────────────────────────────────────────────

def create_jwt(github_id: int, login: str) -> str:
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": str(github_id),
        "login": login,
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc


# ── Token encryption at rest ────────────────────────────────────────────

def _fernet() -> Fernet:
    key = get_settings().token_encryption_key
    if not key:
        raise RuntimeError(
            "TOKEN_ENCRYPTION_KEY is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(raw: str) -> str:
    return _fernet().encrypt(raw.encode()).decode()


def decrypt_token(enc: str) -> str:
    return _fernet().decrypt(enc.encode()).decode()


# ── GitHub OAuth Web Application Flow ───────────────────────────────────

async def exchange_code_for_token(code: str) -> str:
    """Exchange an OAuth `code` for a GitHub access token."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_oauth_client_id,
                "client_secret": settings.github_oauth_client_secret,
                "code": code,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    if "error" in data:
        raise ValueError(f"GitHub OAuth error: {data.get('error_description', data['error'])}")

    access_token = data.get("access_token")
    if not access_token:
        raise ValueError("GitHub OAuth response missing access_token")
    return access_token


async def fetch_github_identity(access_token: str) -> dict:
    """Fetch the authenticated user's GitHub identity using their own token."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "DevLens-Auth-Client",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "github_id": data["id"],
        "login": data["login"],
        "avatar_url": data.get("avatar_url", ""),
    }


if __name__ == "__main__":
    # Self-check: JWT round-trip + tamper rejection.
    import os

    os.environ.setdefault("JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    token = create_jwt(12345, "octocat")
    claims = decode_jwt(token)
    assert claims["sub"] == "12345" and claims["login"] == "octocat", "round-trip failed"

    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    try:
        decode_jwt(tampered)
        raise AssertionError("tampered token should have been rejected")
    except InvalidTokenError:
        pass

    print("auth_service self-check passed")
