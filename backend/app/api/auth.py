from fastapi import APIRouter

from app.schemas.auth import LoginRequest, LoginResponse
from app.services.auth import SimpleAuth


"""
认证接口模块。

提供 /auth/login 端点，接收用户名/密码并委托 SimpleAuth 服务完成外部认证，
返回标准化的登录结果与用户 ID。
"""

router = APIRouter()
auth_service = SimpleAuth()


@router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    用户登录接口。

    参数:
        request: 包含 username（手机号）与 password 的请求体。

    返回:
        LoginResponse: success 标识、提示消息以及用户 ID（如认证成功）。
    """
    user_data = await auth_service.authenticate(request.username, request.password)
    if user_data is not None:
        return LoginResponse(
            success=True,
            message="Login successful",
            user_id=user_data.get("id"),
            nickname=user_data.get("nickName"),
        )
    return LoginResponse(success=False, message="Invalid credentials")
