"""外部集成路由。

这一层把两类外部能力暴露给前端：
- Hermes：HTTP 代理 + Dashboard 配置/任务/技能管理
- OpenClaw：配置读取 + WebSocket 代理转发

从前端调用链可以确认：
- ``frontend/src/features/hermes/hermesApi.js`` 会直接消费这里的 Hermes 路由
- ``frontend/src/features/openclaw/openclawApi.js`` / ``openclawGateway.js`` 会消费 OpenClaw 配置与代理 WS
"""

import asyncio
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.hermes_config import HermesConfig
from app.models.openclaw_config import OpenClawConfig
from app.schemas.hermes import (
    HermesAgentInfo,
    HermesChatRequest,
    HermesHealthResponse,
    HermesJobCreateRequest,
    HermesJobInfo,
    HermesJobUpdateRequest,
    HermesSkillInfo,
    HermesSkillToggleRequest,
    ToolsetItem,
)
from app.schemas.hermes_config import HermesConfigCreate, HermesConfigRead, HermesConfigUpdate
from app.schemas.openclaw_config import OpenClawConfigCreate, OpenClawConfigRead, OpenClawConfigUpdate
from app.services import hermes as hermes_service
from app.services import hermes_config as hc_service
from app.services import openclaw_config as oc_service
from app.services.openclaw_config import get_openclaw_gateway_token, get_openclaw_gateway_url
from app.services.openclaw_proxy_hub import get_hub


hermes_router = APIRouter(prefix="/external/hermes", tags=["external_hermes"])
hermes_config_router = APIRouter(prefix="/hermes-configs", tags=["Hermes配置"])
openclaw_router = APIRouter()
openclaw_config_router = APIRouter(prefix="/openclaw-configs", tags=["OpenClaw配置"])


@hermes_router.get("/health", response_model=HermesHealthResponse)
async def hermes_health():
    """透传 Hermes API 健康状态。"""
    return await hermes_service.hermes_health_check()


@hermes_router.get("/agent", response_model=HermesAgentInfo)
async def hermes_agent_info():
    """聚合 Hermes 在线状态与 Dashboard 摘要信息。

    判定流程：
    1. 先看 Hermes API 是否在线
    2. 在线时再去 Dashboard 摘出 model / personality
    3. 离线时返回一个本地拼装的默认 agent 外壳
    """
    api_health = await hermes_service.hermes_health_check()
    configured = hermes_service.is_hermes_configured()
    api_online = api_health.get("status") == "ok"
    if not api_online:
        return {
            "id": "default",
            "name": "Hermes Agent",
            "model": "",
            "personality": "",
            "status": "offline",
            "configured": configured,
        }
    info = await hermes_service.get_hermes_agent_info()
    info["status"] = "online"
    info["configured"] = configured
    return info


