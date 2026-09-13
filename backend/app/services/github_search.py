"""
Phase 10: Global Radar — thin wrappers over GitHub's REST Search API, plus a single-shot
GraphQL "already claimed?" lookup for the returned issues.

Distinct from the Hybrid Vector Engine (Phase 3), which only searches repos already ingested.
"""

import logging
from typing import Any

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.services.github_issues import _has_open_referencing_pr

logger = logging.getLogger(__name__)


def _headers(token: str | None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "DevLens-Search",
    }
    auth = token or get_settings().github_pat
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    return headers


def _transient(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return isinstance(exc, httpx.TransportError)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=6), retry=retry_if_exception(_transient), reraise=True)
async def search_repositories(query: str, token: str | None, limit: int) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            "https://api.github.com/search/repositories",
            headers=_headers(token),
            params={"q": f"{query} archived:false", "per_page": limit},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])

    return [
        {
            "full_name": r["full_name"],
            "url": r["html_url"],
            "description": r.get("description") or "",
            "stars": r.get("stargazers_count", 0),
            "language": r.get("language"),
            "topics": r.get("topics", []),
            "open_issues": r.get("open_issues_count", 0),
            "updated_at": r.get("pushed_at"),
        }
        for r in items
    ]


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=6), retry=retry_if_exception(_transient), reraise=True)
async def search_issues(query: str, token: str | None, limit: int) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(
            "https://api.github.com/search/issues",
            headers=_headers(token),
            params={"q": f"{query} is:issue is:open archived:false", "per_page": limit},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])

    results = []
    for i in items:
        repo = i["repository_url"].split("/repos/", 1)[-1]
        results.append({
            "id": i["id"],
            "node_id": i["node_id"],
            "number": i["number"],
            "title": i["title"],
            "body_preview": (i.get("body") or "")[:400],
            "url": i["html_url"],
            "repo": repo,
            "labels": [lbl["name"] for lbl in i.get("labels", [])],
            "comments": i.get("comments", 0),
            "created_at": i.get("created_at"),
        })
    return results


_CLAIMED_QUERY = """
query Claimed($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue {
      id
      timelineItems(first: 10, itemTypes: CROSS_REFERENCED_EVENT) {
        nodes { ... on CrossReferencedEvent { source { ... on PullRequest { state url } } } }
      }
    }
  }
}
"""


async def fetch_claimed_status(node_ids: list[str], token: str | None) -> dict[str, tuple[bool, list[str]]]:
    """
    One GraphQL round-trip for every issue: is an OPEN pull request already referencing it?
    Reuses the Phase 6 matcher's timeline walk. Returns {} on failure — the claimed flag is a
    hint, not worth failing the whole search over.
    """
    if not node_ids:
        return {}
    auth = token or get_settings().github_pat
    if not auth:
        return {}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.github.com/graphql",
                headers={"Authorization": f"Bearer {auth}", "User-Agent": "DevLens-Search"},
                json={"query": _CLAIMED_QUERY, "variables": {"ids": node_ids}},
            )
            resp.raise_for_status()
            nodes = resp.json().get("data", {}).get("nodes", []) or []
    except Exception as exc:
        logger.warning("Claimed-status lookup failed: %r", exc)
        return {}

    status = {}
    for node in nodes:
        if node and node.get("id"):
            status[node["id"]] = _has_open_referencing_pr(node.get("timelineItems", {}).get("nodes", []))
    return status
