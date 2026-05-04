import logging
import sys
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend.config import FRONTEND_DIR, STATIC_DIR, settings
from backend.routers import config, scenic_spots, topics, weather, auth, upload
from backend.services.postgres import init_postgres_schema
from backend.services.topic_store import topic_store
from backend.services.topics import init_mock_topics

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="3D Map API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

app.include_router(config.router)
app.include_router(scenic_spots.router)
app.include_router(weather.router)
app.include_router(topics.router)
app.include_router(auth.router)
app.include_router(upload.router)


@app.get("/", response_class=HTMLResponse)
def read_root():
    html_path = FRONTEND_DIR / "index.html"
    if html_path.exists():
        return html_path.read_text(encoding="utf-8")
    return HTMLResponse(content="<h1>3D Map Project</h1><p>Frontend page not found.</p>", status_code=404)


@app.on_event("startup")
async def startup_event():
    init_postgres_schema()
    init_mock_topics()
    logger.info("服务器启动完成: http://localhost:8000")
    logger.info("API 文档: http://localhost:8000/docs")
    logger.info("MapTiler Key: %s", "已配置" if settings.maptiler_key else "未配置")
    logger.info("AMAP Key: %s", "已配置" if settings.amap_key else "未配置")
    logger.info("话题数据: %s 条", len(topic_store.get_all_topics()))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
