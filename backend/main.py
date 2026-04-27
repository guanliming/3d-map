from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional
import math
import os
import logging

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
