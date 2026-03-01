import asyncio
import httpx
from app.config import get_settings

async def test():
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            'https://openrouter.ai/api/v1/embeddings',
            headers={'Authorization': f'Bearer {settings.openrouter_api_key}'},
            json={'model': 'huggingface/baai/bge-large-en-v1.5', 'input': 'hello'}
        )
        print(resp.status_code)
        print(resp.text)

asyncio.run(test())
