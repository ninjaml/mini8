"""Cron job management API routes."""

import asyncio
from datetime import timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from deepagents_webapi.scheduler.engine import CronEngine
from deepagents_webapi.scheduler.history_models import (
    CronHistoryJobDetail,
    CronHistoryListResponse,
)
from deepagents_webapi.scheduler.history_service import (
    build_agent_history_list,
    build_job_history_detail,
)
from deepagents_webapi.scheduler.models import (
    AgentKind,
    CronJobCreate,
    CronJobResponse,
    CronJobUpdate,
)
from deepagents_webapi.scheduler.resolver import (
    generate_cron_thread_id,
    resolve_cron_agent,
)
from deepagents_webapi.scheduler.store import CronJobStore

router = APIRouter()

# Set by main.py lifespan (same pattern as chat.py / sessions.py)
cron_store: Optional[CronJobStore] = None
cron_engine: Optional[CronEngine] = None
session_manager = None


def set_cron_store(store: CronJobStore) -> None:
    global cron_store
    cron_store = store


def set_cron_engine(engine: CronEngine) -> None:
    global cron_engine
    cron_engine = engine


def set_session_manager(manager) -> None:
    global session_manager
    session_manager = manager


# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #

def _job_to_response(job, *, is_running: bool = False) -> CronJobResponse:
    return CronJobResponse(
        id=job.id,
        kind=job.kind,
        target_id=job.target_id,
        agent_name=job.agent_name,
        name=job.name,
        schedule=job.schedule,
        prompt=job.prompt,
        thread_id=job.thread_id,
        working_dir=job.working_dir,
        enabled=job.enabled,
        created_at=job.created_at.replace(tzinfo=timezone.utc).isoformat(),
        updated_at=job.updated_at.replace(tzinfo=timezone.utc).isoformat(),
        last_run_at=job.last_run_at.replace(tzinfo=timezone.utc).isoformat() if job.last_run_at else None,
        last_status=job.last_status,
        last_error=job.last_error,
        last_duration_ms=job.last_duration_ms,
        run_count=job.run_count,
        is_running=is_running,
    )


# ------------------------------------------------------------------ #
# Routes
# ------------------------------------------------------------------ #

@router.get("/api/runtime/cron/jobs", response_model=list[CronJobResponse])
async def list_cron_jobs(agent_name: Optional[str] = None):
    """List all cron jobs, optionally filtered by agent_name."""
    if cron_store is None:
        raise HTTPException(status_code=500, detail="Cron store not initialized")
    jobs = await cron_store.list_jobs(agent_name)
    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return [_job_to_response(j, is_running=j.id in running_job_ids) for j in jobs]


@router.post("/api/runtime/cron/jobs", response_model=CronJobResponse)
async def create_cron_job(request: CronJobCreate):
    """Create a new cron job.

    Derives ``agent_name`` and ``working_dir`` from ``kind + target_id``.
    Auto-generates a fixed ``thread_id`` and registers the session metadata.
    """
    if cron_store is None or cron_engine is None or session_manager is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    # 1. Resolve agent_name + working_dir
    try:
        resolved_agent_name, default_working_dir = resolve_cron_agent(
            request.kind, request.target_id
        )
        cron_engine.validate_schedule(request.schedule)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    working_dir = request.working_dir or default_working_dir

    # 2. Generate fixed thread_id
    thread_id = generate_cron_thread_id(
        request.kind, request.target_id, request.name
    )

    # 3. Ensure session metadata exists
    if not await session_manager.session_exists(thread_id):
        await session_manager.create_session(
            thread_id=thread_id,
            agent_name=resolved_agent_name,
            working_dir=working_dir,
            name=f"[定时] {request.name}",
            history_turn_limit=20,
        )
    else:
        await session_manager.update_session_metadata(
            thread_id,
            agent_name=resolved_agent_name,
            working_dir=working_dir,
            name=f"[定时] {request.name}",
            history_turn_limit=20,
        )

    # 4. Persist cron job
    job = await cron_store.create_job(
        kind=request.kind,
        target_id=request.target_id,
        agent_name=resolved_agent_name,
        name=request.name,
        schedule=request.schedule,
        prompt=request.prompt,
        thread_id=thread_id,
        working_dir=working_dir,
    )

    # 5. Register in scheduler
    await cron_engine.add_and_schedule(job)

    return _job_to_response(job, is_running=False)


