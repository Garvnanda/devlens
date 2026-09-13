"""
Phase 5: Institutional Memory Via GitHub GraphQL v4
Fetches the last N merged PRs, their associated issues, and files changed.
"""

import logging
import httpx
from typing import Dict, Any, List

from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

logger = logging.getLogger(__name__)

# The GraphQL query requests:
# 1. The repository
# 2. Last X pull requests (merged)
# 3. For each PR: Title, url, mergedAt, author
# 4. Closing issues associated with the PR
# 5. First 20 files changed in the PR

GRAPHQL_QUERY = """
query GetRepositoryHistory($owner: String!, $repo: String!, $prCount: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(last: $prCount, states: MERGED, orderBy: {field: CREATED_AT, direction: ASC}) {
      nodes {
        title
        url
        mergedAt
        author {
          login
        }
        closingIssuesReferences(first: 5) {
          nodes {
            title
            url
            number
          }
        }
        files(first: 20) {
          nodes {
            path
            additions
            deletions
          }
        }
      }
    }
  }
}
"""

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
async def fetch_repository_history(
    owner: str, repo: str, limit: int = 50, token: str | None = None
) -> List[Dict[str, Any]]:
    """
    Fetches the institutional memory for a repository using a single GraphQL shot.
    Returns a list of parsed PRs with issues and changed files mapping.

    `token`: per-user GitHub OAuth token (Phase 9). Falls back to the app-wide
    PAT when not provided, so every existing anonymous caller is unaffected.
    """
    settings = get_settings()

    headers = {
        "Authorization": f"Bearer {token or settings.github_pat}",
        "Content-Type": "application/json",
        "User-Agent": "DevLens-GraphQL-Client"
    }

    variables = {
        "owner": owner,
        "repo": repo,
        "prCount": limit
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.github.com/graphql",
            headers=headers,
            json={"query": GRAPHQL_QUERY, "variables": variables}
        )
        
        response.raise_for_status()
        data = response.json()
        
        if "errors" in data:
            logger.error(f"GraphQL errors: {data['errors']}")
            raise ValueError(f"GitHub GraphQL returned errors: {data['errors'][0].get('message')}")

        repo_data = data.get("data", {}).get("repository")
        if not repo_data:
            return []

        prs = repo_data.get("pullRequests", {}).get("nodes", [])
        
        # Flatten and format the results
        formatted_history = []
        for pr in prs:
            if not pr:
                continue
                
            issues = []
            if pr.get("closingIssuesReferences") and pr["closingIssuesReferences"].get("nodes"):
                for issue in pr["closingIssuesReferences"]["nodes"]:
                    if issue:
                        issues.append({
                            "number": issue.get("number"),
                            "title": issue.get("title"),
                            "url": issue.get("url")
                        })
            
            files = []
            if pr.get("files") and pr["files"].get("nodes"):
                for f in pr["files"]["nodes"]:
                    if f:
                        files.append(f.get("path"))

            formatted_history.append({
                "title": pr.get("title"),
                "url": pr.get("url"),
                "merged_at": pr.get("mergedAt"),
                "author": pr.get("author", {}).get("login") if pr.get("author") else "Unknown",
                "linked_issues": issues,
                "changed_files": files
            })
            
        # Reverse to show newest first
        formatted_history.reverse()
        return formatted_history


# ── Phase 9: Skill Fingerprint — authenticated user's own repos ──────────

USER_REPOS_QUERY = """
query GetUserRepos {
  viewer {
    repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name
        stargazerCount
        pushedAt
        primaryLanguage { name }
        languages(first: 10) {
          edges {
            size
            node { name }
          }
        }
      }
    }
  }
}
"""


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
async def fetch_user_repos(token: str) -> List[Dict[str, Any]]:
    """
    Fetch the authenticated user's own repositories (name, stars, pushedAt,
    per-language byte counts) for Phase 9's Skill Fingerprint computation.
    Always uses the user's own OAuth token — never falls back to the app PAT.
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "DevLens-GraphQL-Client",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            "https://api.github.com/graphql",
            headers=headers,
            json={"query": USER_REPOS_QUERY, "variables": {}},
        )
        response.raise_for_status()
        data = response.json()

        if "errors" in data:
            logger.error(f"GraphQL errors: {data['errors']}")
            raise ValueError(f"GitHub GraphQL returned errors: {data['errors'][0].get('message')}")

        repos = data.get("data", {}).get("viewer", {}).get("repositories", {}).get("nodes", [])

        formatted = []
        for repo in repos:
            if not repo:
                continue
            languages = []
            for edge in repo.get("languages", {}).get("edges", []) or []:
                if edge and edge.get("node"):
                    languages.append({"name": edge["node"]["name"], "size": edge.get("size", 0)})
            formatted.append({
                "name": repo.get("name"),
                "stars": repo.get("stargazerCount", 0),
                "pushed_at": repo.get("pushedAt"),
                "languages": languages,
            })
        return formatted
