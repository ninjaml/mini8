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

    当前路由本身不做本地账号校验或 session/token 签发，
    只是把用户名/密码转交给 ``SimpleAuth``，再把结果整理成轻量响应摘要。

    真实返回语义：
    - 成功时，``user_id`` 由服务层补充的本地固定 primaryKey 提供
    - 失败时统一返回 ``success=False``，不会区分“密码错误”和“外部服务异常”
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
