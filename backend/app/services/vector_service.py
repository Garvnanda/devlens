"""
Phase 2: Vector Service
- Smart chunker: splits files by class/function using Tree-sitter output
- Embeds chunks with AWS Bedrock Titan v2
- Stores in ChromaDB with BM25 sparse metadata
- asyncio.Semaphore caps concurrent Bedrock calls to avoid 429s
"""

import asyncio
import hashlib
import logging
from pathlib import Path

from pydantic import BaseModel

from app.services.parser import parse_repository, Node
from app.services.bedrock_client import embed_text
from app.storage.hybrid_storage import storage_manager, DiskStore
from app.config import get_settings

logger = logging.getLogger(__name__)

# Max concurrent embedding requests to Bedrock (avoid 429 rate limit bursts)
BEDROCK_SEMAPHORE = asyncio.Semaphore(50)

# Chunk size limits (characters)
MAX_CHUNK_CHARS = 6000   # ~1500 tokens, well within Titan's 8k limit
MIN_CHUNK_CHARS = 50     # skip trivially small chunks


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CodeChunk(BaseModel):
    chunk_id: str       # unique hash
    file_path: str      # relative path in repo
    language: str
    chunk_type: str     # "class" | "function" | "module"
    content: str        # raw source text of the chunk
    start_line: int = 0
    end_line: int = 0


class VectorizeResponse(BaseModel):
    repo_id: str
    total_files: int
    total_chunks: int
    embedded_chunks: int
    skipped_chunks: int
    status: str


# ---------------------------------------------------------------------------
# Smart chunker (Tree-sitter based)
# ---------------------------------------------------------------------------

def _chunk_file(file_path: str, language: str, source: bytes) -> list[CodeChunk]:
    """
    Split a source file into logical chunks by class/function boundaries.
    Falls back to whole-file as one chunk for small or unparsable files.
    """
    from tree_sitter_languages import get_language, get_parser

    chunks: list[CodeChunk] = []

    # Query strings to find top-level classes and functions
    CHUNK_QUERIES: dict[str, str] = {
        "python": """
            (class_definition name: (identifier) @name) @class
            (function_definition name: (identifier) @name) @function
        """,
        "javascript": """
            (class_declaration name: (identifier) @name) @class
            (function_declaration name: (identifier) @name) @function
            (arrow_function) @function
        """,
        "typescript": """
            (class_declaration name: (identifier) @name) @class
            (function_declaration name: (identifier) @name) @function
        """,
        "go": """
            (function_declaration name: (identifier) @name) @function
            (type_declaration (type_spec name: (type_identifier) @name)) @class
        """,
    }

    query_src = CHUNK_QUERIES.get(language)
    if not query_src:
        # No chunking query for this language — return the whole file
        content = source.decode(errors="replace")
        if len(content) >= MIN_CHUNK_CHARS:
            chunks.append(CodeChunk(
                chunk_id=_make_id(file_path, content),
                file_path=file_path,
                language=language,
                chunk_type="module",
                content=content[:MAX_CHUNK_CHARS],
            ))
        return chunks

    try:
        lang_obj = get_language(language)
        parser = get_parser(language)
        tree = parser.parse(source)
        query = lang_obj.query(query_src)
        captures = query.captures(tree.root_node)

        seen_ranges: set[tuple[int, int]] = set()
        for node, capture_name in captures:
            if capture_name in ("class", "function"):
                start = node.start_point[0]
                end = node.end_point[0]
                range_key = (start, end)
                if range_key in seen_ranges:
                    continue
                seen_ranges.add(range_key)

                content = node.text.decode(errors="replace")
                if len(content) < MIN_CHUNK_CHARS:
                    continue

                # If a single node is too big, split into 2 halves naively
                if len(content) > MAX_CHUNK_CHARS:
                    content = content[:MAX_CHUNK_CHARS]

                chunk_type = "class" if "class" in capture_name else "function"
                chunks.append(CodeChunk(
                    chunk_id=_make_id(file_path, content),
                    file_path=file_path,
                    language=language,
                    chunk_type=chunk_type,
                    content=content,
                    start_line=start,
                    end_line=end,
                ))

    except Exception as exc:
        logger.warning("Chunking failed for %s (%s): %s", file_path, language, exc)

    # Fallback: if no chunks extracted, use whole file
    if not chunks:
        content = source.decode(errors="replace")
        if len(content) >= MIN_CHUNK_CHARS:
            chunks.append(CodeChunk(
                chunk_id=_make_id(file_path, content),
                file_path=file_path,
                language=language,
                chunk_type="module",
                content=content[:MAX_CHUNK_CHARS],
            ))

    return chunks


