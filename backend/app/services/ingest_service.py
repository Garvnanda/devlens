"""
IngestService — handles repository cloning and GitHub metadata fetching.
"""

import asyncio
import logging
import re
import tempfile
from pathlib import Path

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
from pydantic import BaseModel, field_validator

from app.config import get_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class IngestRequest(BaseModel):
    github_url: str
    github_pat: str | None = None  # overrides settings PAT if provided

    @field_validator("github_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        # Accept what people actually paste: no scheme, www., .git, /tree/main, trailing slash.
        m = re.match(
            r"^(?:https?://)?(?:www\.)?github\.com/([\w.\-]+)/([\w.\-]+?)(?:\.git)?(?:/.*)?$",
            v.strip(),
        )
        if not m:
            raise ValueError(
                "URL must be a valid GitHub repository URL, e.g. "
                "https://github.com/owner/repo"
            )
        return f"https://github.com/{m.group(1)}/{m.group(2)}"


class RepoMetadata(BaseModel):
    name: str
    full_name: str
    description: str | None
    stars: int
    forks: int
    language: str | None
    default_branch: str
    topics: list[str] = []
    html_url: str


class IngestResponse(BaseModel):
    repo_id: str          # "{owner}/{repo}"
    metadata: RepoMetadata
    clone_path: str       # absolute path to the temp clone dir
    status: str           # "ingested" | "error"
    message: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_owner_repo(github_url: str) -> tuple[str, str]:
    """Extract (owner, repo) from a validated GitHub URL."""
    parts = github_url.replace("https://github.com/", "").split("/")
    return parts[0], parts[1]


async def clone_repo(url: str, dest: str) -> Path:
    """
    Shallow-clone `url` into `dest` using a native git subprocess.
    Uses depth=1 to grab only the latest commit (fast, rate-limit safe).
    """
    import os
    import subprocess
    loop = asyncio.get_running_loop()

    def run_git_clone():
        return subprocess.run(
            ["git", "clone", "--depth", "1", url, dest],
            capture_output=True,
            text=True,
            timeout=180,
            # Never block on an interactive credential prompt — fail fast instead.
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )

    try:
        result = await loop.run_in_executor(None, run_git_clone)
    except subprocess.TimeoutExpired:
        raise IngestError(504, "Cloning took longer than 3 minutes — the repository is too large to ingest.")

    if result.returncode != 0:
        err = result.stderr.strip()
        if "not found" in err.lower() or "could not read username" in err.lower() or "authentication" in err.lower():
            raise IngestError(
                404,
                "Repository not found, or it is private. DevLens can only ingest public "
                "repositories (or private ones your GITHUB_PAT can access).",
            )
        raise IngestError(400, f"git clone failed: {err[-300:]}")

    return Path(dest)


class IngestError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return isinstance(exc, httpx.TransportError)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception(_is_transient),
    reraise=True,
)
async def fetch_metadata(
    owner: str,
    repo: str,
    pat: str | None = None,
) -> RepoMetadata:
    """
    Fetch repository metadata from the GitHub REST API.
    Retries up to 3× with exponential backoff on HTTP errors (handles 429).
    """
    settings = get_settings()
    token = pat or settings.github_pat

    headers: dict[str, str] = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

    return RepoMetadata(
        name=data["name"],
        full_name=data["full_name"],
        description=data.get("description"),
        stars=data.get("stargazers_count", 0),
        forks=data.get("forks_count", 0),
        language=data.get("language"),
        default_branch=data.get("default_branch", "main"),
        topics=data.get("topics", []),
        html_url=data["html_url"],
    )


# ---------------------------------------------------------------------------
# Main entrypoint used by the router
# ---------------------------------------------------------------------------

async def ingest_repository(request: IngestRequest) -> IngestResponse:
    """
    Orchestrates: parse URL → clone repo → fetch metadata.
    Returns a structured IngestResponse.
    """
    owner, repo = _parse_owner_repo(request.github_url)
    repo_id = f"{owner}/{repo}"

    # mkdtemp creates the parent dir; git clone needs a NON-EXISTENT destination
    # so we use a subpath inside the temp parent that doesn't exist yet.
    parent_temp = tempfile.mkdtemp(prefix=f"devlens_")
    dest = str(Path(parent_temp) / f"{owner}_{repo}")

    # Clone and metadata run concurrently. The clone is what matters; metadata is
    # display-only, so a private repo the PAT can't see (API 404) must not fail ingest.
    clone_result, meta_result = await asyncio.gather(
        clone_repo(request.github_url, dest),
        fetch_metadata(owner, repo, pat=request.github_pat),
        return_exceptions=True,
    )

    if isinstance(clone_result, BaseException):
        if isinstance(clone_result, IngestError):
            raise clone_result
        raise IngestError(500, f"Clone failed: {clone_result!r}")
    clone_path = clone_result

    if isinstance(meta_result, BaseException):
        logger.warning("Metadata fetch failed for %s (continuing without it): %r", repo_id, meta_result)
        metadata = RepoMetadata(
            name=repo,
            full_name=repo_id,
            description=None,
            stars=0,
            forks=0,
            language=None,
            default_branch="main",
            html_url=request.github_url,
        )
    else:
        metadata = meta_result

    return IngestResponse(
        repo_id=repo_id,
        metadata=metadata,
        clone_path=str(clone_path),
        status="ingested",
    )
