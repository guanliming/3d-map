from datetime import datetime, timedelta
import uuid

from backend.services.topic_store import topic_store


def init_mock_topics() -> None:
    if topic_store.get_all_topics():
        return

    shanghai_locations = [
        {"lat": 31.2304, "lon": 121.4737},
        {"lat": 31.2397, "lon": 121.4998},
        {"lat": 31.2222, "lon": 121.4581},
        {"lat": 31.1932, "lon": 121.4390},
        {"lat": 31.2450, "lon": 121.5068},
        {"lat": 31.2350, "lon": 121.4800},
        {"lat": 31.2050, "lon": 121.4680},
    ]

    mock_data = [
        {"user_name": "旅行者小明", "content": "今天的外滩夜景太美了！灯光秀超震撼，推荐大家晚上来打卡。", "days_ago": 0, "likes": 128, "comments": 32},
        {"user_name": "美食达人", "content": "发现一家超棒的本帮菜餐厅，红烧肉入口即化。", "days_ago": 0, "likes": 89, "comments": 15},
        {"user_name": "摄影爱好者", "content": "在东方明珠的玻璃栈道上拍了一组照片，效果非常震撼！", "days_ago": 1, "likes": 256, "comments": 45},
        {"user_name": "咖啡控", "content": "静安寺附近新开了一家小众咖啡馆，手冲咖啡超赞。", "days_ago": 2, "likes": 45, "comments": 8},
        {"user_name": "购物狂", "content": "徐家汇的商场又有促销活动了！", "days_ago": 4, "likes": 67, "comments": 12},
        {"user_name": "健身达人", "content": "陆家嘴滨江步道夜跑超舒服！", "days_ago": 5, "likes": 34, "comments": 6},
        {"user_name": "历史迷", "content": "人民广场的上海博物馆值得一去，特别是青铜器和书画展区。", "days_ago": 6, "likes": 156, "comments": 28},
    ]

    now = datetime.now()
    for index, data in enumerate(mock_data):
        loc = shanghai_locations[index % len(shanghai_locations)]
        topic_id = str(uuid.uuid4())
        topic_store.topics[topic_id] = {
            "id": topic_id,
            "user_name": data["user_name"],
            "content": data["content"],
            "lat": loc["lat"] + index * 0.001,
            "lon": loc["lon"] + index * 0.001,
            "image": None,
            "created_at": now - timedelta(days=data["days_ago"], hours=index),
            "likes": data["likes"],
            "comments": data["comments"],
        }
