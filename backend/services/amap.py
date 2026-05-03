import logging
import httpx

from backend.config import settings
from backend.models import ScenicSpot, WeatherForecast, WeatherForecastItem, WeatherLive
from backend.utils import get_safe_str, haversine_distance

logger = logging.getLogger(__name__)

AMAP_GEOCODE_REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo"
AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo"
AMAP_AROUND_URL = "https://restapi.amap.com/v3/place/around"

SCENIC_TYPES = "110000|110100|110101|110102|110103|110104|110105|110106|110200|110201|110202|110203|110204|110205|110206|110207|110208|110209|110210|110211"
DEFAULT_SPOT_IMAGE = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80"


async def get_regeocode(lon: float, lat: float) -> dict | None:
    if not settings.amap_key:
        logger.warning("AMAP_KEY 未配置，无法调用逆地理编码接口")
        return None

    params = {
        "key": settings.amap_key,
        "location": f"{lon},{lat}",
        "extensions": "base",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(AMAP_GEOCODE_REGEO_URL, params=params)
            response.raise_for_status()
            data = response.json()

        if data.get("status") != "1":
            logger.error("逆地理编码接口调用失败: %s", data.get("info", "未知错误"))
            return None

        regeocode = data.get("regeocode", {})
        address_component = regeocode.get("addressComponent", {})
        province = get_safe_str(address_component.get("province"))
        city = get_safe_str(address_component.get("city"))
        district = get_safe_str(address_component.get("district"))

        if not city and province in ["北京市", "上海市", "天津市", "重庆市", "北京", "上海", "天津", "重庆"]:
            city = province

        return {
            "province": province,
            "city": city,
            "district": district,
            "formatted_address": get_safe_str(regeocode.get("formatted_address")),
            "adcode": get_safe_str(address_component.get("adcode")),
        }
    except Exception as exc:
        logger.exception("调用逆地理编码接口异常: %s", exc)
        return None


async def get_weather(adcode: str, extensions: str = "base") -> dict | None:
    if not settings.amap_key:
        logger.warning("AMAP_KEY 未配置，无法调用天气接口")
        return None

    params = {
        "key": settings.amap_key,
        "city": adcode,
        "extensions": extensions,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(AMAP_WEATHER_URL, params=params)
            response.raise_for_status()
            data = response.json()

        if data.get("status") != "1":
            logger.error("天气接口调用失败: %s", data.get("info", "未知错误"))
            return None

        return data
    except Exception as exc:
        logger.exception("调用天气接口异常: %s", exc)
        return None


def parse_weather_live(data: dict | None) -> WeatherLive | None:
    if not data or not data.get("lives"):
        return None
    live = data["lives"][0]
    return WeatherLive(
        province=live.get("province"),
        city=live.get("city"),
        adcode=live.get("adcode"),
        weather=live.get("weather"),
        temperature=live.get("temperature"),
        winddirection=live.get("winddirection"),
        windpower=live.get("windpower"),
        humidity=live.get("humidity"),
        reporttime=live.get("reporttime"),
    )


def parse_weather_forecast(data: dict | None) -> WeatherForecast | None:
    if not data or not data.get("forecasts"):
        return None
    forecast = data["forecasts"][0]
    casts = [
        WeatherForecastItem(
            date=cast.get("date"),
            week=cast.get("week"),
            dayweather=cast.get("dayweather"),
            nightweather=cast.get("nightweather"),
            daytemp=cast.get("daytemp"),
            nighttemp=cast.get("nighttemp"),
            daywind=cast.get("daywind"),
            nightwind=cast.get("nightwind"),
            daypower=cast.get("daypower"),
            nightpower=cast.get("nightpower"),
        )
        for cast in forecast.get("casts", [])
    ]
    return WeatherForecast(
        city=forecast.get("city"),
        adcode=forecast.get("adcode"),
        province=forecast.get("province"),
        reporttime=forecast.get("reporttime"),
        casts=casts,
    )


def _poi_location(poi: dict) -> tuple[float, float] | None:
    location = poi.get("location")
    if not location or "," not in location:
        return None
    lon_text, lat_text = location.split(",", 1)
    try:
        return float(lat_text), float(lon_text)
    except ValueError:
        return None


def _poi_rating(poi: dict) -> float:
    biz_ext = poi.get("biz_ext") if isinstance(poi.get("biz_ext"), dict) else {}
    raw = biz_ext.get("rating")
    try:
        rating = float(raw)
        return max(0.0, min(5.0, round(rating, 1)))
    except (TypeError, ValueError):
        return 4.5


async def search_scenic_spots(lat: float, lon: float, radius_km: float) -> list[ScenicSpot]:
    if not settings.amap_key:
        raise RuntimeError("AMAP_KEY 未配置，无法查询高德 POI")

    radius_meters = max(100, min(int(radius_km * 1000), 50000))
    params = {
        "key": settings.amap_key,
        "location": f"{lon},{lat}",
        "types": SCENIC_TYPES,
        "radius": radius_meters,
        "offset": 25,
        "page": 1,
        "extensions": "all",
        "sortrule": "distance",
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(AMAP_AROUND_URL, params=params)
            response.raise_for_status()
            data = response.json()

        if data.get("status") != "1":
            raise RuntimeError(data.get("info", "高德 POI 查询失败"))

        spots: list[ScenicSpot] = []
        for poi in data.get("pois", []):
            parsed_location = _poi_location(poi)
            if not parsed_location:
                continue
            poi_lat, poi_lon = parsed_location
            distance = haversine_distance(lat, lon, poi_lat, poi_lon)
            photos = poi.get("photos") if isinstance(poi.get("photos"), list) else []
            image = photos[0].get("url") if photos and isinstance(photos[0], dict) else DEFAULT_SPOT_IMAGE
            spots.append(
                ScenicSpot(
                    id=str(poi.get("id") or f"{poi_lon},{poi_lat}"),
                    name=str(poi.get("name") or "未命名景点"),
                    lat=poi_lat,
                    lon=poi_lon,
                    rating=_poi_rating(poi),
                    image=image,
                    distance=distance,
                    address=get_safe_str(poi.get("address")),
                    type=get_safe_str(poi.get("type")),
                )
            )

        return sorted(spots, key=lambda spot: spot.distance)
    except Exception as exc:
        logger.exception("高德 POI 查询失败: %s", exc)
        raise
