from typing import List, Optional

from fastapi import APIRouter, Body, HTTPException, Header

from app.schemas.hermes import (
    HermesAgentInfo,
    HermesChatRequest,
    HermesHealthResponse,
    HermesJobInfo,
    HermesSkillInfo,
    ToolsetItem,
    SkillInstallRequest,
    HermesJobCreateRequest,
    HermesJobUpdateRequest,
    HermesSkillToggleRequest,
)
from app.services import hermes as hermes_service

router = APIRouter(prefix="/external/hermes", tags=["external_hermes"])


@router.get("/health", response_model=HermesHealthResponse)
async def hermes_health():
    """检测 Hermes 服务状态。"""
    result = await hermes_service.hermes_health_check()
    return result


@router.get("/agent", response_model=HermesAgentInfo)
async def hermes_agent_info():
    """获取 Hermes Agent 信息（以 API Server 状态为主，Dashboard 为辅助）。"""
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

    # API 已在线，尝试从 Dashboard 获取更详细的 Agent 信息
    info = await hermes_service.get_hermes_agent_info()
    info["status"] = "online"
    info["configured"] = configured
    return info


@router.post("/chat")
async def hermes_chat(
    payload: HermesChatRequest,
    x_session_id: Optional[str] = Header(None, alias="X-Session-Id")
):
    """Forward chat request to Hermes. Injects _session_id into response body."""
    try:
        request_payload = payload.model_dump()
        if x_session_id:
            request_payload["session_id"] = x_session_id
        result = await hermes_service.hermes_chat(request_payload)
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Hermes chat failed: {exc}")


@router.get("/jobs", response_model=List[HermesJobInfo])
async def hermes_jobs():
    """获取 Hermes 定时任务列表。"""
    return await hermes_service.get_hermes_jobs()


@router.get("/skills", response_model=List[HermesSkillInfo])
async def hermes_skills():
    """获取 Hermes 技能列表。"""
    return await hermes_service.get_hermes_skills()


@router.post("/skills/{name}/toggle")
async def toggle_skill(name: str, body: HermesSkillToggleRequest):
    """启用或禁用技能。"""
    try:
        return await hermes_service.toggle_hermes_skill(name, body.enabled)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to toggle skill: {exc}")


@router.post("/skills/{name}/install")
def install_skill(name: str, body: SkillInstallRequest = Body(...)):
    """安装技能。"""
    success = hermes_service.install_hermes_skill(name, body.content)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to install skill")
    return {"success": True}


@router.delete("/skills/{name}/uninstall")
def uninstall_skill(name: str):
    """卸载技能。"""
    success = hermes_service.uninstall_hermes_skill(name)
    if not success:
        raise HTTPException(status_code=404, detail="Skill not found or failed to uninstall")
    return {"success": True}


@router.get("/toolsets", response_model=List[ToolsetItem])
async def hermes_toolsets():
    """获取工具集配置（Phase 1 只读）。"""
    return await hermes_service.get_hermes_toolsets()


# --- Job control ---


@router.post("/jobs", response_model=HermesJobInfo)
async def create_job(body: HermesJobCreateRequest):
    """创建定时任务。"""
    data = body.model_dump(exclude_none=True)
    try:
        return await hermes_service.create_hermes_job(data)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create job: {exc}")


@router.put("/jobs/{job_id}", response_model=HermesJobInfo)
async def update_job(job_id: str, body: HermesJobUpdateRequest):
    """更新定时任务。"""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        return await hermes_service.update_hermes_job(job_id, updates)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to update job: {exc}")


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """删除定时任务。"""
    try:
        result = await hermes_service.delete_hermes_job(job_id)
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete job: {exc}")


@router.post("/jobs/{job_id}/trigger")
async def trigger_job(job_id: str):
    """立即执行定时任务。"""
    try:
        return await hermes_service.trigger_hermes_job(job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to trigger job: {exc}")


@router.post("/jobs/{job_id}/pause")
async def pause_job(job_id: str):
    """暂停定时任务。"""
    try:
        return await hermes_service.pause_hermes_job(job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to pause job: {exc}")


@router.post("/jobs/{job_id}/resume")
async def resume_job(job_id: str):
    """恢复定时任务。"""
    try:
        return await hermes_service.resume_hermes_job(job_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to resume job: {exc}")


@router.get("/sessions")
async def list_sessions(limit: int = 20, offset: int = 0):
    """List Hermes sessions from Dashboard."""
    try:
        return await hermes_service.get_hermes_sessions(limit=limit, offset=offset)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to list sessions: {exc}")


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, limit: int = None, offset: int = 0):
    """Get messages for a specific Hermes session. Returns chronological order [older→newer]."""
    try:
        return await hermes_service.get_hermes_session_messages(session_id, limit=limit, offset=offset)
    except Exception:
        return {"messages": [], "total": 0}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a Hermes session."""
    try:
        return await hermes_service.delete_hermes_session(session_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to delete session: {exc}")
