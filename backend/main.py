from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import math
import os
import logging
import httpx
import uuid
from datetime import datetime, timedelta
from collections import defaultdict

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

logger.info("=" * 60)
logger.info("🔧 开始加载配置")
logger.info("=" * 60)

def find_env_file():
    possible_paths = []
    
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        path1 = os.path.abspath(os.path.join(script_dir, "..", ".env"))
        possible_paths.append(("从 __file__ 计算", path1))
    except Exception as e:
        logger.warning(f"无法从 __file__ 计算路径: {e}")
    
    try:
        cwd = os.getcwd()
        path2 = os.path.abspath(os.path.join(cwd, ".env"))
        possible_paths.append(("从当前工作目录", path2))
    except Exception as e:
        logger.warning(f"无法从工作目录计算路径: {e}")
    
    known_paths = [
        ("已知路径 1", "d:/codeali/3d-map/.env"),
        ("已知路径 2", "d:\\codeali\\3d-map\\.env"),
    ]
    possible_paths.extend(known_paths)
    
    for source, path in possible_paths:
        if os.path.exists(path):
            logger.info(f"✓ 从 {source} 找到 .env 文件: {path}")
            return path
        else:
            logger.info(f"✗ 从 {source} 未找到 .env 文件: {path}")
    
    return None

env_path = find_env_file()

maptiler_key = ""
amap_key = ""
env_file_found = False
env_file_read = False
key_found_in_file = False

if env_path:
    env_file_found = True
    logger.info(f"\n📄 直接读取 .env 文件: {env_path}")
    logger.info(f"   文件存在: {os.path.exists(env_path)}")
    
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
            logger.info(f"   文件内容长度: {len(file_content)} 字符")
            
            lines = file_content.strip().split('\n')
            logger.info(f"   文件行数: {len(lines)}")
            
            for line_num, line in enumerate(lines, 1):
                line = line.strip()
                logger.info(f"   行 {line_num}: '{line}'")
                
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    logger.info(f"     解析: key='{key}', value='{value[:5] if len(value) > 5 else value}...' (长度: {len(value)})")
                    
                    if key == "MAPTILER_KEY":
                        maptiler_key = value
                        key_found_in_file = True
                        logger.info(f"  ✓ 找到 MAPTILER_KEY！")
                        logger.info(f"  ✓ Key 长度: {len(value)} 字符")
                        logger.info(f"  ✓ Key 预览: {value[:15]}...")
                    
                    if key == "AMAP_KEY":
                        amap_key = value
                        logger.info(f"  ✓ 找到 AMAP_KEY！")
                        logger.info(f"  ✓ Key 长度: {len(value)} 字符")
                        logger.info(f"  ✓ Key 预览: {value[:15]}...")
        
        env_file_read = True
    except Exception as e:
        logger.error(f"   读取文件失败: {e}")
        import traceback
        traceback.print_exc()
else:
    logger.warning("\n⚠️ 所有可能的路径都未找到 .env 文件!")
    logger.warning("   请确认 .env 文件在项目根目录: d:\\codeali\\3d-map\\.env")

logger.info("\n" + "=" * 60)
logger.info("📊 配置加载结果")
logger.info("=" * 60)
logger.info(f"  .env 文件找到: {'是' if env_file_found else '否'}")
logger.info(f"  .env 文件读取成功: {'是' if env_file_read else '否'}")
logger.info(f"  在文件中找到 Key: {'是' if key_found_in_file else '否'}")
logger.info(f"  最终 Key 已配置: {'是' if maptiler_key else '否'}")
if maptiler_key:
    logger.info(f"  Key 长度: {len(maptiler_key)} 字符")
    logger.info(f"  Key 预览: {maptiler_key[:15]}...")
else:
    logger.warning("  ⚠️ Key 为空，将使用 OpenStreetMap 备用地图")
logger.info("=" * 60)

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
    logger.info(f"创建静态目录: {static_dir}")
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

class LocationInfo(BaseModel):
    province: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    formatted_address: Optional[str] = None

class WeatherLive(BaseModel):
    province: Optional[str] = None
    city: Optional[str] = None
    adcode: Optional[str] = None
    weather: Optional[str] = None
    temperature: Optional[str] = None
    winddirection: Optional[str] = None
    windpower: Optional[str] = None
    humidity: Optional[str] = None
    reporttime: Optional[str] = None

