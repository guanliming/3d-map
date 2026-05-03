from fastapi import APIRouter, Query

from backend.models import ScenicSpotResponse
from backend.services.amap import search_scenic_spots

router = APIRouter(prefix="/api", tags=["scenic spots"])


@router.get("/scenic_spots", response_model=ScenicSpotResponse)
async def get_scenic_spots(
    lat: float = Query(..., description="纬度", example=31.2304),
    lon: float = Query(..., description="经度", example=121.4737),
    radius: float = Query(10, description="搜索半径（公里），高德周边搜索最大按 50 公里处理", example=10),
):
    try:
        spots = await search_scenic_spots(lat=lat, lon=lon, radius_km=radius)
        return ScenicSpotResponse(total=len(spots), spots=spots, source="amap", message="获取成功")
    except RuntimeError as exc:
        return ScenicSpotResponse(total=0, spots=[], source="amap", message=str(exc))
    except Exception:
        return ScenicSpotResponse(total=0, spots=[], source="amap", message="高德 POI 查询失败")
