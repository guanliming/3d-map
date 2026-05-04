from pathlib import Path
import os

from dotenv import load_dotenv
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"


def _load_env_file() -> Path | None:
    candidates = [
        BASE_DIR / ".env",
        BACKEND_DIR / ".env",
        Path.cwd() / ".env",
    ]

    for env_file in candidates:
        if env_file.exists():
            load_dotenv(env_file, override=False)
            return env_file

    load_dotenv(override=False)
    return None


ENV_PATH = _load_env_file()


class Settings(BaseModel):
    maptiler_key: str = os.getenv("MAPTILER_KEY", "").strip()
    amap_key: str = os.getenv("AMAP_KEY", "").strip()
    map_source: str = os.getenv("MAP_SOURCE", "auto").strip().lower()
    postgres_host: str = os.getenv("POSTGRES_HOST", "localhost").strip()
    postgres_port: int = int(os.getenv("POSTGRES_PORT", "5432"))
    postgres_user: str = os.getenv("POSTGRES_USER", "postgres").strip()
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    postgres_database: str = os.getenv("POSTGRES_DATABASE", "map3d").strip()
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-in-production").strip()
    jwt_algorithm: str = "HS256"
    cors_origins: list[str] = ["*"]
    env_path: str | None = str(ENV_PATH) if ENV_PATH else None
    debug_enabled: bool = os.getenv("DEBUG_ENABLED", "false").strip().lower() == "true"


settings = Settings()