class WeatherForecastItem(BaseModel):
    date: Optional[str] = None
    week: Optional[str] = None
    dayweather: Optional[str] = None
    nightweather: Optional[str] = None
    daytemp: Optional[str] = None
    nighttemp: Optional[str] = None
    daywind: Optional[str] = None
    nightwind: Optional[str] = None
    daypower: Optional[str] = None
    nightpower: Optional[str] = None

class WeatherForecast(BaseModel):
    city: Optional[str] = None
    adcode: Optional[str] = None
    province: Optional[str] = None
    reporttime: Optional[str] = None
    casts: List[WeatherForecastItem] = []

class WeatherResponse(BaseModel):
    success: bool
    location: Optional[LocationInfo] = None
    weather_live: Optional[WeatherLive] = None
    weather_forecast: Optional[WeatherForecast] = None
    message: Optional[str] = None


class TopicCreate(BaseModel):
    user_name: str = Field(..., description="用户名", min_length=1, max_length=50)
    content: str = Field(..., description="话题内容", min_length=1, max_length=1000)
    lat: float = Field(..., description="纬度", ge=-90, le=90)
    lon: float = Field(..., description="经度", ge=-180, le=180)
    image: Optional[str] = Field(None, description="图片URL（可选）")


class Topic(BaseModel):
    id: str
    user_name: str
    content: str
    lat: float
    lon: float
    image: Optional[str] = None
    created_at: datetime
    likes: int = 0
    comments: int = 0
    distance: float = 0.0
    opacity: float = 1.0
    age_category: str = "today"


class TopicResponse(BaseModel):
    total: int
    topics: List[Topic]
    center_lat: float
    center_lon: float


class TopicStore:
    def __init__(self):
        self.topics: Dict[str, Dict[str, Any]] = {}
    
    def create_topic(self, data: TopicCreate) -> str:
        topic_id = str(uuid.uuid4())
        now = datetime.now()
        self.topics[topic_id] = {
            "id": topic_id,
            "user_name": data.user_name,
            "content": data.content,
            "lat": data.lat,
            "lon": data.lon,
            "image": data.image,
            "created_at": now,
            "likes": 0,
            "comments": 0
        }
        logger.info(f"创建新话题: id={topic_id}, user={data.user_name}, location=({data.lat}, {data.lon})")
        return topic_id
    
    def get_topic(self, topic_id: str) -> Optional[Dict[str, Any]]:
        return self.topics.get(topic_id)
    
    def get_all_topics(self) -> List[Dict[str, Any]]:
        return list(self.topics.values())


topic_store = TopicStore()


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
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


def get_topic_age_category(created_at: datetime) -> str:
    now = datetime.now()
    diff = now - created_at
    
    if diff <= timedelta(days=1):
        return "today"
    elif diff <= timedelta(days=3):
        return "three_days"
    elif diff <= timedelta(days=7):
        return "seven_days"
    else:
        return "old"


def get_opacity_by_age_category(category: str) -> float:
    if category == "today":
        return 1.0
    elif category == "three_days":
        return 0.6
    elif category == "seven_days":
        return 0.3
    else:
        return 0.1


def is_point_in_bounds(lat: float, lon: float, 
                       sw_lat: float, sw_lon: float, 
                       ne_lat: float, ne_lon: float) -> bool:
    return (sw_lat <= lat <= ne_lat and 
            sw_lon <= lon <= ne_lon)


def latlon_to_meters(center_lat: float, center_lon: float, 
                      point_lat: float, point_lon: float) -> tuple:
    """
    将经纬度坐标转换为相对于中心点的米坐标
    返回: (x_meters, y_meters) - 相对于中心点的坐标（东为x正方向，北为y正方向）
    """
    R = 6371000.0
    
    dlat = math.radians(point_lat - center_lat)
    dlon = math.radians(point_lon - center_lon)
    
    y = R * dlat
    
    lat_avg = math.radians((center_lat + point_lat) / 2)
    x = R * dlon * math.cos(lat_avg)
    
    return (x, y)


