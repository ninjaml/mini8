"""认证请求/响应模型。

当前这层 schema 只服务一个接口：
- ``POST /auth/login``

从 ``api/auth.py`` 和 ``services/auth.py`` 的调用链可以确认：
- 登录动作会委托给 ``SimpleAuth.authenticate()``。
- ``LoginRequest.username`` 在命名上叫 username，但当前实现里实际作为手机号使用，
  最终会以表单字段 ``phone`` 发给外部认证服务。
- ``LoginResponse`` 不是 JWT/token 响应，而是一个轻量的登录结果摘要。
"""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    """登录请求体。

    使用方：
    - ``POST /auth/login``

    字段语义：
    - ``username``: 当前接入的外部认证服务把它当成手机号使用。
    - ``password``: 原始登录密码，直接转发给外部认证接口。
    """

    # 登录账号。
    # 虽然字段名叫 username，但当前实现会把它映射成外部接口的 ``phone`` 参数。
    username: str
    # 登录密码原文。
    password: str


class LoginResponse(BaseModel):
    """登录结果响应体。

    使用方：
    - ``POST /auth/login``

    字段语义：
    - ``success``: 认证是否成功。
    - ``message``: 当前接口返回的标准化提示文案，不直接透传外部服务原文。
    - ``user_id``: 成功时由服务层补充的本地固定 primaryKey。
    - ``nickname``: 成功时来自外部返回 ``data.nickName``。
    """

    # 登录是否成功。
    success: bool
    # 面向前端的标准化提示消息。
    message: str
    # 成功时的用户标识；当前由服务层补充本地固定 primaryKey。
    user_id: str | None = None
    # 成功时的用户昵称；来源是外部认证返回的 nickName。
    nickname: str | None = None
