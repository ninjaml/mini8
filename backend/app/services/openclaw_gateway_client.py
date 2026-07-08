"""
OpenClaw Gateway WebSocket 客户端。

职责：
1. 生成/管理 Ed25519 设备密钥对（持久化存储）
2. 与 Gateway 建立 WS 连接并完成 device auth 握手
3. 提供 send/receive 接口供代理 Hub 复用
"""
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
from typing import Callable, Optional

import websockets
from nacl.signing import SigningKey

# 设备密钥存储路径
DEVICE_KEYS_PATH = Path.home() / ".CamphorEOS" / "openclaw_device_keys.json"


def _ensure_device_keys_dir():
    DEVICE_KEYS_PATH.parent.mkdir(parents=True, exist_ok=True)


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _generate_device_keys():
    """生成新的 Ed25519 密钥对。"""
    signing_key = SigningKey.generate()
    verify_key = signing_key.verify_key
    private_bytes = bytes(signing_key)
    public_bytes = bytes(verify_key)
    return private_bytes, public_bytes


def _load_or_create_device_keys():
    """加载已有密钥对，或生成新的并持久化。

    如果本地文件损坏/字段不全，会静默回退为重新生成一套新密钥。
    """
    _ensure_device_keys_dir()
    if DEVICE_KEYS_PATH.exists():
        try:
            data = json.loads(DEVICE_KEYS_PATH.read_text(encoding="utf-8"))
            private_bytes = bytes.fromhex(data["privateKey"])
            public_bytes = bytes.fromhex(data["publicKey"])
            if len(private_bytes) == 32 and len(public_bytes) == 32:
                return private_bytes, public_bytes
        except Exception:
            pass

    private_bytes, public_bytes = _generate_device_keys()
    DEVICE_KEYS_PATH.write_text(
        json.dumps(
            {
                "privateKey": private_bytes.hex(),
                "publicKey": public_bytes.hex(),
            }
        ),
        encoding="utf-8",
    )
    return private_bytes, public_bytes


def _get_device_identity(private_bytes: bytes, public_bytes: bytes):
    """根据公钥派生 Gateway 握手所需的设备标识。

    当前 ``device_id`` 规则是 ``sha256(public_key).hexdigest()``，
    因此只要本地持久化密钥不变，这个设备身份就是稳定的。
    """
    device_id = hashlib.sha256(public_bytes).hexdigest()
    public_key_b64 = _base64url_encode(public_bytes)
    return device_id, public_key_b64


def _sign_challenge(private_bytes: bytes, payload: str) -> str:
    """使用 Ed25519 对 payload 签名，返回 base64url 编码的签名。"""
    signing_key = SigningKey(private_bytes)
    signature = signing_key.sign(payload.encode("utf-8")).signature
    return _base64url_encode(signature)


