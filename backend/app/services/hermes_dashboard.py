import asyncio
import logging
import re
from typing import Dict, Any

import httpx

from app.services import hermes_config as hc_service

logger = logging.getLogger(__name__)

_token_manager: "TokenManager | None" = None


def _get_token_manager() -> "TokenManager":
    """返回与当前 dashboard_url 对应的单例 TokenManager。

    这里直接读取 ``hermes_config`` 的模块级缓存；
    一旦 Dashboard 地址变更，会丢弃旧 manager，让后续请求重新抓取新地址的 token。
    """
    global _token_manager
    current_url = hc_service._hermes_config_cache.get(
        "dashboard_url", "http://127.0.0.1:9119"
    ).rstrip("/")
    if _token_manager is None or _token_manager.dashboard_url != current_url:
        _token_manager = TokenManager(current_url)
    return _token_manager


class TokenManager:
    def __init__(self, dashboard_url: str):
        self.dashboard_url = dashboard_url.rstrip("/")
        self._token: str | None = None
        self._lock = asyncio.Lock()

    async def get_token(self) -> str:
        """读取当前缓存 token；若尚未抓到则懒加载一次。"""
        if self._token:
            return self._token
        return await self._refresh_token()

    async def _refresh_token(self) -> str:
        async with self._lock:
            # Double-check after acquiring lock
            if self._token:
                return self._token
            html = await self._fetch_login_page()
            token = self._extract_token(html)
            if not token:
                raise RuntimeError("Failed to extract session token from Dashboard")
            self._token = token
            return token

    async def _fetch_login_page(self) -> str:
        """抓取 Dashboard 首页 HTML，供后续从页面脚本里提取 session token。"""
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=3.0)
        ) as client:
            resp = await client.get(self.dashboard_url + "/")
            resp.raise_for_status()
            return resp.text

    def _extract_token(self, html: str) -> str | None:
        """从首页注入脚本里提取 ``window.__HERMES_SESSION_TOKEN__``。"""
        # Try double quotes first, then single quotes
        m = re.search(
            r'window\.__HERMES_SESSION_TOKEN__\s*=\s*"([^"]+)"', html
        )
        if m:
            return m.group(1)
        m = re.search(
            r"window\.__HERMES_SESSION_TOKEN__\s*=\s*'([^']+)'", html
        )
        if m:
            return m.group(1)
        return None

    def invalidate(self):
        self._token = None


