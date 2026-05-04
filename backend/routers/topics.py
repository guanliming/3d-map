from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import get_current_user
from backend.models import FogCellsResponse, FogUnlockRequest, FogUnlockResponse, TopicCreate, TopicReply, TopicReplyCreate, TopicResponse, Topic
from backend.services.postgres import get_unlocked_h3_cells, unlock_h3_cells_for_location
from backend.services.topic_store import topic_store
from backend.utils import aggregate_topic_beacons, select_topics_for_explore

router = APIRouter(prefix="/api", tags=["topics"])


@router.get("/fog/unlocked", response_model=FogCellsResponse)
async def get_unlocked_fog_cells(
    user_id: str = Query(default="", description="匿名用户ID（未登录时使用）"),
    current_user: dict | None = Depends(get_current_user),
):
    effective_user_id = current_user["user_id"] if current_user else user_id
    if not effective_user_id:
        return FogCellsResponse(total=0, cells=[])
    cells = get_unlocked_h3_cells(effective_user_id)
    return FogCellsResponse(total=len(cells), cells=cells)


@router.post("/fog/unlock", response_model=FogUnlockResponse)
async def unlock_fog_cells(data: FogUnlockRequest, current_user: dict | None = Depends(get_current_user)):
    effective_user_id = current_user["user_id"] if current_user else data.user_id
    result = unlock_h3_cells_for_location(effective_user_id, data.lat, data.lon, disk_radius=1)
    cells = get_unlocked_h3_cells(effective_user_id)
    return FogUnlockResponse(success=True, cells=cells, **result)


@router.post("/topics", status_code=201)
async def create_topic(data: TopicCreate, current_user: dict | None = Depends(get_current_user)):
    if current_user is not None:
        user_name = current_user["nickname"]
        user_id = current_user["user_id"]
    else:
        if not data.user_name:
            raise HTTPException(status_code=422, detail="未登录时请提供昵称")
        user_name = data.user_name
        user_id = None

    topic_id = topic_store.create_topic(
        user_name=user_name,
        content=data.content,
        lat=data.lat,
        lon=data.lon,
        image=data.image,
        scenic_spot_name=data.scenic_spot_name,
        scenic_spot_distance_m=data.scenic_spot_distance_m,
        user_id=user_id,
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
    reply_map = topic_store.get_replies_for_topics([topic["id"] for topic in selected], limit_per_topic=6)
    for topic in selected:
        topic["replies"] = reply_map.get(topic["id"], [])
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


@router.post("/topics/{topic_id}/replies", response_model=TopicReply, status_code=201)
async def reply_topic(topic_id: str, data: TopicReplyCreate, current_user: dict | None = Depends(get_current_user)):
    if current_user is not None:
        user_name = current_user["nickname"]
        user_id = current_user["user_id"]
    else:
        if not data.user_name:
            raise HTTPException(status_code=422, detail="未登录时请提供昵称")
        user_name = data.user_name
        user_id = None
    reply = topic_store.create_topic_reply(topic_id, user_name, data.content, user_id=user_id)
    if reply is None:
        raise HTTPException(status_code=404, detail="话题不存在")
    return TopicReply(**reply)


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
