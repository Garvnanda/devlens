"""
Repository router — all endpoints under /api/v1/repository
"""

import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_current_user_optional
from app.storage.db import get_db
from app.storage.models import User

from app.services.ingest_service import IngestError, IngestRequest, IngestResponse, ingest_repository
from app.services.parser import GraphData, parse_repository
from app.storage.hybrid_storage import storage_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/repository", tags=["repository"])


@router.post("/ingest", response_model=IngestResponse, summary="Ingest a GitHub repository")
async def ingest(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> IngestResponse:
    """
    1. Validate the GitHub URL.
    2. Clone the repo (depth=1) to a temp directory.
    3. Fetch repository metadata from the GitHub API.
    4. Kick off Tree-sitter parsing as a background task.
    5. Return the IngestResponse immediately — parsing continues async.
    """
    try:
        response = await ingest_repository(request)
    except IngestError as exc:
        logger.warning("Ingest rejected for %s: %s", request.github_url, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unhandled exception during ingest")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Kick off parsing in the background so the HTTP response is instant
    store = storage_manager.get_store(response.repo_id, is_guest=True)
    store.delete("graph")  # a re-ingest must not report the previous run's graph as done
    store.set("status", "parsing")
    background_tasks.add_task(_run_parser_and_store, response)

    if user:  # Phase 14 memory — anonymous ingest is unaffected
        from app.services.memory_service import record_activity
        owner, repo = response.repo_id.split("/", 1)
        try:
            record_activity(db, user.github_id, owner, repo, status="explored", title=response.metadata.description)
        except Exception:
            logger.exception("Failed to record ingest activity")

    return response


@router.get(
    "/graph/{owner}/{repo}",
    response_model=GraphData,
    summary="Get the dependency graph for an already-ingested repository",
)
async def get_graph(owner: str, repo: str) -> GraphData:
    """
    Returns the cached dependency graph built by the background parser.
    Call /ingest first, then poll this endpoint until graph data is available.
    """
    repo_id = f"{owner}/{repo}"
    store = storage_manager.get_store(repo_id, is_guest=True)
    graph_data = store.get("graph")
    
    if graph_data is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No graph found for '{repo_id}'. "
                "Either the repository hasn't been ingested yet, "
                "or parsing is still in progress."
            ),
        )

    return graph_data


@router.get(
    "/status/{owner}/{repo}",
    summary="Check if background parsing is complete",
)
async def get_status(owner: str, repo: str) -> dict:
    """
    Returns the parsing status of the repository.
    """
    repo_id = f"{owner}/{repo}"
    store = storage_manager.get_store(repo_id, is_guest=True)
    status = store.get("status")
    if status in ("parsing", "failed"):
        return {"status": status}
    if store.get("graph") is not None:
        return {"status": "completed"}
    return {"status": "not_found"}

# ---------------------------------------------------------------------------
# Internal background task
# ---------------------------------------------------------------------------

async def _run_parser_and_store(ingest_response: IngestResponse) -> None:
    """
    Runs Tree-sitter parsing in a thread pool (CPU-bound) and persists the
    resulting GraphData to the in-memory RAMStore for later retrieval.
    """
    try:
        loop = asyncio.get_running_loop()
        graph: GraphData = await loop.run_in_executor(
            None,  # default ThreadPoolExecutor
            parse_repository,
            ingest_response.clone_path,
        )
        store = storage_manager.get_store(ingest_response.repo_id, is_guest=True)
        store.set("graph", graph)
        store.set("metadata", ingest_response.metadata.model_dump())
        store.set("clone_path", ingest_response.clone_path)
        store.set("status", "completed")
        logger.info(
            "Graph stored for %s: %d nodes, %d edges",
            ingest_response.repo_id,
            len(graph.nodes),
            len(graph.edges),
        )
    except Exception:
        store = storage_manager.get_store(ingest_response.repo_id, is_guest=True)
        store.set("status", "failed")
        logger.exception("Background parser failed for %s", ingest_response.repo_id)
