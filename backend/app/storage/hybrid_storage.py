"""
Phase 2: Complete HybridStorageManager with DiskStore (ChromaDB)
"""

import threading
from typing import Any
from pathlib import Path

from app.config import get_settings


# ---------------------------------------------------------------------------
# RAMStore (Phase 1 — unchanged)
# ---------------------------------------------------------------------------

class RAMStore:
    """
    Ephemeral, in-process storage for a single session.
    All data lives only in RAM and is garbage-collected when cleared.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self._lock = threading.Lock()
        self._data: dict[str, Any] = {}

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._data.get(key, default)

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def keys(self) -> list[str]:
        with self._lock:
            return list(self._data.keys())

    def __repr__(self) -> str:
        return f"<RAMStore session={self.session_id} keys={len(self._data)}>"


# ---------------------------------------------------------------------------
# DiskStore (Phase 2 — ChromaDB backed)
# ---------------------------------------------------------------------------

class DiskStore:
    """
    Persistent storage backed by ChromaDB.
    Used for authenticated users whose data must survive across sessions.
    Each session gets its own ChromaDB collection.
    """

    def __init__(self, session_id: str, chroma_path: str | None = None):
        import chromadb

        self.session_id = session_id
        # Normalize session_id to a valid ChromaDB collection name
        self._collection_name = session_id.replace("/", "_").replace("-", "_")[:63]

        path = chroma_path or get_settings().chroma_path
        Path(path).mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=path)

    # ------------------------------------------------------------------
    # Lightweight key-value store on top of ChromaDB metadata
    # (for non-vector data like parsed graph, metadata, etc.)
    # ------------------------------------------------------------------

    def _kv_collection(self):
        return self._client.get_or_create_collection(
            name=f"{self._collection_name}_kv"
        )

    def set(self, key: str, value: Any) -> None:
        import json
        col = self._kv_collection()
        serialized = json.dumps(value, default=str)
        # ChromaDB upsert: store the value as a document
        col.upsert(
            ids=[key],
            documents=[serialized],
            metadatas=[{"key": key}],
        )

    def get(self, key: str, default: Any = None) -> Any:
        import json
        try:
            col = self._kv_collection()
            result = col.get(ids=[key])
            if result["documents"]:
                return json.loads(result["documents"][0])
            return default
        except Exception:
            return default

    def delete(self, key: str) -> None:
        try:
            col = self._kv_collection()
            col.delete(ids=[key])
        except Exception:
            pass

    # ------------------------------------------------------------------
    # ChromaDB vector collection for embeddings
    # ------------------------------------------------------------------

    def get_or_create_vector_collection(self, name: str = "code_chunks"):
        """Return the ChromaDB collection used for code chunk embeddings."""
        return self._client.get_or_create_collection(
            name=f"{self._collection_name}_{name}",
            metadata={"hnsw:space": "cosine"},
        )

    def vector_query(
        self,
        collection_name: str,
        query_embeddings: list[list[float]],
        n_results: int = 10,
    ) -> dict:
        col = self._client.get_collection(
            f"{self._collection_name}_{collection_name}"
        )
        return col.query(
            query_embeddings=query_embeddings,
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )

    def __repr__(self) -> str:
        return f"<DiskStore session={self.session_id} collection={self._collection_name}>"


# ---------------------------------------------------------------------------
# HybridStorageManager
# ---------------------------------------------------------------------------

class HybridStorageManager:
    """
    Routes storage to the appropriate backend:
    - Guest users → RAMStore (ephemeral)
    - Authenticated users → DiskStore (ChromaDB, persistent)
    """

    def __init__(self) -> None:
        self._ram_sessions: dict[str, RAMStore] = {}
        self._disk_sessions: dict[str, DiskStore] = {}
        self._lock = threading.Lock()

    def get_store(self, session_id: str, *, is_guest: bool = True) -> RAMStore | DiskStore:
        if is_guest:
            with self._lock:
                if session_id not in self._ram_sessions:
                    self._ram_sessions[session_id] = RAMStore(session_id)
                return self._ram_sessions[session_id]
        else:
            with self._lock:
                if session_id not in self._disk_sessions:
                    self._disk_sessions[session_id] = DiskStore(session_id)
                return self._disk_sessions[session_id]

    def end_session(self, session_id: str) -> None:
        with self._lock:
            store = self._ram_sessions.pop(session_id, None)
        if store:
            store.clear()

    def active_sessions(self) -> list[str]:
        with self._lock:
            return list(self._ram_sessions.keys()) + list(self._disk_sessions.keys())


# Singleton
storage_manager = HybridStorageManager()
