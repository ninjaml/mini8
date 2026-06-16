from fastapi import APIRouter

from deepagents_webapi.api.models import LoginRequest, LoginResponse
from deepagents_webapi.auth import SimpleAuth

router = APIRouter()
auth_service = SimpleAuth()


@router.post("/api/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """用户登录"""
    success = auth_service.authenticate(request.username, request.password)
    
    if success:
        return LoginResponse(
            success=True,
            message="Login successful",
            user_id=request.username
        )
    else:
        return LoginResponse(
            success=False,
            message="Invalid credentials"
        )
