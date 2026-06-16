"""
认证（Auth）相关的 Pydantic 模式定义。

本模块定义了用户登录请求与响应的数据模型，
用于 API 请求/响应的校验与序列化。
"""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    """用户登录请求模型。

    Attributes:
        username: 用户名（必填）。
        password: 密码（必填）。
    """

    username: str
    password: str


class LoginResponse(BaseModel):
    """用户登录响应模型。

    Attributes:
        success: 登录是否成功。
        message: 响应消息（如失败原因等）。
        user_id: 登录成功后的用户 ID，失败时为 None。
        nickname: 用户昵称，失败时为 None。
    """

    success: bool
    message: str
    user_id: str | None = None
    nickname: str | None = None