@router.get("/api/runtime/cron/jobs/{job_id}", response_model=CronJobResponse)
async def get_cron_job(job_id: int):
    """Get a single cron job by id."""
    if cron_store is None:
        raise HTTPException(status_code=500, detail="Cron store not initialized")
    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")
    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return _job_to_response(job, is_running=job_id in running_job_ids)


@router.patch("/api/runtime/cron/jobs/{job_id}", response_model=CronJobResponse)
async def update_cron_job(job_id: int, request: CronJobUpdate):
    """Partial update of a cron job."""
    if cron_store is None or cron_engine is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    if request.schedule is not None:
        try:
            cron_engine.validate_schedule(request.schedule)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    updated = await cron_store.update_job(
        job_id,
        name=request.name,
        schedule=request.schedule,
        prompt=request.prompt,
        enabled=request.enabled,
        working_dir=request.working_dir,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    await session_manager.update_session_metadata(
        updated.thread_id,
        agent_name=updated.agent_name,
        working_dir=updated.working_dir,
        name=f"[定时] {updated.name}",
        history_turn_limit=20,
    )

    schedule_changed = request.schedule is not None and request.schedule != job.schedule
    enabled_changed = request.enabled is not None and request.enabled != job.enabled

    if schedule_changed:
        if updated.enabled:
            await cron_engine.reschedule(updated)
        else:
            await cron_engine.unschedule(job_id)
    elif enabled_changed:
        if updated.enabled:
            await cron_engine.add_and_schedule(updated)
        else:
            await cron_engine.unschedule(job_id)

    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return _job_to_response(updated, is_running=updated.id in running_job_ids)


@router.delete("/api/runtime/cron/jobs/{job_id}")
async def delete_cron_job(job_id: int):
    """Delete a cron job and remove its scheduler trigger."""
    if cron_store is None or cron_engine is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    await cron_engine.unschedule(job_id)
    deleted = await cron_store.delete_job(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cron job not found")

    return {"message": "Cron job deleted"}


@router.post("/api/runtime/cron/jobs/{job_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_cron_job(job_id: int):
    """Manually trigger a cron job (fires asynchronously, returns 202)."""
    if cron_store is None or cron_engine is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    # Fire in background so the HTTP response returns immediately
    asyncio.create_task(cron_engine.run_now(job_id))
    return {"message": "Job triggered", "job_id": job_id}


@router.post("/api/runtime/cron/jobs/{job_id}/toggle", response_model=CronJobResponse)
async def toggle_cron_job(job_id: int):
    """Toggle enabled state of a cron job."""
    if cron_store is None or cron_engine is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    new_enabled = not job.enabled
    updated = await cron_store.update_job(job_id, enabled=new_enabled)
    if updated is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    if new_enabled:
        await cron_engine.add_and_schedule(updated)
    else:
        await cron_engine.unschedule(job_id)

    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return _job_to_response(updated, is_running=updated.id in running_job_ids)


# ------------------------------------------------------------------ #
# History aggregation (read-only)
# ------------------------------------------------------------------ #

@router.get("/api/runtime/cron/history", response_model=CronHistoryListResponse)
async def list_cron_history(kind: AgentKind, target_id: int | None = None):
    """List cron jobs with latest-run summaries for the current agent scope."""
    if cron_store is None or session_manager is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    # Derive agent_name for filtering
    try:
        agent_name, _ = resolve_cron_agent(kind, target_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    jobs = await cron_store.list_jobs(agent_name=agent_name)
    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return await build_agent_history_list(kind, target_id, jobs, session_manager, running_job_ids)


@router.get("/api/runtime/cron/history/jobs/{job_id}", response_model=CronHistoryJobDetail)
async def get_cron_history_job_detail(
    job_id: int,
    kind: AgentKind | None = None,
    target_id: int | None = None,
    group_limit: int = 20,
    before_cursor: int | None = None,
):
    """Get detailed history for a single cron job (grouped by execution).

    When ``kind`` is provided, validates that the job belongs to the given scope.
    """
    if cron_store is None or session_manager is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    # Scope validation: ensure the job belongs to the requested agent scope
    if kind is not None:
        try:
            expected_agent_name, _ = resolve_cron_agent(kind, target_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        if job.agent_name != expected_agent_name:
            raise HTTPException(
                status_code=403,
                detail="Cron job does not belong to the requested agent scope",
            )

    group_limit = max(1, min(group_limit, 100))

    events, group_ids, next_cursor = await session_manager.list_session_events_by_groups(
        job.thread_id,
        limit_groups=group_limit,
        before_cursor=before_cursor,
    )

    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return build_job_history_detail(job, events, group_ids, next_cursor, running_job_ids)