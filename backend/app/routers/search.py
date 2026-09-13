"""
Phase 10: The "Global Radar" — GET /api/v1/search/global?q=...

Searches all of GitHub (repositories + open issues), classifies issues, flags ones already
claimed by an open PR, and — when signed in with a Skill Fingerprint — re-ranks by similarity.
Works anonymously too (app PAT, GitHub's own ranking).
"""

import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_current_user_optional
from app.services import auth_service, github_search, skill_fingerprint
from app.services.bedrock_client import embed_texts
from app.services.issue_classifier import classify_issues
from app.services.similarity import blend_rank, cosine_similarity
from app.storage.db import get_db
from app.storage.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/search", tags=["search"])


def _user_token(user: User | None) -> str | None:
    if not user or not user.encrypted_github_token:
        return None
    try:
        return auth_service.decrypt_token(user.encrypted_github_token)
    except Exception:
        return None  # key rotated — fall back to the app PAT


@router.get("/global", summary="Search all of GitHub for repos and issues worth contributing to")
async def global_search(
    q: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(10, ge=1, le=20),
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    token = _user_token(user)
    try:
        repos, issues = await asyncio.gather(
            github_search.search_repositories(q, token, limit),
            github_search.search_issues(q, token, limit),
        )
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        if code in (403, 429):
            raise HTTPException(429, "GitHub search rate limit hit (30 searches/minute). Wait a minute and retry.")
        if code == 422:
            raise HTTPException(400, "GitHub could not parse that query. Try plain keywords.")
        raise HTTPException(502, f"GitHub search failed ({code}).")

    fingerprint = skill_fingerprint.deserialize(user.skill_fingerprint_json) if user else None
    vector = (fingerprint or {}).get("vector")

    async def embeddings() -> list[list[float]]:
        if not vector or not (repos or issues):
            return []
        texts = [f"{r['full_name']} {r['description']} {r['language'] or ''} {' '.join(r['topics'])}" for r in repos]
        texts += [f"{i['repo']} {i['title']} {' '.join(i['labels'])}" for i in issues]
        try:
            return await embed_texts(texts)
        except Exception as exc:
            logger.warning("Fingerprint re-rank skipped (embedding failed): %r", exc)
            return []

    labels, claimed, vectors = await asyncio.gather(
        classify_issues(db, issues),
        github_search.fetch_claimed_status([i["node_id"] for i in issues], token),
        embeddings(),
    )

    for i in issues:
        i["classification"], i["classification_source"] = labels.get(i["id"], ("Feature", "heuristic"))
        i["in_progress"], i["active_prs"] = claimed.get(i["node_id"], (False, []))

    personalized = bool(vectors)
    for items, offset in ((repos, 0), (issues, len(repos))):
        base = [1 - idx / max(len(items), 1) for idx in range(len(items))]
        if personalized:
            sims = [cosine_similarity(vector, vectors[offset + idx]) for idx in range(len(items))]
            scores = blend_rank(base, sims)
            for item, sim in zip(items, sims):
                item["fingerprint_match"] = round(sim, 4)
        else:
            scores = base
        for item, score in zip(items, scores):
            item["score"] = round(score, 4)
        items.sort(key=lambda it: it["score"], reverse=True)

    for i in issues:
        i.pop("node_id", None)

    return {"query": q, "personalized": personalized, "repositories": repos, "issues": issues}
