"""
DevLens Backend – FastAPI entrypoint
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import repository, intelligence, chatbot, auth, search, memory
from app.storage.db import Base, engine, ensure_columns
from app.storage import models  # noqa: F401 — registers tables on Base.metadata

Base.metadata.create_all(bind=engine)
ensure_columns()

app = FastAPI(
    title="DevLens API",
    description=(
        "AI-powered codebase navigator. "
        "Phases 1-7: Ingestion, Graph, Intelligence & Architect Agent."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow all origins during development
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(repository.router)
app.include_router(intelligence.router)
app.include_router(chatbot.router)
app.include_router(auth.router)
app.include_router(search.router)
app.include_router(memory.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["meta"], summary="Health check")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


# ---------------------------------------------------------------------------
# Dev runner
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
