import asyncio
import json
import logging
import shutil
from pathlib import Path
from typing import List, Optional, Dict, Any

import httpx
import yaml

from app.core.config import settings
from app.services import hermes_config as hc_service
from app.services import hermes_dashboard as hd_service

logger = logging.getLogger(__name__)


# --- HTTP Client ---
# 每次请求新建 client，避免配置变更后无法刷新，也不担心连接池长期运行问题。
# 优先从数据库缓存读取配置，若缓存未命中则回退到 config.py 默认值。


def _get_hermes_api_base_url() -> str:
    url = hc_service._hermes_config_cache.get("api_base_url", settings.HERMES_API_BASE_URL)
    return url.strip() if url else settings.HERMES_API_BASE_URL


def is_hermes_configured() -> bool:
    """检查数据库中是否已配置 Hermes 连接信息（api_base_url 非空）。"""
    url = hc_service._hermes_config_cache.get("api_base_url")
    return bool(url and url.strip())


def _get_hermes_api_key() -> str:
    key = hc_service._hermes_config_cache.get("api_key", settings.HERMES_API_KEY)
    return key.strip() if key else settings.HERMES_API_KEY


def _make_hermes_client(extra_headers: Optional[Dict[str, str]] = None) -> httpx.AsyncClient:
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
    """检测 Hermes 是否在线。HTTP 200 即视为在线，兼容空 body 和多种 status 格式。"""
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
    """Forward chat request to Hermes API. Injects _session_id into response body."""
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


# --- 路径解析（优先数据库缓存，回退 settings 默认值） ---


def _resolve_path(key: str, fallback: Path) -> Path:
    """从缓存读取路径字符串，解析为 Path 对象（支持 ~ 展开）。"""
    path_str = hc_service._hermes_config_cache.get(key, str(fallback))
    return Path(path_str).expanduser()


def _get_hermes_home_dir() -> Path:
    return _resolve_path("home_dir", settings.HERMES_HOME_DIR)


def _get_hermes_skills_dir() -> Path:
    return _resolve_path("skills_dir", settings.HERMES_SKILLS_DIR)


def _get_hermes_cron_jobs_path() -> Path:
    return _resolve_path("cron_jobs_path", settings.HERMES_CRON_JOBS_PATH)


def _get_hermes_config_path() -> Path:
    return _resolve_path("config_path", settings.HERMES_CONFIG_PATH)


# --- 文件系统操作 ---