def select_topics_for_explore(topics: List[Dict[str, Any]], 
                               center_lat: float, center_lon: float,
                               sw_lat: float, sw_lon: float,
                               ne_lat: float, ne_lon: float) -> List[Topic]:
    """
    探索模式下的话题选择逻辑：
    1. 只加载可视范围内的话题
    2. 以地图正中心为原点，按500m半径划分区域（实际使用1000m×1000m网格确保覆盖500m圆）
    3. 每个区域只显示top3话题
    4. 优先级：当天话题 > 近3天话题 > 近7天话题
    5. 不同时间范围的话题有不同透明度
    """
    
    now = datetime.now()
    
    topics_in_bounds = []
    for t in topics:
        if is_point_in_bounds(t["lat"], t["lon"], sw_lat, sw_lon, ne_lat, ne_lon):
            distance = haversine_distance_meters(center_lat, center_lon, t["lat"], t["lon"])
            x, y = latlon_to_meters(center_lat, center_lon, t["lat"], t["lon"])
            age_category = get_topic_age_category(t["created_at"])
            topics_in_bounds.append({
                **t,
                "distance": distance,
                "x_meters": x,
                "y_meters": y,
                "age_category": age_category,
                "opacity": get_opacity_by_age_category(age_category)
            })
    
    if not topics_in_bounds:
        logger.info("  可视范围内没有话题")
        return []
    
    GRID_SIZE = 1000.0
    
    def get_grid_key(x: float, y: float) -> tuple:
        """
        以地图中心为原点(0,0)，按1000m×1000m网格划分
        网格(0,0)对应中心区域：x: [-500, 500), y: [-500, 500)
        网格(1,0)对应右侧相邻区域：x: [500, 1500), y: [-500, 500)
        """
        grid_x = int(math.floor((x + GRID_SIZE / 2) / GRID_SIZE))
        grid_y = int(math.floor((y + GRID_SIZE / 2) / GRID_SIZE))
        return (grid_x, grid_y)
    
    grid_groups = defaultdict(list)
    for t in topics_in_bounds:
        grid_key = get_grid_key(t["x_meters"], t["y_meters"])
        grid_groups[grid_key].append(t)
    
    logger.info(f"  网格划分结果: {len(grid_groups)} 个区域")
    for grid_key, grid_topics in grid_groups.items():
        logger.info(f"    区域 {grid_key}: {len(grid_topics)} 个话题")
        for t in grid_topics:
            logger.info(f"      - {t['user_name']}: 位置({t['x_meters']:.0f}m, {t['y_meters']:.0f}m), 距离中心 {t['distance']:.0f}m")
    
    result_topics = []
    
    for grid_key, grid_topics in grid_groups.items():
        today_topics = [t for t in grid_topics if t["age_category"] == "today"]
        three_day_topics = [t for t in grid_topics if t["age_category"] == "three_days"]
        seven_day_topics = [t for t in grid_topics if t["age_category"] == "seven_days"]
        
        logger.info(f"  区域 {grid_key} 时间分布: 当天={len(today_topics)}, 近3天={len(three_day_topics)}, 近7天={len(seven_day_topics)}")
        
        def sort_key(topic):
            heat_score = topic["likes"] * 10 + topic["comments"] * 5
            time_diff = (now - topic["created_at"]).total_seconds()
            return (-heat_score, time_diff)
        
        selected = []
        if today_topics:
            today_topics_sorted = sorted(today_topics, key=sort_key)
            selected = today_topics_sorted[:3]
            logger.info(f"  区域 {grid_key} 选择当天话题前3个: {[t['user_name'] for t in selected]}")
        elif three_day_topics:
            three_day_sorted = sorted(three_day_topics, key=sort_key)
            selected = three_day_sorted[:3]
            logger.info(f"  区域 {grid_key} 选择近3天话题前3个: {[t['user_name'] for t in selected]}")
        elif seven_day_topics:
            seven_day_sorted = sorted(seven_day_topics, key=sort_key)
            selected = seven_day_sorted[:3]
            logger.info(f"  区域 {grid_key} 选择近7天话题前3个: {[t['user_name'] for t in selected]}")
        
        result_topics.extend(selected)
    
    result_topics_sorted = sorted(result_topics, key=lambda t: (t["age_category"] != "today", t["distance"]))
    
    logger.info(f"  最终选择话题数: {len(result_topics_sorted)}")
    
    return [Topic(
        id=t["id"],
        user_name=t["user_name"],
        content=t["content"],
        lat=t["lat"],
        lon=t["lon"],
        image=t.get("image"),
        created_at=t["created_at"],
        likes=t["likes"],
        comments=t["comments"],
        distance=t["distance"],
        opacity=t["opacity"],
        age_category=t["age_category"]
    ) for t in result_topics_sorted]


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

