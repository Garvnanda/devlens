"""
OpenRouter client setup.
Initialises httpx client for Nemotron-3 (chat/explain) and a free embedding model.
"""

import json
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.config import get_settings

logger = logging.getLogger(__name__)

# Model IDs
# User requested model:
CHAT_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free"
# Using a free embedding model from OpenRouter/HuggingFace since Titan is removed
EMBED_MODEL = "huggingface/baai/bge-large-en-v1.5"


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    reraise=True,
)
async def embed_text(text: str) -> list[float]:
    """
    Async wrapper: calls OpenRouter Embeddings API.
    """
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "DevLens",
    }
    
    # BGE-large-en max context is generally 512 tokens, we truncate aggressively
    payload = {
        "model": EMBED_MODEL,
        "input": text[:2000]
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/embeddings",
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        data = response.json()
        
    return data["data"][0]["embedding"]


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
    reraise=True,
)
async def call_claude(system_prompt: str, user_message: str, max_tokens: int = 2048) -> str:
    """
    Async wrapper for OpenRouter Chat API (Nemotron 3).
    Note: Function is still named call_claude to avoid refactoring the router layer.
    """
    settings = get_settings()
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "DevLens",
    }
    
    payload = {
        "model": CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "max_tokens": max_tokens,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        data = response.json()
        
    return data["choices"][0]["message"]["content"]