@hermes_router.post("/chat")
async def hermes_chat(payload: HermesChatRequest, x_session_id: Optional[str] = Header(None, alias="X-Session-Id")):
    """代理 Hermes chat 接口，并把前端 header 中的 session 线索下传给 service。"""
    try:
        request_payload = payload.model_dump()
        if x_session_id:
            request_payload["session_id"] = x_session_id
        return await hermes_service.hermes_chat(request_payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Hermes chat failed: {exc}")


@hermes_router.get("/jobs", response_model=List[HermesJobInfo])
async def hermes_jobs():
    """读取 Hermes Dashboard cron 任务列表。"""
    return await hermes_service.get_hermes_jobs()


@hermes_router.get("/skills", response_model=List[HermesSkillInfo])
async def hermes_skills():
    """读取 Hermes Dashboard 技能列表。"""
    return await hermes_service.get_hermes_skills()


@hermes_router.post("/skills/{name}/toggle")
async def toggle_skill(name: str, body: HermesSkillToggleRequest):
    """切换单个技能启停状态。"""
    try:
        return await hermes_service.toggle_hermes_skill(name, body.enabled)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to toggle skill: {exc}")


@hermes_router.get("/toolsets", response_model=List[ToolsetItem])
async def hermes_toolsets():
    """读取 Hermes Dashboard 工具集列表。"""
    return await hermes_service.get_hermes_toolsets()


@hermes_router.post("/jobs", response_model=HermesJobInfo)
async def create_job(body: HermesJobCreateRequest):
    """创建 Hermes 定时任务；请求体字段基本原样转发给下游。"""
    try:
        return await hermes_service.create_hermes_job(body.model_dump(exclude_none=True))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create job: {exc}")


@hermes_router.put("/jobs/{job_id}", response_model=HermesJobInfo)
async def update_job(job_id: str, body: HermesJobUpdateRequest):
    """更新 Hermes 定时任务；空更新会直接在路由层拦截为 400。"""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        return await hermes_service.update_hermes_job(job_id, updates)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to update job: {exc}")


@hermes_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """删除 Hermes 定时任务。"""
    try:
        return await hermes_service.delete_hermes_job(job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete job: {exc}")


@hermes_router.post("/jobs/{job_id}/trigger")
async def trigger_job(job_id: str):
    """立即触发一次 Hermes 定时任务。"""
    try:
        return await hermes_service.trigger_hermes_job(job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to trigger job: {exc}")


@hermes_router.post("/jobs/{job_id}/pause")
async def pause_job(job_id: str):
    """暂停 Hermes 定时任务。"""
    try:
        return await hermes_service.pause_hermes_job(job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to pause job: {exc}")


@hermes_router.post("/jobs/{job_id}/resume")
async def resume_job(job_id: str):
    """恢复 Hermes 定时任务。"""
    try:
        return await hermes_service.resume_hermes_job(job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to resume job: {exc}")


@hermes_router.get("/sessions")
async def list_sessions(limit: int = 20, offset: int = 0):
    """列出 Hermes Dashboard sessions；分页参数直接透传给 service。"""
    try:
        return await hermes_service.get_hermes_sessions(limit=limit, offset=offset)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to list sessions: {exc}")


@hermes_router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, limit: int = None, offset: int = 0):
    """读取某个 session 的消息分页片段。

    实际切片逻辑在 ``services/hermes.py`` 中完成；
    路由层这里只负责接收分页参数与兜底返回。
    """
    try:
        return await hermes_service.get_hermes_session_messages(session_id, limit=limit, offset=offset)
    except Exception:
        return {"messages": [], "total": 0}


@hermes_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """删除单个 Hermes session。"""
    try:
        return await hermes_service.delete_hermes_session(session_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete session: {exc}")


@hermes_config_router.get("", response_model=list[HermesConfigRead])
def list_hermes_configs(db: Session = Depends(get_db)):
    """列出当前正式支持的 Hermes 配置记录。"""
    return (
        db.query(HermesConfig)
        .filter(HermesConfig.key.in_(hc_service.SUPPORTED_HERMES_CONFIG_KEYS))
        .order_by(HermesConfig.key.asc())
        .all()
    )


@hermes_config_router.get("/{config_key}", response_model=HermesConfigRead)
def get_hermes_config(config_key: str, db: Session = Depends(get_db)):
    """按 key 读取单条 Hermes 配置；不支持的 key 直接视为不存在。"""
    if not hc_service.is_supported_hermes_config_key(config_key):
        raise HTTPException(status_code=404, detail="配置不存在")
    cfg = db.query(HermesConfig).filter(HermesConfig.key == config_key).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    return cfg


@hermes_config_router.post("", response_model=HermesConfigRead)
def create_hermes_config(payload: HermesConfigCreate, db: Session = Depends(get_db)):
    """创建或覆盖 Hermes 配置，并在提交后刷新模块级缓存。"""
    if not hc_service.is_supported_hermes_config_key(payload.key):
        raise HTTPException(status_code=400, detail=f"Unsupported Hermes config key: {payload.key}")
    existing = db.query(HermesConfig).filter(HermesConfig.key == payload.key).first()
    if existing:
        existing.value = payload.value
        if payload.description is not None:
            existing.description = payload.description
        db.commit()
        db.refresh(existing)
        hc_service._refresh_cache(db)
        return existing

    cfg = HermesConfig(key=payload.key, value=payload.value, description=payload.description)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    hc_service._refresh_cache(db)
    return cfg


@hermes_config_router.put("/{config_id}", response_model=HermesConfigRead)
def update_hermes_config(config_id: int, payload: HermesConfigUpdate, db: Session = Depends(get_db)):
    """按主键更新已有 Hermes 配置记录，并刷新缓存。"""
    cfg = db.query(HermesConfig).filter(HermesConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    if not hc_service.is_supported_hermes_config_key(cfg.key):
        raise HTTPException(status_code=400, detail=f"Unsupported Hermes config key: {cfg.key}")
    cfg.value = payload.value
    if payload.description is not None:
        cfg.description = payload.description
    db.commit()
    db.refresh(cfg)
    hc_service._refresh_cache(db)
    return cfg


@hermes_config_router.delete("/{config_id}")
def delete_hermes_config(config_id: int, db: Session = Depends(get_db)):
    """删除单条 Hermes 配置记录，并刷新缓存。"""
    cfg = db.query(HermesConfig).filter(HermesConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(cfg)
    db.commit()
    hc_service._refresh_cache(db)
    return {"message": "已删除"}


@openclaw_router.get("/openclaw/config")
async def get_openclaw_config(request: Request, db: Session = Depends(get_db)):
    """返回 OpenClaw 前端建连所需的三元组。

    - ``gatewayUrl``: 上游真实 Gateway 地址
    - ``token``: 上游认证 token
    - ``proxyUrl``: 推荐给浏览器连接的后端代理 WS 地址
    """
    host = request.headers.get("host", "127.0.0.1:2048")
    proxy_url = f"ws://{host}/api/openclaw/ws"
    return {
        "gatewayUrl": get_openclaw_gateway_url(db),
        "token": get_openclaw_gateway_token(db),
        "proxyUrl": proxy_url,
    }


@openclaw_router.websocket("/openclaw/ws")
async def openclaw_proxy_ws(websocket: WebSocket):
    """OpenClaw 浏览器代理 WS。

    真实链路是：
    browser websocket -> 本路由 -> OpenClawGatewayHub -> 单例上游 Gateway 连接

    这样浏览器无需自己持有 device key，也无需直连 Gateway 做 challenge 握手。
    """
    await websocket.accept()
    engine = websocket.app.state.engine
    from sqlalchemy.orm import sessionmaker

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
    except Exception as e:
        reason = str(e)
        if len(reason) > 120:
            reason = reason[:117] + "..."
        await websocket.close(code=1011, reason=reason)
        return

    async def forward_client_to_gateway():
        """把浏览器发来的 JSON RPC 请求转发到共享 Hub。"""
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    await hub.send(json.loads(raw))
                except Exception as e:
                    try:
                        await websocket.send_text(json.dumps({"type": "event", "event": "proxy.error", "payload": {"message": str(e)}}))
                    except Exception:
                        pass
                    break
        except (WebSocketDisconnect, Exception):
            return

    async def forward_gateway_to_client():
        """把 Hub 广播过来的上游消息持续回推给当前浏览器连接。"""
        try:
            while True:
                raw = await subscriber_queue.get()
                if raw is None:
                    break
                await websocket.send_text(raw)
        except (WebSocketDisconnect, Exception):
            return

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
        if subscriber_queue is not None:
            await hub.unsubscribe(subscriber_queue)
        try:
            await websocket.close()
        except Exception:
            pass


@openclaw_config_router.get("", response_model=list[OpenClawConfigRead])
def list_openclaw_configs(db: Session = Depends(get_db)):
    """列出当前正式支持的 OpenClaw 配置记录。"""
    return (
        db.query(OpenClawConfig)
        .filter(OpenClawConfig.key.in_(oc_service.SUPPORTED_OPENCLAW_CONFIG_KEYS))
        .order_by(OpenClawConfig.key.asc())
        .all()
    )


@openclaw_config_router.get("/{config_key}", response_model=OpenClawConfigRead)
def get_openclaw_config_record(config_key: str, db: Session = Depends(get_db)):
    """按 key 读取单条 OpenClaw 配置。"""
    if not oc_service.is_supported_openclaw_config_key(config_key):
        raise HTTPException(status_code=400, detail=f"Unsupported OpenClaw config key: {config_key}")
    cfg = db.query(OpenClawConfig).filter(OpenClawConfig.key == config_key).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    return cfg


@openclaw_config_router.post("", response_model=OpenClawConfigRead)
def create_openclaw_config(payload: OpenClawConfigCreate, db: Session = Depends(get_db)):
    """创建或覆盖 OpenClaw 配置，并在提交后刷新缓存。"""
    if not oc_service.is_supported_openclaw_config_key(payload.key):
        raise HTTPException(status_code=400, detail=f"Unsupported OpenClaw config key: {payload.key}")
    existing = db.query(OpenClawConfig).filter(OpenClawConfig.key == payload.key).first()
    if existing:
        existing.value = payload.value
        if payload.description is not None:
            existing.description = payload.description
        db.commit()
        db.refresh(existing)
        oc_service.refresh_openclaw_config_cache(db)
        return existing

    cfg = OpenClawConfig(key=payload.key, value=payload.value, description=payload.description)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    oc_service.refresh_openclaw_config_cache(db)
    return cfg


@openclaw_config_router.put("/{config_id}", response_model=OpenClawConfigRead)
def update_openclaw_config(config_id: int, payload: OpenClawConfigUpdate, db: Session = Depends(get_db)):
    """按主键更新已有 OpenClaw 配置，并刷新缓存。"""
    cfg = db.query(OpenClawConfig).filter(OpenClawConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    if not oc_service.is_supported_openclaw_config_key(cfg.key):
        raise HTTPException(status_code=400, detail=f"Unsupported OpenClaw config key: {cfg.key}")
    cfg.value = payload.value
    if payload.description is not None:
        cfg.description = payload.description
    db.commit()
    db.refresh(cfg)
    oc_service.refresh_openclaw_config_cache(db)
    return cfg


@openclaw_config_router.delete("/{config_id}")
def delete_openclaw_config(config_id: int, db: Session = Depends(get_db)):
    """删除单条 OpenClaw 配置记录，并刷新缓存。"""
    cfg = db.query(OpenClawConfig).filter(OpenClawConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(cfg)
    db.commit()
    oc_service.refresh_openclaw_config_cache(db)
    return {"message": "已删除"}
