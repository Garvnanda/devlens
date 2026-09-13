"""
AI client — everything runs through OpenRouter, free-tier models only.
  - Embeddings: NVIDIA Nemotron-3 Embed 1B (free endpoint), batched.
  - Chat:       NVIDIA Nemotron-3 Super 120B (free), with free fallbacks.
(Module name kept as `bedrock_client` for import stability — AWS Bedrock was
removed when embeddings moved to OpenRouter.)
"""

import logging

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
    retry_if_exception_type,
)

from app.config import get_settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
EMBED_MODEL = "nvidia/nemotron-3-embed-1b:free"
# Free models get retired or rate-limited upstream without notice, so OpenRouter
# tries these in order. All must stay ":free" — the account has no credits.
CHAT_MODELS = [
    "nvidia/nemotron-3-super-120b-a12b:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
]


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

class UpstreamError(Exception):
    """OpenRouter answered 200 but carried a provider error instead of a completion."""


def _is_transient(exc: BaseException) -> bool:
    """Retry rate limits, upstream 5xx and network blips — not 4xx like a bad key or dead model."""
    if isinstance(exc, UpstreamError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return isinstance(exc, httpx.TransportError)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception(_is_transient),
    reraise=True,
)
async def call_claude(system_prompt: str, user_message: str, max_tokens: int = 2048) -> str:
    """Async wrapper for the OpenRouter Chat API (name kept for import stability)."""
    payload = {
        "models": CHAT_MODELS,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": max_tokens,
        # Nemotron is a reasoning model: hidden thinking otherwise eats the token budget
        # and adds ~8s per call. Low effort keeps quality acceptable and calls fast.
        "reasoning": {"effort": "low", "exclude": True},
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{OPENROUTER_BASE}/chat/completions",
            headers=_headers(),
            json=payload,
        )
        if response.status_code >= 400:
            logger.error("OpenRouter chat error %s: %s", response.status_code, response.text[:300])
        response.raise_for_status()
        data = response.json()

    if not data.get("choices"):
        raise UpstreamError(f"OpenRouter returned no completion: {str(data.get('error', data))[:200]}")
    content = data["choices"][0]["message"].get("content")
    if not content:
        raise ValueError(f"OpenRouter returned an empty completion (model={data.get('model')})")
    return content
