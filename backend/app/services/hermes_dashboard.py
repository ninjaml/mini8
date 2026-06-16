import asyncio
import logging
import re
from typing import Dict, Any

import httpx

from app.services import hermes_config as hc_service

logger = logging.getLogger(__name__)

_token_manager: "TokenManager | None" = None


def _get_token_manager() -> "TokenManager":
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
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=3.0)
        ) as client:
            resp = await client.get(self.dashboard_url + "/")
            resp.raise_for_status()
            return resp.text

    def _extract_token(self, html: str) -> str | None:
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
    Generic Dashboard API request wrapper.

    - Gets token from TokenManager
    - Sends request with Bearer token
    - On 401: invalidate token, refresh, retry (max 2 attempts total)
    - Catches all exceptions and re-raises for upstream handling

    All Dashboard API endpoints return {"value": [...]} or a dict.
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
    """GET /api/config -> returns full dict.
    Security: extract model + display.personality only, do NOT return full config to caller."""
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
    """GET /api/skills -> returns list (Dashboard returns array directly)."""
    resp = await _dashboard_request("GET", "/api/skills")
    return resp if isinstance(resp, list) else resp.get("value", [])


async def dashboard_get_toolsets() -> list:
    """GET /api/tools/toolsets -> returns list (Dashboard returns array directly)."""
    resp = await _dashboard_request("GET", "/api/tools/toolsets")
    return resp if isinstance(resp, list) else resp.get("value", [])


async def dashboard_get_jobs() -> list:
    """GET /api/cron/jobs -> returns list (Dashboard returns array directly)."""
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
    """Enable or disable a skill by updating config.skills.disabled list.
    GET /api/config -> modify disabled list -> PUT /api/config
    Returns {"ok": true} on success."""
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
    Check if Dashboard is online.
    GET / (no auth needed). Check HTTP 200 and HTML contains __HERMES_SESSION_TOKEN__.
    NEVER raise exception. Always return {"status": "online"} or {"status": "offline"}.
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
    return await _dashboard_request("GET", f"/api/sessions?limit={limit}&offset={offset}")


async def dashboard_get_session_messages(session_id: str) -> Dict[str, Any]:
    return await _dashboard_request("GET", f"/api/sessions/{session_id}/messages")


async def dashboard_delete_session(session_id: str) -> Dict[str, Any]:
    return await _dashboard_request("DELETE", f"/api/sessions/{session_id}")