def _make_id(file_path: str, content: str) -> str:
    """Stable, collision-resistant chunk ID."""
    return hashlib.sha256(f"{file_path}::{content[:200]}".encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Chunking entire repo
# ---------------------------------------------------------------------------

def chunk_repository(clone_path: str, nodes: list[Node]) -> list[CodeChunk]:
    """Build chunks from all parsed nodes."""
    root = Path(clone_path)
    all_chunks: list[CodeChunk] = []

    for node in nodes:
        abs_path = root / node.id
        try:
            source = abs_path.read_bytes()
        except OSError:
            continue
        chunks = _chunk_file(node.id, node.language, source)
        all_chunks.extend(chunks)

    logger.info("Chunked %d files into %d chunks", len(nodes), len(all_chunks))
    return all_chunks


# ---------------------------------------------------------------------------
# Embedding (concurrent with semaphore)
# ---------------------------------------------------------------------------

async def _embed_chunk(chunk: CodeChunk) -> tuple[CodeChunk, list[float] | None]:
    async with BEDROCK_SEMAPHORE:
        try:
            vector = await embed_text(chunk.content)
            return chunk, vector
        except Exception as exc:
            logger.warning("Embedding failed for %s: %s", chunk.chunk_id, exc)
            return chunk, None


# ---------------------------------------------------------------------------
# Store in ChromaDB
# ---------------------------------------------------------------------------

def _store_chunks_in_chroma(
    disk_store: DiskStore,
    chunks: list[CodeChunk],
    vectors: list[list[float]],
) -> None:
    col = disk_store.get_or_create_vector_collection("code_chunks")

    # Batch upsert (ChromaDB recommends batches ≤ 5000)
    BATCH = 500
    for i in range(0, len(chunks), BATCH):
        batch_c = chunks[i : i + BATCH]
        batch_v = vectors[i : i + BATCH]
        col.upsert(
            ids=[c.chunk_id for c in batch_c],
            embeddings=batch_v,
            documents=[c.content for c in batch_c],
            metadatas=[
                {
                    "file_path": c.file_path,
                    "language": c.language,
                    "chunk_type": c.chunk_type,
                    "start_line": c.start_line,
                    "end_line": c.end_line,
                }
                for c in batch_c
            ],
        )


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

async def vectorize_repository(owner: str, repo: str) -> VectorizeResponse:
    """
    Full Phase 2 pipeline:
    1. Get the graph (must be ingested first)
    2. Chunk all source files by class/function
    3. Embed with Bedrock Titan v2 (50-concurrent semaphore)
    4. Store in ChromaDB DiskStore
    """
    repo_id = f"{owner}/{repo}"

    # Pull clone_path from the RAM store (set during ingestion)
    ram_store = storage_manager.get_store(repo_id, is_guest=True)
    graph_data = ram_store.get("graph")
    meta = ram_store.get("metadata")

    if graph_data is None:
        raise ValueError(f"No graph found for '{repo_id}'. Please ingest the repository first.")

    clone_path = ram_store.get("clone_path")
    if not clone_path:
        raise ValueError(f"No clone path found for '{repo_id}'.")

    nodes = [Node(**n) for n in graph_data["nodes"]] if isinstance(graph_data, dict) else graph_data.nodes

    # Step 1: Smart chunk
    chunks = await asyncio.get_running_loop().run_in_executor(
        None, chunk_repository, clone_path, nodes
    )

    if not chunks:
        return VectorizeResponse(
            repo_id=repo_id,
            total_files=len(nodes),
            total_chunks=0,
            embedded_chunks=0,
            skipped_chunks=0,
            status="no_chunks",
        )

    # Step 2: Embed concurrently (semaphore-limited)
    results = await asyncio.gather(*[_embed_chunk(c) for c in chunks])

    embedded: list[CodeChunk] = []
    vectors: list[list[float]] = []
    skipped = 0
    for chunk, vector in results:
        if vector is not None:
            embedded.append(chunk)
            vectors.append(vector)
        else:
            skipped += 1

    # Step 3: Store in ChromaDB (DiskStore for the repo)
    disk_store = storage_manager.get_store(repo_id, is_guest=False)
    if embedded:
        await asyncio.get_running_loop().run_in_executor(
            None, _store_chunks_in_chroma, disk_store, embedded, vectors
        )
        # Also save clone_path into disk store so search can use it
        disk_store.set("clone_path", clone_path)

    logger.info(
        "Vectorized %s: %d chunks embedded, %d skipped",
        repo_id, len(embedded), skipped,
    )

    return VectorizeResponse(
        repo_id=repo_id,
        total_files=len(nodes),
        total_chunks=len(chunks),
        embedded_chunks=len(embedded),
        skipped_chunks=skipped,
        status="vectorized",
    )