def _read_yaml_safe(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception as exc:
        logger.warning("Failed to read YAML %s: %s", path, exc)
        return {}


def _hermes_home_exists() -> bool:
    """检查 Hermes 是否已安装（~/.hermes 是否存在）。"""
    return _get_hermes_home_dir().exists()


async def get_hermes_agent_info() -> Dict[str, Any]:
    """获取 Hermes Agent 信息（从 Dashboard API）。"""
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
    """获取所有技能（从 Dashboard API）。"""
    try:
        skills = await hd_service.dashboard_get_skills()
        return skills
    except Exception as exc:
        logger.warning("Failed to get Hermes skills from Dashboard: %s", exc)
        return []


async def get_hermes_jobs() -> List[Dict[str, Any]]:
    """获取定时任务列表（从 Dashboard API）。"""
    try:
        jobs = await hd_service.dashboard_get_jobs()
        return jobs
    except Exception as exc:
        logger.warning("Failed to get Hermes jobs from Dashboard: %s", exc)
        return []


async def get_hermes_toolsets() -> List[Dict[str, Any]]:
    """获取工具集列表（从 Dashboard API）。返回 list[dict] 适配 ToolsetItem schema。"""
    try:
        toolsets = await hd_service.dashboard_get_toolsets()
        return toolsets
    except Exception as exc:
        logger.warning("Failed to get Hermes toolsets from Dashboard: %s", exc)
        return []


# --- 技能文件操作 ---


def install_hermes_skill(name: str, skill_content: str) -> bool:
    """安装技能：写入 ~/.hermes/skills/<name>/SKILL.md"""
    try:
        skill_dir = _get_hermes_skills_dir() / name
        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_file = skill_dir / "SKILL.md"
        with open(skill_file, "w", encoding="utf-8") as f:
            f.write(skill_content)
        return True
    except Exception as exc:
        logger.warning("Failed to install Hermes skill: %s", exc)
        return False


async def get_hermes_dashboard_health() -> Dict[str, Any]:
    """检测 Hermes Dashboard 是否在线。"""
    return await hd_service.get_hermes_dashboard_health()


# --- Job control ---


async def trigger_hermes_job(job_id: str) -> Dict[str, Any]:
    """立即执行定时任务。"""
    try:
        return await hd_service.dashboard_trigger_job(job_id)
    except Exception as exc:
        logger.warning("Failed to trigger Hermes job %s: %s", job_id, exc)
        raise


async def pause_hermes_job(job_id: str) -> Dict[str, Any]:
    """暂停定时任务。"""
    try:
        return await hd_service.dashboard_pause_job(job_id)
    except Exception as exc:
        logger.warning("Failed to pause Hermes job %s: %s", job_id, exc)
        raise


async def resume_hermes_job(job_id: str) -> Dict[str, Any]:
    """恢复定时任务。"""
    try:
        return await hd_service.dashboard_resume_job(job_id)
    except Exception as exc:
        logger.warning("Failed to resume Hermes job %s: %s", job_id, exc)
        raise


async def delete_hermes_job(job_id: str) -> Dict[str, Any]:
    """删除定时任务。"""
    try:
        return await hd_service.dashboard_delete_job(job_id)
    except Exception as exc:
        logger.warning("Failed to delete Hermes job %s: %s", job_id, exc)
        raise


async def update_hermes_job(job_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """更新定时任务。"""
    try:
        return await hd_service.dashboard_update_job(job_id, updates)
    except Exception as exc:
        logger.warning("Failed to update Hermes job %s: %s", job_id, exc)
        raise


async def create_hermes_job(data: Dict[str, Any]) -> Dict[str, Any]:
    """创建定时任务。"""
    try:
        return await hd_service.dashboard_create_job(data)
    except Exception as exc:
        logger.warning("Failed to create Hermes job: %s", exc)
        raise


_skill_toggle_lock = asyncio.Lock()


async def toggle_hermes_skill(skill_name: str, enabled: bool) -> Dict[str, Any]:
    """启用或禁用技能。加锁防止读-改-写竞态。"""
    async with _skill_toggle_lock:
        try:
            return await hd_service.dashboard_toggle_skill(skill_name, enabled)
        except Exception as exc:
            logger.warning("Failed to toggle Hermes skill %s to %s: %s", skill_name, enabled, exc)
            raise


def uninstall_hermes_skill(name: str) -> bool:
    """卸载技能：删除 ~/.hermes/skills/<name>/"""
    try:
        skill_dir = _get_hermes_skills_dir() / name
        if skill_dir.exists():
            shutil.rmtree(skill_dir)
            return True
        return False
    except Exception as exc:
        logger.warning("Failed to uninstall Hermes skill: %s", exc)
        return False


# --- Session proxy (Dashboard) ---

async def get_hermes_sessions(limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    """List Hermes sessions from Dashboard."""
    return await hd_service.dashboard_get_sessions(limit=limit, offset=offset)


async def get_hermes_session_messages(session_id: str, limit: int = None, offset: int = 0) -> Dict[str, Any]:
    """Get messages for a specific Hermes session with in-memory pagination.
    
    Dashboard returns messages in chronological order [oldest, ..., newest].
    We keep this order and slice from the end (newest side) backward.
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
    """Delete a Hermes session."""
    return await hd_service.dashboard_delete_session(session_id)
