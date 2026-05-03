from fastapi import APIRouter

from backend.config import settings
from backend.models import ConfigResponse

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config", response_model=ConfigResponse)
def get_config():
    has_maptiler_key = bool(settings.maptiler_key)
    return ConfigResponse(
        maptiler_key=settings.maptiler_key,
        map_source=settings.map_source,
        debug_info={
            "env_file_found": bool(settings.env_path),
            "maptiler_key_configured": has_maptiler_key,
            "amap_key_configured": bool(settings.amap_key),
            "map_source": settings.map_source,
            "maptiler_key_length": len(settings.maptiler_key),
            "env_path": settings.env_path,
        },
    )
