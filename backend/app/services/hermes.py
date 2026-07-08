import asyncio
import json
import logging
from typing import List, Optional, Dict, Any

import httpx

from app.core.config import settings
from app.services import hermes_config as hc_service
from app.services import hermes_dashboard as hd_service

logger = logging.getLogger(__name__)


# --- HTTP Client ---
# 每次请求新建 client，避免配置变更后无法刷新，也不担心连接池长期运行问题。
# 当前实现直接读取 hermes_config 的模块级缓存；若缓存未命中则回退到 settings 默认值。


def _get_hermes_api_base_url() -> str:
    """读取 Hermes API Base URL。

    当前实现直接访问 ``hc_service._hermes_config_cache``，
    而不是调用 ``get_hermes_api_base_url(db)`` 这类数据库封装。
    """
    url = hc_service._hermes_config_cache.get("api_base_url", settings.HERMES_API_BASE_URL)
    return url.strip() if url else settings.HERMES_API_BASE_URL


def is_hermes_configured() -> bool:
    """检查 Hermes 是否已完成最基本的连接配置。

    当前判定标准很窄：
    - 仅要求缓存里的 ``api_base_url`` 非空
    - 不验证 ``api_key`` 是否存在
    - 也不验证服务真的可连通
    """
    url = hc_service._hermes_config_cache.get("api_base_url")
    return bool(url and url.strip())


def _get_hermes_api_key() -> str:
    """读取 Hermes API Key。"""
    key = hc_service._hermes_config_cache.get("api_key", settings.HERMES_API_KEY)
    return key.strip() if key else settings.HERMES_API_KEY


def _make_hermes_client(extra_headers: Optional[Dict[str, str]] = None) -> httpx.AsyncClient:
    """构造面向 Hermes API 的临时 AsyncClient。"""
    headers = {}
    api_key = _get_hermes_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if extra_headers:
        headers.update(extra_headers)
    return httpx.AsyncClient(
        base_url=_get_hermes_api_base_url(),
        timeout=httpx.Timeout(180.0, connect=5.0),
        headers=headers,
    )


async def hermes_health_check() -> Dict[str, Any]:
    """检测 Hermes API 是否在线。

    判定策略比普通健康检查宽一些：
    - HTTP 200 即视为在线
    - body 为空或非 JSON 也视为在线
    - JSON 里若没 ``status`` 字段，会补成 ``ok``
    """
    client = _make_hermes_client()
    try:
        response = await client.get("/health")
        if response.status_code == 200:
            try:
                data = response.json()
                # 兼容 {"status": "ok"}, {"status": "healthy"}, {} 等
                if "status" not in data:
                    data["status"] = "ok"
                return data
            except Exception:
                # 空 body 或非 JSON 也视为在线
                return {"status": "ok"}
        return {"status": "error", "detail": f"HTTP {response.status_code}"}
    except Exception as exc:
        return {"status": "offline", "detail": str(exc)}
    finally:
        await client.aclose()


async def hermes_chat(request_payload: Dict[str, Any]) -> Dict[str, Any]:
    """把聊天请求转发给 Hermes API，并把 session 线索补回响应体。

    当前协议细节：
    - 若请求里带 ``session_id``，会转成请求头 ``X-Hermes-Session-Id``
    - 若响应头里带回同名 header，会再写回响应体的 ``_session_id``
    """
    session_id = request_payload.get("session_id")
    extra_headers = {}
    if session_id:
        extra_headers["X-Hermes-Session-Id"] = session_id
    client = _make_hermes_client(extra_headers)
    try:
        response = await client.post("/v1/chat/completions", json=request_payload)
        response.raise_for_status()
        result = response.json()
        returned_session_id = response.headers.get("X-Hermes-Session-Id")
        if returned_session_id:
            result["_session_id"] = returned_session_id
        return result
    finally:
        await client.aclose()


async def get_hermes_agent_info() -> Dict[str, Any]:
    """获取 Hermes Agent 摘要信息。

    这里并不是从 Hermes API 主服务直接取 agent 元数据，
    而是转向 Dashboard 的 ``/api/config``，再只摘出 model 与 personality。
    """
    try:
        config = await hd_service.dashboard_get_config()
        return {
            "id": "default",
            "name": "Hermes Agent",
            "model": config.get("model", ""),
            "personality": config.get("personality", ""),
            "status": "unknown",
        }
    except Exception as exc:
        logger.warning("Failed to get Hermes agent info from Dashboard: %s", exc)
        return {
            "id": "default",
            "name": "Hermes Agent",
            "model": "",
            "personality": "",
            "status": "unknown",
        }


async def get_hermes_skills() -> List[Dict[str, Any]]:
    """获取所有技能（从 Dashboard API）。失败时返回空列表。"""
    try:
        skills = await hd_service.dashboard_get_skills()
        return skills
    except Exception as exc:
        logger.warning("Failed to get Hermes skills from Dashboard: %s", exc)
        return []