async def _dashboard_request(
    method: str, path: str, json=None, retry_on_401=True
):
    """
    Dashboard API 统一请求入口。

    鉴权方式不是复用 Hermes API 的 ``api_key``，
    而是先访问 Dashboard 首页，再把提取到的 session token 放进 Bearer header。

    失败语义：
    - 401 时仅做一次“失效 token -> 重新抓取 -> 重试”
    - 其余异常只做日志记录，继续抛给上游 API/service 处理
    """
    token_manager = _get_token_manager()
    dashboard_url = hc_service._hermes_config_cache.get(
        "dashboard_url", "http://127.0.0.1:9119"
    ).rstrip("/")
    url = f"{dashboard_url}{path}"
    headers = {"Authorization": f"Bearer {await token_manager.get_token()}"}
    timeout = httpx.Timeout(15.0, connect=5.0)

    max_attempts = 2

    for attempt in range(1, max_attempts + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(
                    method, url, headers=headers, json=json
                )
                if resp.status_code == 401 and retry_on_401 and attempt < max_attempts:
                    logger.warning(
                        "Dashboard API 401 on attempt %d, invalidating token and retrying",
                        attempt,
                    )
                    token_manager.invalidate()
                    headers["Authorization"] = (
                        f"Bearer {await token_manager.get_token()}"
                    )
                    continue
                resp.raise_for_status()
                if resp.status_code == 204:
                    return {}
                return resp.json()
        except httpx.HTTPStatusError as exc:
            if 500 <= exc.response.status_code < 600:
                logger.error(
                    "Dashboard API server error %d: %s",
                    exc.response.status_code,
                    exc,
                )
            raise
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            logger.error("Dashboard API connection error: %s", exc)
            raise
        except Exception as exc:
            logger.error("Dashboard API unexpected error: %s", exc)
            raise


async def dashboard_get_config() -> dict:
    """读取 Dashboard 配置，但只向上游暴露 model 与 personality。

    ``/api/config`` 原始返回可能包含更多内部配置；
    当前 service 层主动裁剪，只保留 agent 摘要页真正用到的两个字段。
    """
    raw = await _dashboard_request("GET", "/api/config")
    raw_model = raw.get("model", "")
    # model may be a string (e.g. "MiniMax-M2.7") or a dict {"default": "..."}
    if isinstance(raw_model, dict):
        model_name = raw_model.get("default", "")
    else:
        model_name = raw_model or ""
    display = raw.get("display", {})
    return {
        "model": model_name,
        "personality": display.get("personality", ""),
    }


async def dashboard_get_skills() -> list:
    """读取技能列表；兼容 Dashboard 直接返回数组或 ``{"value": [...]}`` 两种形态。"""
    resp = await _dashboard_request("GET", "/api/skills")
    return resp if isinstance(resp, list) else resp.get("value", [])


async def dashboard_get_toolsets() -> list:
    """读取工具集列表；兼容数组直返与 ``value`` 包装。"""
    resp = await _dashboard_request("GET", "/api/tools/toolsets")
    return resp if isinstance(resp, list) else resp.get("value", [])


async def dashboard_get_jobs() -> list:
    """读取定时任务列表；兼容数组直返与 ``value`` 包装。"""
    resp = await _dashboard_request("GET", "/api/cron/jobs")
    return resp if isinstance(resp, list) else resp.get("value", [])


async def dashboard_get_logs() -> dict:
    """GET /api/logs -> returns dict."""
    return await _dashboard_request("GET", "/api/logs")


async def dashboard_get_usage() -> dict:
    """GET /api/analytics/usage -> returns dict."""
    return await _dashboard_request("GET", "/api/analytics/usage")


# --- Job control ---


async def dashboard_trigger_job(job_id: str) -> dict:
    """POST /api/cron/jobs/{id}/trigger -> immediately run a job."""
    return await _dashboard_request("POST", f"/api/cron/jobs/{job_id}/trigger")


async def dashboard_pause_job(job_id: str) -> dict:
    """POST /api/cron/jobs/{id}/pause -> pause a job."""
    return await _dashboard_request("POST", f"/api/cron/jobs/{job_id}/pause")


async def dashboard_resume_job(job_id: str) -> dict:
    """POST /api/cron/jobs/{id}/resume -> resume a paused job."""
    return await _dashboard_request("POST", f"/api/cron/jobs/{job_id}/resume")


async def dashboard_delete_job(job_id: str) -> dict:
    """DELETE /api/cron/jobs/{id} -> delete a job."""
    return await _dashboard_request("DELETE", f"/api/cron/jobs/{job_id}")


async def dashboard_update_job(job_id: str, updates: dict) -> dict:
    """PUT /api/cron/jobs/{id} -> update a job. Body: {"updates": {...}}"""
    return await _dashboard_request("PUT", f"/api/cron/jobs/{job_id}", json={"updates": updates})


async def dashboard_create_job(data: dict) -> dict:
    """POST /api/cron/jobs -> create a new job."""
    return await _dashboard_request("POST", "/api/cron/jobs", json=data)


async def dashboard_toggle_skill(skill_name: str, enabled: bool) -> dict:
    """通过改写 ``config.skills.disabled`` 来启用或禁用技能。

    真实调用链不是单独的“toggle”接口，而是：
    1. 先 GET 当前 ``/api/config``
    2. 改 ``skills.disabled`` 列表
    3. 再 PUT 整个补丁回去
    """
    config = await _dashboard_request("GET", "/api/config")
    skills_config = config.get("skills", {})
    disabled = set(skills_config.get("disabled", []))
    if enabled:
        disabled.discard(skill_name)
    else:
        disabled.add(skill_name)
    return await _dashboard_request(
        "PUT", "/api/config",
        json={"config": {"skills": {"disabled": sorted(disabled)}}}
    )


async def get_hermes_dashboard_health() -> dict:
    """
    检查 Dashboard 是否在线。

    判定标准是：
    - 首页可访问
    - HTML 中能看到 ``__HERMES_SESSION_TOKEN__`` 注入

    这里永远不向上抛异常，只回 ``online/offline`` 两种状态。
    """
    dashboard_url = hc_service._hermes_config_cache.get(
        "dashboard_url", "http://127.0.0.1:9119"
    ).rstrip("/")
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=3.0)
        ) as client:
            resp = await client.get(dashboard_url + "/")
            if resp.status_code == 200 and "__HERMES_SESSION_TOKEN__" in resp.text:
                return {"status": "online"}
            return {"status": "offline"}
    except Exception as exc:
        logger.warning("Hermes Dashboard health check failed: %s", exc)
        return {"status": "offline"}


# --- Session proxy methods (public) ---

async def dashboard_get_sessions(limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    """透传 Dashboard session 列表分页参数。"""
    return await _dashboard_request("GET", f"/api/sessions?limit={limit}&offset={offset}")


async def dashboard_get_session_messages(session_id: str) -> Dict[str, Any]:
    """读取单个 session 的完整消息列表；后续分页切片在 ``services/hermes.py`` 内完成。"""
    return await _dashboard_request("GET", f"/api/sessions/{session_id}/messages")


async def dashboard_delete_session(session_id: str) -> Dict[str, Any]:
    """删除单个 Dashboard session。"""
    return await _dashboard_request("DELETE", f"/api/sessions/{session_id}")