class OpenClawGatewayClient:
    """
    OpenClaw Gateway WebSocket 客户端。

    用法：
        client = OpenClawGatewayClient("ws://127.0.0.1:18789", "token")
        await client.connect()
        await client.send({"type": "req", ...})
        msg = await client.receive()
        await client.close()
    """

    def __init__(self, gateway_url: str, token: str):
        self.gateway_url = gateway_url
        self.token = token
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._connected = False
        self._closed = False
        self._receive_queue: asyncio.Queue = asyncio.Queue()
        self._private_bytes: Optional[bytes] = None
        self._public_bytes: Optional[bytes] = None
        self.device_id: Optional[str] = None
        self.public_key_b64: Optional[str] = None
        self._connect_payload: Optional[dict] = None
        self._auth_result: Optional[dict] = None

    async def connect(self) -> dict:
        """
        连接 Gateway 并完成 device auth 握手。

        返回 Gateway 的最终 ``res/ok`` payload（通常含 ``auth.scopes`` 等信息）。

        注意：
        - 握手阶段的消息由本方法自己消费
        - 只有认证成功后，普通下行消息才会交给后台 ``_receive_loop`` 入队
        """
        if self._connected:
            return self._auth_result or {}

        # 加载/生成设备密钥
        self._private_bytes, self._public_bytes = _load_or_create_device_keys()
        self.device_id, self.public_key_b64 = _get_device_identity(
            self._private_bytes, self._public_bytes
        )

        self.ws = await websockets.connect(self.gateway_url)
        self._closed = False

        # 初始 connect 不带 device 签名；是否要求 challenge，由 Gateway 决定。
        req_id = f"py_{asyncio.get_event_loop().time()}"
        self._connect_payload = {
            "type": "req",
            "id": req_id,
            "method": "connect",
            "params": {
                "minProtocol": 4,
                "maxProtocol": 4,
                "client": {
                    "id": "gateway-client",
                    "version": "1.0.0",
                    "platform": "web",
                    "mode": "backend",
                },
                "role": "operator",
                "scopes": ["operator.read", "operator.write", "operator.admin"],
                "auth": {"token": self.token},
            },
        }

        await self.ws.send(json.dumps(self._connect_payload))

        # 握手阶段会同步等待：
        # - 可能先收到 connect.challenge
        # - 也可能直接收到最终 connect 成功/失败响应
        while True:
            raw = await self.ws.recv()
            msg = json.loads(raw)

            if msg.get("type") == "event" and msg.get("event") == "connect.challenge":
                await self._handle_challenge(msg)
                continue

            # Gateway 最终响应可能使用原始 id 或 challenge id
            if msg.get("type") == "res":
                if msg.get("ok"):
                    self._connected = True
                    self._auth_result = msg.get("payload", {})
                    # 启动后台接收任务
                    asyncio.create_task(self._receive_loop())
                    return self._auth_result
                else:
                    # 当前 Gateway 在 challenge 流程里可能回一个“第二次 connect 非法”的错误，
                    # 但真正的原始 connect 成功响应会随后到达，这里只能按字符串特判后继续等。
                    err_msg = msg.get("error", {}).get("message", "")
                    if "connect is only valid as the first request" in err_msg:
                        # 这是 challenge 被当作第二个 connect 的误报，忽略并继续等待
                        continue
                    raise Exception(f"Gateway connect failed: {msg.get('error')}")

    async def _handle_challenge(self, msg: dict):
        """处理 ``connect.challenge``，补上 device 签名后再次发送 connect。

        这里签名串的字段顺序、client id、role、scope、platform 等值
        都是当前后端实现写死的协议参与项。
        """
        nonce = msg["payload"]["nonce"]
        ts = msg["payload"]["ts"]
        scopes_str = ",".join(["operator.read", "operator.write", "operator.admin"])
        platform = "web"
        device_family = "desktop"

        payload = (
            f"v3|{self.device_id}|gateway-client|backend|operator|"
            f"{scopes_str}|{ts}|{self.token}|{nonce}|{platform}|{device_family}"
        )
        signature = _sign_challenge(self._private_bytes, payload)

        challenge_req_id = f"py_challenge_{asyncio.get_event_loop().time()}"
        challenge_payload = {
            **self._connect_payload,
            "id": challenge_req_id,
            "params": {
                **self._connect_payload["params"],
                "scopes": ["operator.read", "operator.write", "operator.admin"],
                "device": {
                    "id": self.device_id,
                    "publicKey": self.public_key_b64,
                    "signature": signature,
                    "signedAt": ts,
                    "nonce": nonce,
                },
            },
        }
        await self.ws.send(json.dumps(challenge_payload))

    async def _receive_loop(self):
        """后台任务：持续接收上游原始文本消息并存入队列。

        断线语义：
        - 非主动关闭时，最终会向队列写入一个 ``None`` 哨兵，通知 Hub 上游已断开
        - 主动 ``close()`` 时不会再补这个哨兵
        """
        try:
            while True:
                if self._closed:
                    break
                raw = await self.ws.recv()
                await self._receive_queue.put(raw)
        except websockets.exceptions.ConnectionClosed as exc:
            print(f"[OpenClawGateway] Connection closed: {exc}")
        except Exception as exc:
            print(f"[OpenClawGateway] Receive loop error: {exc}")
        finally:
            self._connected = False
            if not self._closed:
                await self._receive_queue.put(None)  # 发送哨兵值表示连接断开

    async def send(self, message: dict):
        """向 Gateway 发送消息。"""
        if not self.ws or self._closed:
            raise Exception("Gateway connection closed")
        await self.ws.send(json.dumps(message))

    async def receive(self) -> Optional[str]:
        """从内部队列取一条原始 JSON 文本；返回 ``None`` 表示上游异常断开。"""
        return await self._receive_queue.get()

    async def close(self):
        """主动关闭 Gateway 连接，并把本地连接状态标记为 closed。"""
        self._closed = True
        if self.ws:
            await self.ws.close()
            self.ws = None
        self._connected = False
