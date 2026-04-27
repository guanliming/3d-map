from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
import math
import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

app = FastAPI(title="3D Map API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

MOCK_SPOTS = [
    {"id": 1, "name": "北京故宫", "lat": 39.9163, "lon": 116.3972, "rating": 4.9, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=historic%20chinese%20palace%20beijing%20forbidden%20city&image_size=square"},
    {"id": 2, "name": "天安门广场", "lat": 39.9042, "lon": 116.4074, "rating": 4.8, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=tiananmen%20square%20beijing%20monument&image_size=square"},
    {"id": 3, "name": "八达岭长城", "lat": 40.3573, "lon": 116.0201, "rating": 4.7, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=great%20wall%20of%20china%20mountain%20landscape&image_size=square"},
    {"id": 4, "name": "颐和园", "lat": 39.9929, "lon": 116.2756, "rating": 4.6, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=summer%20palace%20garden%20lake%20beijing&image_size=square"},
    {"id": 5, "name": "天坛", "lat": 39.8883, "lon": 116.4170, "rating": 4.5, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=temple%20of%20heaven%20circular%20building&image_size=square"},
    {"id": 6, "name": "鸟巢体育场", "lat": 40.0030, "lon": 116.3895, "rating": 4.4, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=bird%20nest%20stadium%20beijing%20modern%20architecture&image_size=square"},
    {"id": 7, "name": "圆明园遗址", "lat": 40.0142, "lon": 116.2996, "rating": 4.3, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=old%20summer%20palace%20ruins%20historical%20site&image_size=square"},
    {"id": 8, "name": "什刹海", "lat": 39.9429, "lon": 116.3850, "rating": 4.2, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=shichahai%20lake%20beijing%20traditional%20hutong&image_size=square"},
    {"id": 9, "name": "上海外滩", "lat": 31.2304, "lon": 121.4737, "rating": 4.9, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=shanghai%20bund%20river%20skyline%20night&image_size=square"},
    {"id": 10, "name": "上海东方明珠", "lat": 31.2397, "lon": 121.4998, "rating": 4.8, "image": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=oriental%20pearl%20tower%20shanghai%20landmark&image_size=square"},
]

class ScenicSpot(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    rating: float
    image: str
    distance: float

class ScenicSpotResponse(BaseModel):
    total: int
    spots: List[ScenicSpot]

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distance = R * c
    return round(distance, 2)

@app.get("/api/scenic_spots", response_model=ScenicSpotResponse)
def get_scenic_spots(
    lat: Optional[float] = Query(None, description="纬度", example=39.9042),
    lon: Optional[float] = Query(None, description="经度", example=116.4074),
    radius: Optional[float] = Query(100, description="搜索半径（公里）", example=100)
):
    spots = []
    
    for spot in MOCK_SPOTS:
        if lat is not None and lon is not None:
            distance = haversine_distance(lat, lon, spot["lat"], spot["lon"])
            if distance <= radius:
                spots.append({**spot, "distance": distance})
        else:
            spots.append({**spot, "distance": 0.0})
    
    spots.sort(key=lambda x: x["distance"])
    
    return ScenicSpotResponse(
        total=len(spots),
        spots=[ScenicSpot(**s) for s in spots]
    )

class ConfigResponse(BaseModel):
    maptiler_key: str

@app.get("/api/config", response_model=ConfigResponse)
def get_config():
    return ConfigResponse(
        maptiler_key=os.getenv("MAPTILER_KEY", "")
    )

@app.get("/", response_class=HTMLResponse)
def read_root():
    html_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return f.read()
    return HTMLResponse(content="<h1>3D Map Project</h1><p>Please visit the frontend page</p>")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
