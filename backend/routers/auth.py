from fastapi import APIRouter, Depends, HTTPException

from backend.auth import create_token, get_current_user, hash_password, verify_password
from backend.models import TokenResponse, UserLogin, UserRegister, UserResponse
from backend.services.postgres import create_user, get_user_by_id, get_user_by_phone

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201)
async def register(data: UserRegister):
    existing = get_user_by_phone(data.phone)
    if existing:
        raise HTTPException(status_code=409, detail="该手机号已注册")
    hashed = hash_password(data.password)
    user = create_user(
        nickname=data.nickname,
        real_name=data.real_name,
        id_card=data.id_card,
        phone=data.phone,
        password_hash=hashed,
    )
    user["id"] = str(user["id"])
    token = create_token(user["id"], user["nickname"])
    user_response = UserResponse(**user)
    return TokenResponse(token=token, user=user_response)


@router.post("/login")
async def login(data: UserLogin):
    user = get_user_by_phone(data.phone)
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="手机号或密码错误")
    user_id = str(user["id"])
    token = create_token(user_id, user["nickname"])
    user_response = UserResponse(
        id=user_id,
        nickname=user["nickname"],
        real_name=user.get("real_name"),
        phone=user["phone"],
        created_at=user["created_at"],
    )
    return TokenResponse(token=token, user=user_response)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict | None = Depends(get_current_user)):
    if current_user is None:
        raise HTTPException(status_code=401, detail="未登录")
    user = get_user_by_id(current_user["user_id"])
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    user["id"] = str(user["id"])
    return UserResponse(**user)
