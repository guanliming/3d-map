from fastapi import APIRouter, HTTPException, Query

from backend.models import FogCellsResponse, FogUnlockRequest, FogUnlockResponse, TopicCreate, TopicResponse, Topic
from backend.services.postgres import get_unlocked_h3_cells, unlock_h3_cells_for_location
from backend.services.topic_store import topic_store
from backend.utils import aggregate_topic_beacons, select_topics_for_explore

router = APIRouter(prefix="/api", tags=["topics"])


@router.get("/fog/unlocked", response_model=FogCellsResponse)
async def get_unlocked_fog_cells(user_id: str = Query(..., description="匿名用户ID")):
    cells = get_unlocked_h3_cells(user_id)
    return FogCellsResponse(total=len(cells), cells=cells)


@router.post("/fog/unlock", response_model=FogUnlockResponse)
async def unlock_fog_cells(data: FogUnlockRequest):
    result = unlock_h3_cells_for_location(data.user_id, data.lat, data.lon, disk_radius=1)
    cells = get_unlocked_h3_cells(data.user_id)
    return FogUnlockResponse(success=True, cells=cells, **result)


@router.post("/topics", status_code=201)
async def create_topic(data: TopicCreate):
    topic_id = topic_store.create_topic(
        data.user_name,
        data.content,
        data.lat,
        data.lon,
        data.image,
        data.scenic_spot_name,
        data.scenic_spot_distance_m,
    )
    return {"success": True, "topic_id": topic_id, "message": "话题发布成功"}


@router.get("/topics", response_model=TopicResponse)
async def get_topics(
    center_lat: float = Query(..., description="中心点纬度"),
    center_lon: float = Query(..., description="中心点经度"),
    sw_lat: float = Query(..., description="视口西南角纬度"),
    sw_lon: float = Query(..., description="视口西南角经度"),
    ne_lat: float = Query(..., description="视口东北角纬度"),
    ne_lon: float = Query(..., description="视口东北角经度"),
):
    all_topics = topic_store.get_all_topics()
    selected = await select_topics_for_explore(all_topics, center_lat, center_lon, sw_lat, sw_lon, ne_lat, ne_lon)
    topics = [Topic(**topic) for topic in selected]
    return TopicResponse(total=len(topics), topics=topics, center_lat=center_lat, center_lon=center_lon)


@router.get("/topics/beacons")
async def get_topic_beacons(
    sw_lat: float = Query(..., description="视口西南角纬度"),
    sw_lon: float = Query(..., description="视口西南角经度"),
    ne_lat: float = Query(..., description="视口东北角纬度"),
    ne_lon: float = Query(..., description="视口东北角经度"),
):
    all_topics = topic_store.get_all_topics()
    beacons = aggregate_topic_beacons(all_topics, sw_lat, sw_lon, ne_lat, ne_lon)
    return {"total": len(beacons), "beacons": beacons}


@router.post("/topics/{topic_id}/click")
async def click_topic(topic_id: str):
    clicks = topic_store.click_topic(topic_id)
    if clicks is None:
        raise HTTPException(status_code=404, detail="话题不存在")
    return {"success": True, "clicks": clicks, "message": "点击计数成功"}


@router.post("/topics/{topic_id}/like")
async def like_topic(topic_id: str):
    likes = topic_store.like_topic(topic_id)
    if likes is None:
        raise HTTPException(status_code=404, detail="话题不存在")
    return {"success": True, "likes": likes, "message": "点赞成功"}
