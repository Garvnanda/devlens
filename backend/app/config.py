from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # GitHub
    github_pat: str = ""

    # Storage
    storage_mode: str = "ram"          # "ram" | "disk"
    chroma_path: str = "./chroma_db"   # path for ChromaDB PersistentClient

    # OpenRouter (embeddings + chat)
    openrouter_api_key: str = ""

    # Phase 9 — Identity Layer
    github_oauth_client_id: str = ""
    github_oauth_client_secret: str = ""
    jwt_secret: str = "dev-insecure-secret-change-me"
    token_encryption_key: str = ""  # Fernet key — generate with Fernet.generate_key()
    db_path: str = "./devlens.db"
    frontend_url: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
