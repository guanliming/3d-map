import os
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from backend.config import STATIC_DIR

router = APIRouter(prefix="/api", tags=["upload"])

UPLOAD_DIR = STATIC_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="文件大小不能超过5MB")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="不支持的图片格式")

    file_id = str(uuid.uuid4())
    filename = f"{file_id}{ext}"
    filepath = UPLOAD_DIR / filename

    try:
        content = await file.read()
        filepath.write_bytes(content)
        image_url = f"/static/uploads/{filename}"
        return {"url": image_url, "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")