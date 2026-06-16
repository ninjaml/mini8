from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services.openclaw_config import get_openclaw_gateway_url, get_openclaw_gateway_token
from app.services.openclaw_proxy_hub import get_hub
import asyncio
import json

router = APIRouter()


@router.get("/openclaw/config")
async def get_openclaw_config(request: Request, db: Session = Depends(get_db)):
    """
    返回 OpenClaw Gateway 连接配置。
    前端通过 proxyUrl 连接后端 WS 代理，无需直接连接 Gateway。
    """
    host = request.headers.get("host", "127.0.0.1:2048")
    proxy_url = f"ws://{host}/api/openclaw/ws"
    return {
        "gatewayUrl": get_openclaw_gateway_url(db),
        "token": get_openclaw_gateway_token(db),
        "proxyUrl": proxy_url,
    }


@router.websocket("/openclaw/ws")
async def openclaw_proxy_ws(websocket: WebSocket):
    """
    OpenClaw Gateway WebSocket 代理端点。

    前端连接此端点后，后端通过 Hub 订阅上游 Gateway 消息，
    实现双向透传：前端 <-> 后端 <-> Gateway。
    多个前端连接共享同一个上游 Gateway 连接。
    """
    await websocket.accept()
    client_id = f"{websocket.client.host}:{websocket.client.port}"
    print(f"[OpenClawProxy] Client connected: {client_id}")

    # 从数据库读取最新配置
    from sqlalchemy.orm import sessionmaker
    engine = websocket.app.state.engine
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    gateway_url = settings.OPENCLAW_GATEWAY_URL
    gateway_token = settings.OPENCLAW_GATEWAY_TOKEN
    try:
        gateway_url = get_openclaw_gateway_url(db)
        gateway_token = get_openclaw_gateway_token(db)
    except Exception:
        pass
    finally:
        db.close()

    hub = get_hub()
    subscriber_queue = None

    try:
        subscriber_queue = await hub.subscribe(gateway_url, gateway_token)
        print(f"[OpenClawProxy] Subscribed to Hub: {client_id}")
    except Exception as e:
        print(f"[OpenClawProxy] Hub subscribe failed: {e}")
        reason = str(e)
        if len(reason) > 120:
            reason = reason[:117] + "..."
        await websocket.close(code=1011, reason=reason)
        return

    # 双向转发任务
    async def forward_client_to_gateway():
        """读取前端消息，通过 Hub 转发给 Gateway。"""
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    parsed = json.loads(raw)
                    print(f"[OpenClawProxy] Client->Gateway: {parsed.get('method') or parsed.get('type')} id={parsed.get('id')}")
                    await hub.send(parsed)
                except Exception as e:
                    print(f"[OpenClawProxy] Send to Gateway failed: {e}")
                    try:
                        await websocket.send_text(json.dumps({"type": "event", "event": "proxy.error", "payload": {"message": str(e)}}))
                    except Exception:
                        pass
                    break
        except WebSocketDisconnect:
            print(f"[OpenClawProxy] Client disconnected: {client_id}")
        except Exception as e:
            print(f"[OpenClawProxy] Client->Gateway error: {e}")

    async def forward_gateway_to_client():
        """从 Hub 订阅队列读取 Gateway 消息，转发给前端。"""
        try:
            while True:
                raw = await subscriber_queue.get()
                if raw is None:
                    print(f"[OpenClawProxy] Gateway connection closed (hub signal)")
                    break
                try:
                    parsed = json.loads(raw)
                    print(f"[OpenClawProxy] Gateway->Client: {parsed.get('type')} id={parsed.get('id')} event={parsed.get('event')}")
                except Exception:
                    pass
                await websocket.send_text(raw)
        except WebSocketDisconnect:
            print(f"[OpenClawProxy] Client disconnected (gateway side): {client_id}")
        except Exception as e:
            print(f"[OpenClawProxy] Gateway->Client error: {e}")

    try:
        client_to_gateway_task = asyncio.create_task(forward_client_to_gateway())
        gateway_to_client_task = asyncio.create_task(forward_gateway_to_client())

        done, pending = await asyncio.wait(
            [client_to_gateway_task, gateway_to_client_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()

    finally:
        print(f"[OpenClawProxy] Cleaning up connection: {client_id}")
        if subscriber_queue is not None:
            await hub.unsubscribe(subscriber_queue)
        try:
            await websocket.close()
        except Exception:
            pass