import math
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Any
import uuid

import h3


H3_RESOLUTION = 9
FOG_H3_RESOLUTION = 8
HEAT_GRAVITY = 1.6
BEACON_THRESHOLD = 10.0


def get_h3_index(lat: float, lon: float, resolution: int = H3_RESOLUTION) -> str:
    return h3.latlng_to_cell(lat, lon, resolution)


def get_h3_cell_boundary(h3_index: str) -> list[list[float]]:
    return [[lon, lat] for lat, lon in h3.cell_to_boundary(h3_index)]


def get_h3_disk(h3_index: str, radius: int = 1) -> list[str]:
    return list(h3.grid_disk(h3_index, radius))


def calculate_topic_score(topic: dict[str, Any], now: datetime | None = None) -> float:
    current_time = now or datetime.now()
    created_at = topic["created_at"]
    time_hours = max((current_time - created_at).total_seconds() / 3600, 0)
    points = topic.get("likes", 0) * 5 + topic.get("comments", 0) * 10 + topic.get("clicks", 0)
    weight = float(topic.get("weight") or 1.0)
    return round(((points + 1) * weight) / ((time_hours + 2) ** HEAT_GRAVITY), 4)


def get_topic_visual_params(score: float, created_at: datetime, now: datetime | None = None) -> dict[str, Any]:
    current_time = now or datetime.now()
    age_hours = max((current_time - created_at).total_seconds() / 3600, 0)
    normalized = min(score / 10, 1)
    opacity = 1.0 if age_hours <= 4 else max(0.18, 1 - (age_hours - 4) / 24)
    return {
        "height": round(18 + normalized * 180, 2),
        "radius": round(0.9 + normalized * 1.15, 2),
        "opacity": round(opacity, 2),
        "freshness": "new" if age_hours <= 0.25 else "fresh" if age_hours <= 1 else "decaying" if age_hours > 4 else "active",
    }


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


def enrich_topic_dynamics(topic: dict[str, Any], center_lat: float, center_lon: float, now: datetime | None = None) -> dict[str, Any]:
    current_time = now or datetime.now()
    distance = haversine_distance_meters(center_lat, center_lon, topic["lat"], topic["lon"])
    x, y = latlon_to_meters(center_lat, center_lon, topic["lat"], topic["lon"])
    age_category = get_topic_age_category(topic["created_at"])
    score = calculate_topic_score(topic, current_time)
    visual = get_topic_visual_params(score, topic["created_at"], current_time)
    return {
        **topic,
        "h3_index": topic.get("h3_index") or get_h3_index(topic["lat"], topic["lon"]),
        "distance": distance,
        "x_meters": x,
        "y_meters": y,
        "age_category": age_category,
        "score": score,
        "heat_score": score,
        "height": visual["height"],
        "radius": visual["radius"],
        "opacity": visual["opacity"],
        "freshness": visual["freshness"],
    }


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
            "clicks": 0,
            "weight": 1.0,
            "h3_index": get_h3_index(lat, lon),
        }
        return topic_id

    def get_topic(self, topic_id: str) -> dict[str, Any] | None:
        return self.topics.get(topic_id)

    def get_all_topics(self) -> list[dict[str, Any]]:
        return list(self.topics.values())


async def select_topics_for_explore(topics: list[dict[str, Any]], center_lat: float, center_lon: float, sw_lat: float, sw_lon: float, ne_lat: float, ne_lon: float) -> list[dict[str, Any]]:
    current_time = datetime.now()
    topics_in_bounds = [
        enrich_topic_dynamics(topic, center_lat, center_lon, current_time)
        for topic in topics
        if is_point_in_bounds(topic["lat"], topic["lon"], sw_lat, sw_lon, ne_lat, ne_lon)
    ]

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
        selected.extend(sorted(grid_topics, key=lambda topic: (-topic["score"], topic["distance"]))[:3])

    return sorted(selected, key=lambda topic: (-topic["score"], topic["distance"]))


def aggregate_topic_beacons(topics: list[dict[str, Any]], sw_lat: float, sw_lon: float, ne_lat: float, ne_lon: float) -> list[dict[str, Any]]:
    current_time = datetime.now()
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for topic in topics:
        if is_point_in_bounds(topic["lat"], topic["lon"], sw_lat, sw_lon, ne_lat, ne_lon):
            enriched = enrich_topic_dynamics(topic, topic["lat"], topic["lon"], current_time)
            grouped[enriched["h3_index"]].append(enriched)

    beacons = []
    for h3_index, h3_topics in grouped.items():
        score_sum = round(sum(topic["score"] for topic in h3_topics), 4)
        if score_sum <= BEACON_THRESHOLD:
            continue
        lat, lon = h3.cell_to_latlng(h3_index)
        top_topic = max(h3_topics, key=lambda topic: topic["score"])
        beacons.append(
            {
                "h3_index": h3_index,
                "lat": lat,
                "lon": lon,
                "score_sum": score_sum,
                "topic_count": len(h3_topics),
                "preview": top_topic["content"][:80],
            }
        )

    return sorted(beacons, key=lambda beacon: -beacon["score_sum"])[:30]
