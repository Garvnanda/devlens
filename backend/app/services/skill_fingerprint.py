"""
Phase 9, Feature 2: Skill Fingerprint Engine.

Replaces the self-reported skill dropdown with a computed profile derived
from the user's own public repos (language distribution, complexity,
contribution recency), run as a background job after first login.
"""

import json
import logging
from datetime import datetime, timezone

from app.services import github_graphql, bedrock_client

logger = logging.getLogger(__name__)


def _language_distribution(repos: list[dict]) -> dict[str, float]:
    totals: dict[str, int] = {}
    for repo in repos:
        for lang in repo.get("languages", []):
            totals[lang["name"]] = totals.get(lang["name"], 0) + lang.get("size", 0)

    grand_total = sum(totals.values())
    if grand_total == 0:
        return {}
    return {name: round(size / grand_total, 4) for name, size in totals.items()}


def _avg_repo_complexity(repos: list[dict]) -> float:
    """Normalized 0-1 complexity proxy from star counts (no file-count data available via this query)."""
    if not repos:
        return 0.0
    stars = [r.get("stars", 0) for r in repos]
    avg_stars = sum(stars) / len(stars)
    # Squash into 0-1 with a soft cap around 100 stars.
    return round(min(avg_stars / 100.0, 1.0), 4)


def _contribution_recency_days(repos: list[dict]) -> int:
    if not repos:
        return 9999
    now = datetime.now(timezone.utc)
    most_recent = None
    for repo in repos:
        pushed_at = repo.get("pushed_at")
        if not pushed_at:
            continue
        dt = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
        if most_recent is None or dt > most_recent:
            most_recent = dt
    if most_recent is None:
        return 9999
    return (now - most_recent).days


async def compute_skill_fingerprint(token: str) -> dict:
    """
    Pull the user's own repos via their OAuth token, aggregate a lightweight
    skill vector, and embed a text summary for cosine-similarity re-ranking
    (reused by Phase 10 global search and Phase 14 contest matching).
    """
    repos = await github_graphql.fetch_user_repos(token)

    language_distribution = _language_distribution(repos)
    avg_complexity = _avg_repo_complexity(repos)
    recency_days = _contribution_recency_days(repos)

    top_languages = sorted(language_distribution.items(), key=lambda kv: kv[1], reverse=True)[:5]
    summary_text = (
        f"Developer skilled in: {', '.join(name for name, _ in top_languages) or 'general programming'}. "
        f"Average repo complexity score {avg_complexity}. "
        f"Last active {recency_days} days ago."
    )
    vector = await bedrock_client.embed_text(summary_text)

    return {
        "language_distribution": language_distribution,
        "avg_repo_complexity": avg_complexity,
        "contribution_recency_days": recency_days,
        "vector": vector,
    }


def serialize(fingerprint: dict) -> str:
    return json.dumps(fingerprint)


def deserialize(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None
