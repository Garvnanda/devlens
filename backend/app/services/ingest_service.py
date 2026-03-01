"""
IngestService — handles repository cloning and GitHub metadata fetching.
"""

import asyncio
import re
import tempfile
from pathlib import Path

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from pydantic import BaseModel, field_validator

from app.config import get_settings


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class IngestRequest(BaseModel):
    github_url: str
    github_pat: str | None = None  # overrides settings PAT if provided

    @field_validator("github_url")
    @classmethod
    def validate_github_url(cls, v: str) -> str:
        v = v.strip().rstrip("/")
        pattern = r"^https://github\.com/[\w.\-]+/[\w.\-]+$"
        if not re.match(pattern, v):
            raise ValueError(
                "URL must be a valid GitHub repository URL, e.g. "
                "https://github.com/owner/repo"
            )
        return v


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
    import subprocess
    loop = asyncio.get_running_loop()
    
    def run_git_clone():
        return subprocess.run(
            ["git", "clone", "--depth", "1", url, dest],
            capture_output=True,
            text=True
        )
        
    result = await loop.run_in_executor(None, run_git_clone)

    if result.returncode != 0:
        err = result.stderr.strip()
        raise RuntimeError(f"git clone failed: {err}")

    return Path(dest)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
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

    try:
        # Run clone and metadata fetch concurrently
        clone_task = asyncio.create_task(clone_repo(request.github_url, dest))
        meta_task = asyncio.create_task(
            fetch_metadata(owner, repo, pat=request.github_pat)
        )
        clone_path, metadata = await asyncio.gather(clone_task, meta_task)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return IngestResponse(
            repo_id=repo_id,
            metadata=RepoMetadata(
                name=repo,
                full_name=repo_id,
                description=None,
                stars=0,
                forks=0,
                language=None,
                default_branch="main",
                html_url=request.github_url,
            ),
            clone_path=dest,
            status="error",
            message=repr(exc),
        )

    return IngestResponse(
        repo_id=repo_id,
        metadata=metadata,
        clone_path=str(clone_path),
        status="ingested",
    )
