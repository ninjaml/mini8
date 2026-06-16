"""
OpenClaw Gateway 代理 Hub。

职责：
- 维护唯一的上游 Gateway 连接（单例，配置不变时复用）
- 将上游消息广播给所有已订阅的前端会话队列
- 提供 subscribe / unsubscribe / send 接口供 WS 路由使用
"""
import asyncio
from typing import Callable, Optional

from app.services.openclaw_gateway_client import OpenClawGatewayClient


class OpenClawGatewayHub:
    """
    上游 Gateway 连接管理器 + 下游订阅广播。

    状态：
        _client          当前上游客户端（None 表示未连接）
        _gateway_url     当前连接的 URL
        _token           当前连接的 Token
        _subscribers     Set[asyncio.Queue]，每个前端会话一个队列
        _dispatch_task   后台广播任务
    """

    def __init__(self, client_factory: Optional[Callable] = None):
        self._client: Optional[OpenClawGatewayClient] = None
        self._gateway_url: Optional[str] = None
        self._token: Optional[str] = None
        self._subscribers: set[asyncio.Queue] = set()
        self._dispatch_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        # 允许测试注入假客户端
        self._client_factory = client_factory or OpenClawGatewayClient

    # ── 公开接口 ──────────────────────────────────────────────────────────

    async def subscribe(self, gateway_url: str, token: str) -> asyncio.Queue:
        """
        注册一个新的前端订阅者，返回其专属消息队列。
        如果上游连接不存在或配置已变更，自动重建。
        """
        async with self._lock:
            await self._ensure_connected(gateway_url, token)
            q: asyncio.Queue = asyncio.Queue()
            self._subscribers.add(q)
            return q

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        """注销一个前端订阅者。所有订阅者离开后不主动关闭上游连接（保持热连接）。"""
        async with self._lock:
            self._subscribers.discard(queue)

    async def send(self, message: dict) -> None:
        """向上游 Gateway 发送消息。"""
        if self._client is None or not self._client._connected:
            raise RuntimeError("Gateway not connected")
        await self._client.send(message)

    @property
    def is_connected(self) -> bool:
        return self._client is not None and self._client._connected

    async def close(self) -> None:
        """关闭上游连接并清理所有订阅者。"""
        async with self._lock:
            await self._teardown()

    # ── 内部实现 ──────────────────────────────────────────────────────────

    async def _ensure_connected(self, gateway_url: str, token: str) -> None:
        """在 _lock 内调用。配置变更或连接断开时重建。"""
        config_changed = (
            self._gateway_url != gateway_url or self._token != token
        )
        connection_dead = (
            self._client is not None and not self._client._connected
        )

        if config_changed or connection_dead:
            await self._teardown()

        if self._client is None:
            self._gateway_url = gateway_url
            self._token = token
            client = self._client_factory(gateway_url, token)
            await client.connect()
            self._client = client
            self._dispatch_task = asyncio.create_task(self._dispatch_loop())

    async def _teardown(self) -> None:
        """关闭上游连接，取消广播任务，通知所有订阅者连接已断开（发 None 哨兵）。"""
        if self._dispatch_task is not None:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except (asyncio.CancelledError, Exception):
                pass
            self._dispatch_task = None

        if self._client is not None:
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None

        # 通知所有订阅者连接已断开
        for q in list(self._subscribers):
            await q.put(None)
        self._subscribers.clear()
        self._gateway_url = None
        self._token = None

    async def _dispatch_loop(self) -> None:
        """后台任务：从上游队列读取消息，广播给所有订阅者。"""
        try:
            while True:
                if self._client is None:
                    break
                raw = await self._client.receive()
                if raw is None:
                    # 上游连接断开，通知所有订阅者
                    async with self._lock:
                        for q in list(self._subscribers):
                            await q.put(None)
                        self._subscribers.clear()
                        self._client = None
                        self._gateway_url = None
                        self._token = None
                    break
                # 广播给当前所有订阅者（快照，避免迭代时修改）
                async with self._lock:
                    targets = list(self._subscribers)
                for q in targets:
                    await q.put(raw)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            print(f"[OpenClawHub] dispatch_loop error: {exc}")


# 全局单例
_hub: Optional[OpenClawGatewayHub] = None


def get_hub() -> OpenClawGatewayHub:
    global _hub
    if _hub is None:
        _hub = OpenClawGatewayHub()
    return _hub