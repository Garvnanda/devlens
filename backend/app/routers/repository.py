"""
Repository router — all endpoints under /api/v1/repository
"""

import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.services.ingest_service import IngestRequest, IngestResponse, ingest_repository
from app.services.parser import GraphData, parse_repository
from app.storage.hybrid_storage import storage_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/repository", tags=["repository"])


@router.post("/ingest", response_model=IngestResponse, summary="Ingest a GitHub repository")
async def ingest(request: IngestRequest, background_tasks: BackgroundTasks) -> IngestResponse:
    """
    1. Validate the GitHub URL.
    2. Clone the repo (depth=1) to a temp directory.
    3. Fetch repository metadata from the GitHub API.
    4. Kick off Tree-sitter parsing as a background task.
    5. Return the IngestResponse immediately — parsing continues async.
    """
    try:
        response = await ingest_repository(request)
    except Exception as exc:
        logger.exception("Unhandled exception during ingest")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if response.status == "error":
        logger.error("Ingest error for %s: %s", request.github_url, response.message)
        raise HTTPException(status_code=500, detail=response.message or "Ingestion failed — check server logs.")

    # Kick off parsing in the background so the HTTP response is instant
    store = storage_manager.get_store(response.repo_id, is_guest=True)
    store.set("status", "parsing")
    background_tasks.add_task(_run_parser_and_store, response)

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
    
    # If the store has 'graph', parsing is done.
    # If it has 'clone_path' but no graph, it might still be parsing or failed.
    # Since we set clone_path after parsing in _run_parser_and_store, actually both are set together.
    # Wait, during ingest we don't set anything in the RAMStore until parsing finishes!
    # Let's fix that too: we should set "status": "parsing" in RAMStore right before kicking off the background task, so we know it's tracking.
    if store.get("graph") is not None:
        return {"status": "completed"}
    elif store.get("status") == "parsing":
        return {"status": "parsing"}
    else:
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
