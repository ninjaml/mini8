import asyncio
import httpx

from app.core.config import settings


"""
认证服务模块。

提供与外部认证 API 交互的能力，将手机号/密码验证委托给远端服务，
并把返回的原始数据标准化为平台内部可用的用户字典。
"""


class SimpleAuth:
    """轻量级认证客户端，封装对远端登录接口的调用。"""

    def __init__(self) -> None:
        self.api_url = settings.AUTH_API_URL
        self.headers = {
            "User-Agent": "CamphorEOS/1.0",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }

    async def authenticate(self, username: str, password: str) -> dict | None:
        """
        向外部认证接口校验用户名/密码。

        参数:
            username: 用户手机号（作为登录账号）。
            password: 密码原文。

        返回:
            成功时返回标准化后的用户字典；"id" 固定为本地 primaryKey，
            因为新登录接口只负责认证，不再向客户端暴露远端 primaryKey。
            外部返回异常格式或认证失败时返回 None。

        当前真实协议：
            - 本地字段名叫 ``username``
            - 发给外部认证接口时会映射成表单字段 ``phone``

        当前错误处理策略：
            - 外部服务不可达
            - 外部返回非预期结构
            - 用户名/密码错误
          这三类情况最终都会统一折叠成 ``None``，由上层表现成登录失败。
        """
        if not username or not password:
            return None

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(headers=self.headers, timeout=30.0) as client:
                    response = await client.post(
                        self.api_url,
                        data={"phone": username, "password": password},
                    )
                    response.raise_for_status()
                    payload = response.json()
                    if isinstance(payload, dict):
                        if payload.get("flag") is True:
                            data = payload.get("data")
                            if not isinstance(data, dict):
                                data = {}
                            return {**data, "id": settings.AUTH_LOCAL_PRIMARY_KEY}
                    return None
            except Exception:
                # 远端偶发连接重置时重试一次，其他异常最终统一折叠成登录失败。
                if attempt < 2:
                    await asyncio.sleep(0.3)
                    continue
                return None
        return None
