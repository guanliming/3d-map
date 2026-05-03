import math
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Any
import uuid


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(r * c, 2)


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(r * c, 2)


def get_safe_str(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        return str(value[0]) if value else None
    return str(value)


def get_best_adcode(location: dict) -> str | None:
    return location.get("adcode") or location.get("district") or location.get("city") or location.get("province")


def get_topic_age_category(created_at: datetime) -> str:
    diff = datetime.now() - created_at
    if diff <= timedelta(days=1):
        return "today"
    if diff <= timedelta(days=3):
        return "three_days"
    if diff <= timedelta(days=7):
        return "seven_days"
    return "old"


def get_opacity_by_age_category(category: str) -> float:
    return {
        "today": 1.0,
        "three_days": 0.6,
        "seven_days": 0.3,
        "old": 0.1,
    }.get(category, 1.0)


def is_point_in_bounds(lat: float, lon: float, sw_lat: float, sw_lon: float, ne_lat: float, ne_lon: float) -> bool:
    return sw_lat <= lat <= ne_lat and sw_lon <= lon <= ne_lon


def latlon_to_meters(center_lat: float, center_lon: float, point_lat: float, point_lon: float) -> tuple[float, float]:
    r = 6371000.0
    dlat = math.radians(point_lat - center_lat)
    dlon = math.radians(point_lon - center_lon)
    y = r * dlat
    lat_avg = math.radians((center_lat + point_lat) / 2)
    x = r * dlon * math.cos(lat_avg)
    return x, y


class TopicStore:
    def __init__(self):
        self.topics: dict[str, dict[str, Any]] = {}

    def create_topic(self, user_name: str, content: str, lat: float, lon: float, image: str | None = None) -> str:
        topic_id = str(uuid.uuid4())
        self.topics[topic_id] = {
            "id": topic_id,
            "user_name": user_name,
            "content": content,
            "lat": lat,
            "lon": lon,
            "image": image,
            "created_at": datetime.now(),
            "likes": 0,
            "comments": 0,
        }
        return topic_id

    def get_topic(self, topic_id: str) -> dict[str, Any] | None:
        return self.topics.get(topic_id)

    def get_all_topics(self) -> list[dict[str, Any]]:
        return list(self.topics.values())


async def select_topics_for_explore(topics: list[dict[str, Any]], center_lat: float, center_lon: float, sw_lat: float, sw_lon: float, ne_lat: float, ne_lon: float) -> list[dict[str, Any]]:
    topics_in_bounds = []
    for topic in topics:
        if is_point_in_bounds(topic["lat"], topic["lon"], sw_lat, sw_lon, ne_lat, ne_lon):
            distance = haversine_distance_meters(center_lat, center_lon, topic["lat"], topic["lon"])
            x, y = latlon_to_meters(center_lat, center_lon, topic["lat"], topic["lon"])
            age_category = get_topic_age_category(topic["created_at"])
            topics_in_bounds.append(
                {
                    **topic,
                    "distance": distance,
                    "x_meters": x,
                    "y_meters": y,
                    "age_category": age_category,
                    "opacity": get_opacity_by_age_category(age_category),
                }
            )

    if not topics_in_bounds:
        return []

    grid_size = 1000.0

    def grid_key(x: float, y: float) -> tuple[int, int]:
        return (int(math.floor((x + grid_size / 2) / grid_size)), int(math.floor((y + grid_size / 2) / grid_size)))

    grouped: defaultdict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for topic in topics_in_bounds:
        grouped[grid_key(topic["x_meters"], topic["y_meters"])].append(topic)

    selected: list[dict[str, Any]] = []
    for grid_topics in grouped.values():
        today = [t for t in grid_topics if t["age_category"] == "today"]
        three_days = [t for t in grid_topics if t["age_category"] == "three_days"]
        seven_days = [t for t in grid_topics if t["age_category"] == "seven_days"]

        def sort_key(topic: dict[str, Any]):
            heat_score = topic["likes"] * 10 + topic["comments"] * 5
            time_diff = (datetime.now() - topic["created_at"]).total_seconds()
            return (-heat_score, time_diff)

        if today:
            selected.extend(sorted(today, key=sort_key)[:3])
        elif three_days:
            selected.extend(sorted(three_days, key=sort_key)[:3])
        elif seven_days:
            selected.extend(sorted(seven_days, key=sort_key)[:3])

    selected = sorted(selected, key=lambda t: (t["age_category"] != "today", t["distance"]))
    return selected
