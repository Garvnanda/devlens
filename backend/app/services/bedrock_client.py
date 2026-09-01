"""
AI client — everything runs through OpenRouter now.
  - Embeddings: NVIDIA Nemotron-3 Embed 1B (free endpoint), batched.
  - Chat:       Claude 3.7 Sonnet.
(Module name kept as `bedrock_client` for import stability — AWS Bedrock was
removed when embeddings moved to OpenRouter.)
"""

import logging

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.config import get_settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
EMBED_MODEL = "nvidia/nemotron-3-embed-1b:free"
CHAT_MODEL = "minimax/minimax-m3:free"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {get_settings().openrouter_api_key}",
        "HTTP-Referer": "https://devlens-lime.vercel.app",
        "X-Title": "DevLens",
    }


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    retry=retry_if_exception_type(httpx.HTTPError),
    reraise=True,
)
async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Batch-embed a list of strings via OpenRouter. Vectors are returned in the
    same order as `texts`. Retries with backoff on HTTP errors (handles 429
    from the free endpoint's rate limit).
    """
    if not texts:
        return []

    payload = {
        "model": EMBED_MODEL,
        "input": [t[:8000] for t in texts],
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{OPENROUTER_BASE}/embeddings",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()["data"]

    data.sort(key=lambda d: d["index"])
    return [d["embedding"] for d in data]


async def embed_text(text: str) -> list[float]:
    """Single-string convenience wrapper around `embed_texts`."""
    return (await embed_texts([text]))[0]


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    reraise=True,
)
async def call_claude(system_prompt: str, user_message: str, max_tokens: int = 2048) -> str:
    """Async wrapper for the OpenRouter Chat API."""
    payload = {
        "model": CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{OPENROUTER_BASE}/chat/completions",
            headers=_headers(),
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    return data["choices"][0]["message"]["content"]