async def get_hermes_jobs() -> List[Dict[str, Any]]:
    """获取定时任务列表（从 Dashboard API）。失败时返回空列表。"""
    try:
        jobs = await hd_service.dashboard_get_jobs()
        return jobs
    except Exception as exc:
        logger.warning("Failed to get Hermes jobs from Dashboard: %s", exc)
        return []


async def get_hermes_toolsets() -> List[Dict[str, Any]]:
    """获取工具集列表（从 Dashboard API）。失败时返回空列表。"""
    try:
        toolsets = await hd_service.dashboard_get_toolsets()
        return toolsets
    except Exception as exc:
        logger.warning("Failed to get Hermes toolsets from Dashboard: %s", exc)
        return []


async def get_hermes_dashboard_health() -> Dict[str, Any]:
    """检测 Hermes Dashboard 是否在线。"""
    return await hd_service.get_hermes_dashboard_health()


# --- Job control ---


async def trigger_hermes_job(job_id: str) -> Dict[str, Any]:
    """立即执行定时任务。失败时记录 warning 后继续把异常抛给上层。"""
    try:
        return await hd_service.dashboard_trigger_job(job_id)
    except Exception as exc:
        logger.warning("Failed to trigger Hermes job %s: %s", job_id, exc)
        raise


async def pause_hermes_job(job_id: str) -> Dict[str, Any]:
    """暂停定时任务。失败时记录 warning 后继续把异常抛给上层。"""
    try:
        return await hd_service.dashboard_pause_job(job_id)
    except Exception as exc:
        logger.warning("Failed to pause Hermes job %s: %s", job_id, exc)
        raise


async def resume_hermes_job(job_id: str) -> Dict[str, Any]:
    """恢复定时任务。失败时记录 warning 后继续把异常抛给上层。"""
    try:
        return await hd_service.dashboard_resume_job(job_id)
    except Exception as exc:
        logger.warning("Failed to resume Hermes job %s: %s", job_id, exc)
        raise


async def delete_hermes_job(job_id: str) -> Dict[str, Any]:
    """删除定时任务。失败时记录 warning 后继续把异常抛给上层。"""
    try:
        return await hd_service.dashboard_delete_job(job_id)
    except Exception as exc:
        logger.warning("Failed to delete Hermes job %s: %s", job_id, exc)
        raise


async def update_hermes_job(job_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """更新定时任务。``updates`` 会原样转发给 Dashboard API。"""
    try:
        return await hd_service.dashboard_update_job(job_id, updates)
    except Exception as exc:
        logger.warning("Failed to update Hermes job %s: %s", job_id, exc)
        raise


async def create_hermes_job(data: Dict[str, Any]) -> Dict[str, Any]:
    """创建定时任务。``data`` 会原样转发给 Dashboard API。"""
    try:
        return await hd_service.dashboard_create_job(data)
    except Exception as exc:
        logger.warning("Failed to create Hermes job: %s", exc)
        raise


_skill_toggle_lock = asyncio.Lock()


async def toggle_hermes_skill(skill_name: str, enabled: bool) -> Dict[str, Any]:
    """启用或禁用技能。

    这里显式加锁，是因为下游实现是：
    1. 先 GET 当前 config
    2. 再改 disabled 列表
    3. 再 PUT 回去

    如果没有锁，并发切换技能会有明显的读-改-写竞态。
    """
    async with _skill_toggle_lock:
        try:
            return await hd_service.dashboard_toggle_skill(skill_name, enabled)
        except Exception as exc:
            logger.warning("Failed to toggle Hermes skill %s to %s: %s", skill_name, enabled, exc)
            raise


# --- Session proxy (Dashboard) ---

async def get_hermes_sessions(limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    """从 Dashboard 列出 Hermes sessions。"""
    return await hd_service.dashboard_get_sessions(limit=limit, offset=offset)


async def get_hermes_session_messages(session_id: str, limit: int = None, offset: int = 0) -> Dict[str, Any]:
    """读取某个 Hermes session 的消息，并在内存中做分页切片。

    Dashboard 返回的是时间正序 ``[oldest, ..., newest]``。
    这里不会重新倒序，而是从尾部向前切：
    - ``offset=0`` 表示最新一段
    - ``offset>0`` 表示更早的一段
    """
    data = await hd_service.dashboard_get_session_messages(session_id)
    messages = data.get("messages", [])
    total = len(messages)
    
    if limit is not None:
        # Slice from the end: offset=0 → tail (newest), offset>0 → earlier slices
        end = total - offset
        start = max(0, end - limit)
        return {"messages": messages[start:end], "total": total}
    
    return {"messages": messages, "total": total}


async def delete_hermes_session(session_id: str) -> Dict[str, Any]:
    """删除一个 Hermes session。"""
    return await hd_service.dashboard_delete_session(session_id)
