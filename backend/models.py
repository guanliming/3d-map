from pydantic import BaseModel, Field
from typing import Any
from datetime import datetime


class ScenicSpot(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    rating: float
    image: str
    distance: float
    address: str | None = None
    type: str | None = None


class ScenicSpotResponse(BaseModel):
    total: int
    spots: list[ScenicSpot]
    source: str = "amap"
    message: str | None = None


class LocationInfo(BaseModel):
    province: str | None = None
    city: str | None = None
    district: str | None = None
    formatted_address: str | None = None


class WeatherLive(BaseModel):
    province: str | None = None
    city: str | None = None
    adcode: str | None = None
    weather: str | None = None
    temperature: str | None = None
    winddirection: str | None = None
    windpower: str | None = None
    humidity: str | None = None
    reporttime: str | None = None


class WeatherForecastItem(BaseModel):
    date: str | None = None
    week: str | None = None
    dayweather: str | None = None
    nightweather: str | None = None
    daytemp: str | None = None
    nighttemp: str | None = None
    daywind: str | None = None
    nightwind: str | None = None
    daypower: str | None = None
    nightpower: str | None = None


class WeatherForecast(BaseModel):
    city: str | None = None
    adcode: str | None = None
    province: str | None = None
    reporttime: str | None = None
    casts: list[WeatherForecastItem] = []


class WeatherResponse(BaseModel):
    success: bool
    location: LocationInfo | None = None
    weather_live: WeatherLive | None = None
    weather_forecast: WeatherForecast | None = None
    message: str | None = None


class ConfigResponse(BaseModel):
    maptiler_key: str
    map_source: str = "auto"
    debug_info: dict[str, Any]


class TopicCreate(BaseModel):
    user_name: str = Field(..., description="用户名", min_length=1, max_length=50)
    content: str = Field(..., description="话题内容", min_length=1, max_length=1000)
    lat: float = Field(..., description="纬度", ge=-90, le=90)
    lon: float = Field(..., description="经度", ge=-180, le=180)
    image: str | None = Field(None, description="图片URL（可选）")


class Topic(BaseModel):
    id: str
    user_name: str
    content: str
    lat: float
    lon: float
    image: str | None = None
    created_at: datetime
    likes: int = 0
    comments: int = 0
    distance: float = 0.0
    opacity: float = 1.0
    age_category: str = "today"


class TopicResponse(BaseModel):
    total: int
    topics: list[Topic]
    center_lat: float
    center_lon: float