AMAP_GEOCODE_REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo"
AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo"

def _safe_str(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, list):
        if len(value) == 0:
            return None
        return str(value[0])
    return str(value)

async def get_regeocode(lon: float, lat: float) -> Optional[dict]:
    if not amap_key:
        logger.warning("AMAP_KEY 未配置，无法调用逆地理编码接口")
        return None
    
    params = {
        "key": amap_key,
        "location": f"{lon},{lat}",
        "extensions": "base"
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(AMAP_GEOCODE_REGEO_URL, params=params)
            data = response.json()
            
            if data.get("status") != "1":
                logger.error(f"逆地理编码接口调用失败: {data.get('info', '未知错误')}")
                return None
            
            regeocode = data.get("regeocode", {})
            address_component = regeocode.get("addressComponent", {})
            
            logger.info(f"  原始地址组件: {address_component}")
            
            province = _safe_str(address_component.get("province"))
            city = _safe_str(address_component.get("city"))
            district = _safe_str(address_component.get("district"))
            
            if not city and province:
                if province in ["北京市", "上海市", "天津市", "重庆市", "北京", "上海", "天津", "重庆"]:
                    city = province
                    logger.info(f"  直辖市，将 city 设置为 province: {city}")
            
            return {
                "province": province,
                "city": city,
                "district": district,
                "formatted_address": _safe_str(regeocode.get("formatted_address")),
                "adcode": _safe_str(address_component.get("adcode"))
            }
    except Exception as e:
        logger.error(f"调用逆地理编码接口异常: {e}")
        import traceback
        traceback.print_exc()
        return None

async def get_weather(adcode: str, extensions: str = "base") -> Optional[dict]:
    if not amap_key:
        logger.warning("AMAP_KEY 未配置，无法调用天气接口")
        return None
    
    params = {
        "key": amap_key,
        "city": adcode,
        "extensions": extensions
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(AMAP_WEATHER_URL, params=params)
            data = response.json()
            
            if data.get("status") != "1":
                logger.error(f"天气接口调用失败: {data.get('info', '未知错误')}")
                return None
            
            return data
    except Exception as e:
        logger.error(f"调用天气接口异常: {e}")
        return None

def get_best_adcode(location: dict) -> Optional[str]:
    adcode = location.get("adcode")
    if adcode:
        return adcode
    
    district = location.get("district")
    city = location.get("city")
    province = location.get("province")
    
    if district:
        return district
    if city:
        return city
    if province:
        return province
    
    return None

@app.get("/api/scenic_spots", response_model=ScenicSpotResponse)
def get_scenic_spots(
    lat: Optional[float] = Query(None, description="纬度", example=39.9042),
    lon: Optional[float] = Query(None, description="经度", example=116.4074),
    radius: Optional[float] = Query(100, description="搜索半径（公里）", example=100)
):
    logger.info("=" * 40)
    logger.info("收到 /api/scenic_spots 请求")
    logger.info(f"  参数: lat={lat}, lon={lon}, radius={radius}")
    
    if lat is None or lon is None:
        logger.warning("  未提供经纬度参数，返回所有景点")
        spots = [{**spot, "distance": 0.0} for spot in MOCK_SPOTS]
        logger.info(f"  返回 {len(spots)} 个景点（未计算距离）")
        return ScenicSpotResponse(
            total=len(spots),
            spots=[ScenicSpot(**s) for s in spots]
        )
    
    logger.info(f"  搜索中心: 纬度 {lat}, 经度 {lon}")
    logger.info(f"  搜索半径: {radius} 公里")
    logger.info("-" * 40)
    logger.info("  景点距离计算结果:")
    
    spots = []
    for spot in MOCK_SPOTS:
        distance = haversine_distance(lat, lon, spot["lat"], spot["lon"])
        status = "✓" if distance <= radius else "✗"
        logger.info(f"    {status} {spot['name']}: {distance} 公里")
        if distance <= radius:
            spots.append({**spot, "distance": distance})
    
    logger.info("-" * 40)
    logger.info(f"  符合条件的景点: {len(spots)} 个")
    
    spots.sort(key=lambda x: x["distance"])
    
    if spots:
        logger.info("  按距离排序:")
        for i, spot in enumerate(spots, 1):
            logger.info(f"    {i}. {spot['name']} - {spot['distance']} 公里")
    
    logger.info("=" * 40)
    
    return ScenicSpotResponse(
        total=len(spots),
        spots=[ScenicSpot(**s) for s in spots]
    )

class ConfigResponse(BaseModel):
    maptiler_key: str
    debug_info: dict

@app.get("/api/config", response_model=ConfigResponse)
def get_config():
    logger.info("=" * 40)
    logger.info("收到 /api/config 请求")
    logger.info("=" * 40)
    
    has_key = bool(maptiler_key)
    logger.info(f"  MapTiler Key 已配置: {has_key}")
    if has_key:
        logger.info(f"  Key 长度: {len(maptiler_key)} 字符")
        logger.info(f"  Key 预览: {maptiler_key[:15]}...")
    else:
        logger.warning(f"  ⚠️ Key 为空!")
    
    debug_info = {
        "env_file_found": env_file_found,
        "env_file_read": env_file_read,
        "key_found_in_file": key_found_in_file,
        "key_configured": has_key,
        "key_length": len(maptiler_key) if maptiler_key else 0,
        "env_path": env_path if env_path else None,
    }
    
    logger.info(f"  调试信息: {debug_info}")
    logger.info("=" * 40)
    
    return ConfigResponse(
        maptiler_key=maptiler_key,
        debug_info=debug_info
    )

@app.get("/", response_class=HTMLResponse)
def read_root():
    logger.info("收到首页请求")
    html_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html")
    logger.info(f"  前端页面路径: {html_path}")
    logger.info(f"  页面存在: {os.path.exists(html_path)}")
    
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return f.read()
    logger.warning("  前端页面不存在，返回默认页面")
    return HTMLResponse(content="<h1>3D Map Project</h1><p>Please visit the frontend page</p>")

@app.get("/api/weather", response_model=WeatherResponse)
async def get_weather_by_location(
    lat: float = Query(..., description="纬度", examples=39.9042),
    lon: float = Query(..., description="经度", examples=116.4074)
):
    try:
        logger.info("=" * 50)
        logger.info("收到 /api/weather 请求")
        logger.info(f"  参数: lat={lat}, lon={lon}")
        
        if not amap_key:
            logger.error("AMAP_KEY 未配置")
            return WeatherResponse(
                success=False,
                message="AMAP_KEY 未配置"
            )
        
        logger.info(f"  调用逆地理编码接口...")
        location = await get_regeocode(lon, lat)
        
        if not location:
            logger.error("逆地理编码失败")
            return WeatherResponse(
                success=False,
                message="逆地理编码失败，无法获取位置信息"
            )
        
        logger.info(f"  逆地理编码结果:")
        logger.info(f"    省份: {location.get('province')}")
        logger.info(f"    城市: {location.get('city')}")
        logger.info(f"    区县: {location.get('district')}")
        logger.info(f"    地址: {location.get('formatted_address')}")
        logger.info(f"    行政区划代码: {location.get('adcode')}")
        
        adcode = get_best_adcode(location)
        
        if not adcode:
            logger.error("无法获取有效的行政区划代码")
            return WeatherResponse(
                success=False,
                message="无法获取有效的行政区划代码",
                location=LocationInfo(
                    province=location.get("province"),
                    city=location.get("city"),
                    district=location.get("district"),
                    formatted_address=location.get("formatted_address")
                )
            )
        
        logger.info(f"  使用行政区划代码: {adcode}")
        
        logger.info(f"  调用天气接口 (实时)...")
        weather_base = await get_weather(adcode, extensions="base")
        logger.info(f"  实时天气响应: {weather_base}")
        
        logger.info(f"  调用天气接口 (预报)...")
        weather_all = await get_weather(adcode, extensions="all")
        logger.info(f"  预报天气响应: {weather_all}")
        
        weather_live = None
        weather_forecast = None
        
        if weather_base and weather_base.get("lives"):
            lives = weather_base["lives"]
            if lives and len(lives) > 0:
                live = lives[0]
                weather_live = WeatherLive(
                    province=live.get("province"),
                    city=live.get("city"),
                    adcode=live.get("adcode"),
                    weather=live.get("weather"),
                    temperature=live.get("temperature"),
                    winddirection=live.get("winddirection"),
                    windpower=live.get("windpower"),
                    humidity=live.get("humidity"),
                    reporttime=live.get("reporttime")
                )
                logger.info(f"  实时天气: {weather_live.weather}, 温度: {weather_live.temperature}°C")
        
        if weather_all and weather_all.get("forecasts"):
            forecasts = weather_all["forecasts"]
            if forecasts and len(forecasts) > 0:
                forecast = forecasts[0]
                casts = []
                if forecast.get("casts"):
                    for cast in forecast["casts"]:
                        casts.append(WeatherForecastItem(
                            date=cast.get("date"),
                            week=cast.get("week"),
                            dayweather=cast.get("dayweather"),
                            nightweather=cast.get("nightweather"),
                            daytemp=cast.get("daytemp"),
                            nighttemp=cast.get("nighttemp"),
                            daywind=cast.get("daywind"),
                            nightwind=cast.get("nightwind"),
                            daypower=cast.get("daypower"),
                            nightpower=cast.get("nightpower")
                        ))
                
                weather_forecast = WeatherForecast(
                    city=forecast.get("city"),
                    adcode=forecast.get("adcode"),
                    province=forecast.get("province"),
                    reporttime=forecast.get("reporttime"),
                    casts=casts
                )
                logger.info(f"  预报天数: {len(casts)} 天")
        
        logger.info("=" * 50)
        
        return WeatherResponse(
            success=True,
            location=LocationInfo(
                province=location.get("province"),
                city=location.get("city"),
                district=location.get("district"),
                formatted_address=location.get("formatted_address")
            ),
            weather_live=weather_live,
            weather_forecast=weather_forecast,
            message="获取成功"
        )
    except Exception as e:
        logger.error(f"处理 /api/weather 请求时发生异常: {e}")
        import traceback
        traceback.print_exc()
        return WeatherResponse(
            success=False,
            message=f"服务器内部错误: {str(e)}"
        )

@app.post("/api/topics", status_code=201)
async def create_topic(data: TopicCreate):
    try:
        logger.info("=" * 50)
        logger.info("收到 /api/topics POST 请求")
        logger.info(f"  用户: {data.user_name}")
        logger.info(f"  内容: {data.content[:50]}{'...' if len(data.content) > 50 else ''}")
        logger.info(f"  位置: ({data.lat}, {data.lon})")
        
        topic_id = topic_store.create_topic(data)
        
        logger.info(f"  话题创建成功，ID: {topic_id}")
        logger.info("=" * 50)
        
        return {
            "success": True,
            "topic_id": topic_id,
            "message": "话题发布成功"
        }
    except Exception as e:
        logger.error(f"创建话题失败: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/topics", response_model=TopicResponse)
async def get_topics(
    center_lat: float = Query(..., description="中心点纬度"),
    center_lon: float = Query(..., description="中心点经度"),
    sw_lat: float = Query(..., description="视口西南角纬度"),
    sw_lon: float = Query(..., description="视口西南角经度"),
    ne_lat: float = Query(..., description="视口东北角纬度"),
    ne_lon: float = Query(..., description="视口东北角经度")
):
    try:
        logger.info("=" * 50)
        logger.info("收到 /api/topics GET 请求")
        logger.info(f"  中心点: ({center_lat}, {center_lon})")
        logger.info(f"  视口: SW({sw_lat}, {sw_lon}) - NE({ne_lat}, {ne_lon})")
        
        all_topics = topic_store.get_all_topics()
        logger.info(f"  所有话题总数: {len(all_topics)}")
        
        selected_topics = select_topics_for_explore(
            all_topics,
            center_lat, center_lon,
            sw_lat, sw_lon,
            ne_lat, ne_lon
        )
        
        logger.info(f"  筛选后话题数: {len(selected_topics)}")
        if selected_topics:
            logger.info("  话题详情:")
            for i, t in enumerate(selected_topics[:5], 1):
                logger.info(f"    {i}. {t.user_name}: {t.content[:30]}... (距离: {t.distance}m, 透明度: {t.opacity}, 分类: {t.age_category})")
        
        logger.info("=" * 50)
        
        return TopicResponse(
            total=len(selected_topics),
            topics=selected_topics,
            center_lat=center_lat,
            center_lon=center_lon
        )
    except Exception as e:
        logger.error(f"查询话题失败: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/topics/{topic_id}/like")
async def like_topic(topic_id: str):
    topic = topic_store.get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="话题不存在")
    
    topic["likes"] += 1
    logger.info(f"话题 {topic_id} 点赞 +1，当前点赞数: {topic['likes']}")
    
    return {
        "success": True,
        "likes": topic["likes"],
        "message": "点赞成功"
    }


def init_mock_topics():
    shanghai_locations = [
        {"lat": 31.2304, "lon": 121.4737, "name": "外滩"},
        {"lat": 31.2397, "lon": 121.4998, "name": "东方明珠"},
        {"lat": 31.2222, "lon": 121.4581, "name": "静安寺"},
        {"lat": 31.1932, "lon": 121.4390, "name": "徐家汇"},
        {"lat": 31.2450, "lon": 121.5068, "name": "陆家嘴"},
        {"lat": 31.2350, "lon": 121.4800, "name": "人民广场"},
        {"lat": 31.2050, "lon": 121.4680, "name": "淮海路"},
    ]
    
    now = datetime.now()
    
    mock_data = [
        {
            "user_name": "旅行者小明",
            "content": "今天的外滩夜景太美了！灯光秀超震撼，推荐大家晚上来打卡。江边风有点大，记得多穿件外套。",
            "days_ago": 0,
            "likes": 128,
            "comments": 32
        },
        {
            "user_name": "美食达人",
            "content": "发现一家超棒的本帮菜餐厅，红烧肉入口即化，糖醋小排也很地道。位置就在南京东路附近，人均150左右。",
            "days_ago": 0,
            "likes": 89,
            "comments": 15
        },
        {
            "user_name": "摄影爱好者",
            "content": "在东方明珠的玻璃栈道上拍了一组照片，效果非常震撼！建议晴天下午去，光线最好。",
            "days_ago": 1,
            "likes": 256,
            "comments": 45
        },
        {
            "user_name": "咖啡控",
            "content": "静安寺附近新开了一家小众咖啡馆，手冲咖啡超赞，环境也很安静，适合工作或阅读。",
            "days_ago": 2,
            "likes": 45,
            "comments": 8
        },
        {
            "user_name": "购物狂",
            "content": "徐家汇的商场又有促销活动了！很多品牌折扣力度很大，今天逛了一下午，收获满满。",
            "days_ago": 4,
            "likes": 67,
            "comments": 12
        },
        {
            "user_name": "健身达人",
            "content": "陆家嘴滨江步道夜跑超舒服！风景好，空气也不错，每天晚上都有很多人在这里跑步或散步。",
            "days_ago": 5,
            "likes": 34,
            "comments": 6
        },
        {
            "user_name": "历史迷",
            "content": "人民广场的上海博物馆值得一去，特别是青铜器和书画展区，展品非常丰富，而且免费入场！",
            "days_ago": 6,
            "likes": 156,
            "comments": 28
        }
    ]
    
    for i, data in enumerate(mock_data):
        loc = shanghai_locations[i % len(shanghai_locations)]
        created_at = now - timedelta(days=data["days_ago"], hours=i)
        
        topic_id = str(uuid.uuid4())
        topic_store.topics[topic_id] = {
            "id": topic_id,
            "user_name": data["user_name"],
            "content": data["content"],
            "lat": loc["lat"] + (i * 0.001),
            "lon": loc["lon"] + (i * 0.001),
            "image": None,
            "created_at": created_at,
            "likes": data["likes"],
            "comments": data["comments"]
        }
        logger.info(f"添加模拟话题: {topic_id[:8]}... - {data['user_name']}")


@app.on_event("startup")
async def startup_event():
    logger.info("=" * 50)
    logger.info("🚀 服务器启动完成!")
    logger.info("=" * 50)
    logger.info("  访问地址: http://localhost:8000")
    logger.info("  API 文档: http://localhost:8000/docs")
    logger.info("=" * 50)
    logger.info("  前端功能:")
    logger.info("    ✓ 调试面板（右上角）- 显示实时缩放级别和状态")
    logger.info("    ✓ 控制台日志 - 按 F12 打开开发者工具查看")
    logger.info("=" * 50)
    logger.info("  景点数据预览:")
    for i, spot in enumerate(MOCK_SPOTS[:5], 1):
        logger.info(f"    {i}. {spot['name']} ({spot['lat']}, {spot['lon']})")
    if len(MOCK_SPOTS) > 5:
        logger.info(f"    ... 还有 {len(MOCK_SPOTS) - 5} 个景点")
    
    logger.info("=" * 50)
    logger.info("  初始化模拟话题数据...")
    init_mock_topics()
    logger.info(f"  模拟话题总数: {len(topic_store.get_all_topics())}")
    logger.info("=" * 50)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
