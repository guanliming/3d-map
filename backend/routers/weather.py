from fastapi import APIRouter, Query

from backend.models import LocationInfo, WeatherResponse
from backend.services.amap import get_regeocode, get_weather, parse_weather_forecast, parse_weather_live
from backend.utils import get_best_adcode

router = APIRouter(prefix="/api", tags=["weather"])


@router.get("/weather", response_model=WeatherResponse)
async def get_weather_by_location(
    lat: float = Query(..., description="纬度", examples=39.9042),
    lon: float = Query(..., description="经度", examples=116.4074),
):
    location = await get_regeocode(lon, lat)
    if not location:
        return WeatherResponse(success=False, message="逆地理编码失败，无法获取位置信息")

    adcode = get_best_adcode(location)
    if not adcode:
        return WeatherResponse(
            success=False,
            message="无法获取有效的行政区划代码",
            location=LocationInfo(
                province=location.get("province"),
                city=location.get("city"),
                district=location.get("district"),
                formatted_address=location.get("formatted_address"),
            ),
        )

    weather_base = await get_weather(adcode, extensions="base")
    weather_all = await get_weather(adcode, extensions="all")

    return WeatherResponse(
        success=True,
        location=LocationInfo(
            province=location.get("province"),
            city=location.get("city"),
            district=location.get("district"),
            formatted_address=location.get("formatted_address"),
        ),
        weather_live=parse_weather_live(weather_base),
        weather_forecast=parse_weather_forecast(weather_all),
        message="获取成功",
    )
