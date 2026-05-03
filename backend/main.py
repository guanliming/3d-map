from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
import math
import os
import logging
import httpx
from datetime import datetime, timedelta

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

def get_mock_topics():
    now = datetime.now()
    
    return [
        {"id": 1, "title": "外滩夜景太美了！", "content": "晚上在外滩看陆家嘴的夜景，灯光璀璨，人很多但很热闹。推荐大家晚上来！", "lat": 31.2304, "lon": 121.4737, "created_at": (now - timedelta(hours=2)).isoformat(), "hot_score": 95.5, "user_name": "旅行爱好者", "user_avatar": "👤", "like_count": 1234, "comment_count": 89, "share_count": 56, "tags": ["夜景", "外滩", "推荐"], "image_url": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=shanghai%20bund%20night%20view%20lights&image_size=square"},
        {"id": 2, "title": "南京东路步行街人山人海", "content": "周末来南京路，人真的好多！不过逛街的氛围很好，各种老字号和现代商场都有。", "lat": 31.2350, "lon": 121.4750, "created_at": (now - timedelta(hours=5)).isoformat(), "hot_score": 88.2, "user_name": "逛街达人", "user_avatar": "👤", "like_count": 856, "comment_count": 45, "share_count": 23, "tags": ["购物", "南京路", "周末"], "image_url": None},
        {"id": 3, "title": "豫园的小笼包真不错", "content": "今天在豫园吃了南翔小笼包，皮薄馅多，汤汁鲜美！虽然排队排了很久，但值得。", "lat": 31.2270, "lon": 121.4820, "created_at": (now - timedelta(hours=8)).isoformat(), "hot_score": 92.0, "user_name": "美食探索家", "user_avatar": "👤", "like_count": 2100, "comment_count": 156, "share_count": 89, "tags": ["美食", "小笼包", "豫园"], "image_url": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=shanghai%20xiaolongbao%20soup%20dumplings&image_size=square"},
        {"id": 4, "title": "陆家嘴高楼大厦真震撼", "content": "站在陆家嘴天桥上，周围都是摩天大楼，感觉自己很渺小。上海的天际线真的很壮观！", "lat": 31.2397, "lon": 121.4998, "created_at": (now - timedelta(days=1)).isoformat(), "hot_score": 85.0, "user_name": "城市摄影师", "user_avatar": "👤", "like_count": 567, "comment_count": 34, "share_count": 18, "tags": ["建筑", "陆家嘴", "天际线"], "image_url": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=shanghai%20lujiazui%20skyscrapers&image_size=square"},
        {"id": 5, "title": "田子坊的文艺气息", "content": "田子坊里有很多有趣的小店和画廊，适合文艺青年来逛逛。弄堂里的老上海风情很有味道。", "lat": 31.2100, "lon": 121.4550, "created_at": (now - timedelta(days=2)).isoformat(), "hot_score": 78.5, "user_name": "文艺青年", "user_avatar": "👤", "like_count": 432, "comment_count": 28, "share_count": 15, "tags": ["文艺", "田子坊", "弄堂"], "image_url": None},
        {"id": 6, "title": "迪士尼乐园一日游", "content": "今天去了迪士尼，人真的很多！不过城堡真的很漂亮，烟花秀也很精彩。建议大家工作日来。", "lat": 31.1400, "lon": 121.6500, "created_at": (now - timedelta(days=3)).isoformat(), "hot_score": 90.0, "user_name": "童话梦想家", "user_avatar": "👤", "like_count": 3200, "comment_count": 245, "share_count": 178, "tags": ["迪士尼", "乐园", "烟花"], "image_url": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=shanghai%20disneyland%20castle%20fireworks&image_size=square"},
        {"id": 7, "title": "思南路的老洋房", "content": "思南路上有很多漂亮的老洋房，梧桐树掩映下很有氛围。适合散步拍照。", "lat": 31.2150, "lon": 121.4600, "created_at": (now - timedelta(days=4)).isoformat(), "hot_score": 65.0, "user_name": "历史爱好者", "user_avatar": "👤", "like_count": 234, "comment_count": 18, "share_count": 12, "tags": ["历史", "洋房", "思南路"], "image_url": None},
        {"id": 8, "title": "武康路打卡", "content": "武康大楼真的很有特色，网红打卡点人很多。附近还有很多咖啡馆，适合悠闲的下午。", "lat": 31.2050, "lon": 121.4400, "created_at": (now - timedelta(days=5)).isoformat(), "hot_score": 72.0, "user_name": "咖啡爱好者", "user_avatar": "👤", "like_count": 567, "comment_count": 42, "share_count": 25, "tags": ["咖啡", "武康路", "打卡"], "image_url": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=shanghai%20wukang%20road%20building&image_size=square"},
        {"id": 9, "title": "朱家角古镇一日游", "content": "周末去了朱家角，古镇很有江南水乡的感觉。坐船游览很惬意，小吃也不错。", "lat": 31.1100, "lon": 121.0500, "created_at": (now - timedelta(days=6)).isoformat(), "hot_score": 60.0, "user_name": "周末旅行家", "user_avatar": "👤", "like_count": 345, "comment_count": 23, "share_count": 15, "tags": ["古镇", "水乡", "朱家角"], "image_url": None},
        {"id": 10, "title": "外滩观光隧道体验", "content": "外滩观光隧道其实就是个灯光秀，比较适合小朋友。如果想看江景还是推荐坐轮渡。", "lat": 31.2350, "lon": 121.4800, "created_at": (now - timedelta(days=7)).isoformat(), "hot_score": 55.0, "user_name": "体验达人", "user_avatar": "👤", "like_count": 189, "comment_count": 15, "share_count": 8, "tags": ["观光", "隧道", "体验"], "image_url": None},
        {"id": 11, "title": "上海博物馆值得一去", "content": "上海博物馆免费开放，馆藏丰富。青铜器和陶瓷馆特别值得看，建议预留3-4小时。", "lat": 31.2280, "lon": 121.4720, "created_at": (now - timedelta(hours=3)).isoformat(), "hot_score": 87.0, "user_name": "文化探索者", "user_avatar": "👤", "like_count": 1567, "comment_count": 98, "share_count": 67, "tags": ["博物馆", "文化", "免费"], "image_url": "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=shanghai%20museum%20interior&image_size=square"},
        {"id": 12, "title": "新天地的夜生活", "content": "新天地晚上很热闹，有很多酒吧和餐厅。石库门建筑改造的很有特色，适合朋友小聚。", "lat": 31.2180, "lon": 121.4700, "created_at": (now - timedelta(days=2)).isoformat(), "hot_score": 82.0, "user_name": "夜猫子", "user_avatar": "👤", "like_count": 890, "comment_count": 67, "share_count": 34, "tags": ["夜生活", "酒吧", "新天地"], "image_url": None},
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

class Topic(BaseModel):
    id: int
    title: str
    content: str
    lat: float
    lon: float
    created_at: str
    hot_score: float
    user_name: str
    user_avatar: str
    like_count: int
    comment_count: int
    share_count: int
    tags: List[str] = []
    image_url: Optional[str] = None

class TopicResponse(BaseModel):
    total: int
    topics: List[Topic]

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

@app.get("/api/topics", response_model=TopicResponse)
def get_topics(
    lat: Optional[float] = Query(None, description="纬度", example=31.2304),
    lon: Optional[float] = Query(None, description="经度", example=121.4737),
    radius: Optional[float] = Query(1000, description="搜索半径（米）", example=1000),
    sw_lat: Optional[float] = Query(None, description="视口西南角纬度"),
    sw_lon: Optional[float] = Query(None, description="视口西南角经度"),
    ne_lat: Optional[float] = Query(None, description="视口东北角纬度"),
    ne_lon: Optional[float] = Query(None, description="视口东北角经度"),
):
    logger.info("=" * 40)
    logger.info("收到 /api/topics 请求")
    logger.info(f"  参数: lat={lat}, lon={lon}, radius={radius}米")
    logger.info(f"  视口: sw=({sw_lat},{sw_lon}), ne=({ne_lat},{ne_lon})")
    
    all_topics = get_mock_topics()
    
    if lat is None or lon is None:
        logger.warning("  未提供经纬度参数，返回所有话题")
        topics = all_topics
    else:
        radius_km = radius / 1000.0
        logger.info(f"  搜索中心: 纬度 {lat}, 经度 {lon}")
        logger.info(f"  搜索半径: {radius} 米 ({radius_km} 公里)")
        
        topics_in_range = []
        for topic in all_topics:
            distance = haversine_distance(lat, lon, topic["lat"], topic["lon"])
            if distance <= radius_km:
                topic_with_dist = topic.copy()
                topic_with_dist["distance_km"] = distance
                topics_in_range.append(topic_with_dist)
        
        topics = topics_in_range
    
    if sw_lat is not None and sw_lon is not None and ne_lat is not None and ne_lon is not None:
        topics = [
            t for t in topics
            if sw_lat <= t["lat"] <= ne_lat and sw_lon <= t["lon"] <= ne_lon
        ]
        logger.info(f"  视口筛选后: {len(topics)} 个话题")
    
    logger.info("-" * 40)
    logger.info("  话题时间范围筛选:")
    
    now = datetime.now()
    today_topics = []
    recent_topics = []
    older_topics = []
    
    for topic in topics:
        created_at = datetime.fromisoformat(topic["created_at"])
        days_diff = (now - created_at).total_seconds() / (24 * 3600)
        
        if days_diff <= 1:
            today_topics.append(topic)
            logger.info(f"    ✓ 当天: {topic['title']} ({days_diff:.1f}天前)")
        elif days_diff <= 3:
            recent_topics.append(topic)
            logger.info(f"    ○ 2-3天: {topic['title']} ({days_diff:.1f}天前)")
        elif days_diff <= 7:
            older_topics.append(topic)
            logger.info(f"    △ 4-7天: {topic['title']} ({days_diff:.1f}天前)")
    
    logger.info("-" * 40)
    logger.info(f"  当天话题: {len(today_topics)} 个")
    logger.info(f"  2-3天话题: {len(recent_topics)} 个")
    logger.info(f"  4-7天话题: {len(older_topics)} 个")
    
    final_topics = []
    
    if today_topics:
        logger.info("  使用当天话题")
        final_topics = today_topics
    elif recent_topics:
        logger.info("  当天无话题，使用2-3天话题（半透明）")
        final_topics = recent_topics
    elif older_topics:
        logger.info("  2-3天无话题，使用4-7天话题（更透明）")
        final_topics = older_topics
    
    final_topics.sort(key=lambda x: (-x["hot_score"], x["created_at"]))
    
    logger.info("-" * 40)
    logger.info("  按热度和时间排序:")
    for i, topic in enumerate(final_topics, 1):
        logger.info(f"    {i}. {topic['title']} - 热度: {topic['hot_score']}")
    
    logger.info("=" * 40)
    
    return TopicResponse(
        total=len(final_topics),
        topics=[Topic(**t) for t in final_topics]
    )

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
    logger.info("    ✓ 探索模式 - 查看周围用户发布的话题")
    logger.info("=" * 50)
    logger.info("  景点数据预览:")
    for i, spot in enumerate(MOCK_SPOTS[:5], 1):
        logger.info(f"    {i}. {spot['name']} ({spot['lat']}, {spot['lon']})")
    if len(MOCK_SPOTS) > 5:
        logger.info(f"    ... 还有 {len(MOCK_SPOTS) - 5} 个景点")
    logger.info("=" * 50)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
