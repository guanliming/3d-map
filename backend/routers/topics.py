from fastapi import APIRouter, HTTPException, Query

from backend.models import TopicCreate, TopicResponse, Topic
from backend.services.topic_store import topic_store
from backend.utils import select_topics_for_explore

router = APIRouter(prefix="/api", tags=["topics"])


@router.post("/topics", status_code=201)
async def create_topic(data: TopicCreate):
    topic_id = topic_store.create_topic(data.user_name, data.content, data.lat, data.lon, data.image)
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


@router.post("/topics/{topic_id}/like")
async def like_topic(topic_id: str):
    topic = topic_store.get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="话题不存在")
    topic["likes"] += 1
    return {"success": True, "likes": topic["likes"], "message": "点赞成功"}
