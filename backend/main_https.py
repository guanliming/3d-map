import ssl
import os
from pathlib import Path

# 生成自签名证书（如果不存在）
CERT_FILE = Path(__file__).parent / "cert.pem"
KEY_FILE = Path(__file__).parent / "key.pem"

if not CERT_FILE.exists() or not KEY_FILE.exists():
    import subprocess
    print("生成自签名证书...")
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048",
        "-keyout", str(KEY_FILE),
        "-out", str(CERT_FILE),
        "-days", "365",
        "-nodes",
        "-subj", "/CN=localhost"
    ], capture_output=True)
    print("证书已生成")

import logging
import sys

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

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
    logger.info("HTTPS 服务器启动完成: https://0.0.0.0:8000")
    logger.info("手机访问: https://<你的服务器IP>:8000")
    logger.info("⚠️ 首次访问需要在手机浏览器中点击'高级'->'继续访问'")


if __name__ == "__main__":
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain(CERT_FILE, KEY_FILE)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        ssl_keyfile=str(KEY_FILE),
        ssl_certfile=str(CERT_FILE)
    )