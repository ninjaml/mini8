"""定时任务相关 API 路由。"""
from datetime import timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.orm import sessionmaker

from app.repositories.cron_job import CronJobStore
from app.services.cron_history_service import (
    build_agent_history_list,
    build_job_history_detail,
)
from app.services.cron_runtime_service import (
    generate_cron_thread_id,
    resolve_cron_agent,
)
from deepagents_webapi.api.cron_history_models import (
    CronHistoryJobDetail,
    CronHistoryListResponse,
)
from deepagents_webapi.api.cron_models import (
    AgentKind,
    CronJobCreate,
    CronJobResponse,
    CronJobUpdate,
)
from deepagents_webapi.scheduler.engine import CronEngine
from app.repositories.agent_session import list_workspace_agent_sessions_by_workspace_id
from app.repositories.workspace import get_workspace

router = APIRouter()

# 由 main.py 在应用启动时注入。
cron_store: Optional[CronJobStore] = None
cron_engine: Optional[CronEngine] = None
session_manager = None


def _build_request_session(request: Request):
    """从当前 FastAPI app state 构造一次数据库会话。"""
    Session = sessionmaker(bind=request.app.state.engine, autoflush=False, autocommit=False)
    return Session()


def set_cron_store(store: CronJobStore) -> None:
    """注入 cron 存储层实例。"""
    global cron_store
    cron_store = store


def set_cron_engine(engine: CronEngine) -> None:
    """注入 cron 调度引擎实例。"""
    global cron_engine
    cron_engine = engine


def set_session_manager(manager) -> None:
    """注入运行时 session manager。"""
    global session_manager
    session_manager = manager


# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #

def _job_to_response(job, *, is_running: bool = False) -> CronJobResponse:
    """把内部任务对象转换成 API 响应结构。"""
    return CronJobResponse(
        id=job.id,
        kind=job.kind,
        agent_session_id=job.agent_session_id,
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
async def list_cron_jobs(
    request: Request,
    agent_name: Optional[str] = None,
    workspace_id: int | None = None,
):
    """查询任务列表，可按 agent_name 或 workspace_id 过滤。"""
    if cron_store is None:
        raise HTTPException(status_code=500, detail="Cron store not initialized")
    if workspace_id is not None:
        db = _build_request_session(request)
        try:
            workspace = get_workspace(db, workspace_id)
            if workspace is None:
                raise HTTPException(status_code=404, detail="Workspace not found")
            workspace_sessions = list_workspace_agent_sessions_by_workspace_id(db, workspace_id)
        finally:
            db.close()
        # workspace 视角下，先找出工作区里的 AgentSession，再反查关联任务。
        jobs = await cron_store.list_jobs_by_agent_session_ids([session.id for session in workspace_sessions])
        if agent_name is not None:
            jobs = [job for job in jobs if job.agent_name == agent_name]
    else:
        jobs = await cron_store.list_jobs(agent_name)
    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return [_job_to_response(j, is_running=j.id in running_job_ids) for j in jobs]


@router.post("/api/runtime/cron/jobs", response_model=CronJobResponse)
async def create_cron_job(request: CronJobCreate, http_request: Request):
    """
    创建一条定时任务。

    这里会解析运行目标、创建唯一 thread_id，并准备对应的 session 元数据。
    """
    if cron_store is None or cron_engine is None or session_manager is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    db = _build_request_session(http_request)
    # 1. 解析真实执行对象，并校验 cron 表达式。
    try:
        resolved_agent_name, default_working_dir, resolved_agent_session_id = resolve_cron_agent(
            request.kind, request.agent_session_id, db=db
        )
        cron_engine.validate_schedule(request.schedule)
    except ValueError as exc:
        db.close()
        raise HTTPException(status_code=400, detail=str(exc))
    db.close()

    working_dir = default_working_dir

    # 2. 为这条任务生成独立的唯一 thread_id。
    thread_id = generate_cron_thread_id(
        request.kind, request.name, request.agent_session_id
    )

    # 3. 确保这条 cron thread 对应的 session 元数据存在。
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

    # 4. 落库保存任务定义。
    job = await cron_store.create_job(
        kind=request.kind,
        agent_session_id=resolved_agent_session_id,
        agent_name=resolved_agent_name,
        name=request.name,
        schedule=request.schedule,
        prompt=request.prompt,
        thread_id=thread_id,
        working_dir=working_dir,
    )

    # 5. 注册到运行中的调度器。
    await cron_engine.add_and_schedule(job)

    return _job_to_response(job, is_running=False)


@router.get("/api/runtime/cron/jobs/{job_id}", response_model=CronJobResponse)
async def get_cron_job(job_id: int):
    """按 id 查询单个任务。"""
    if cron_store is None:
        raise HTTPException(status_code=500, detail="Cron store not initialized")
    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")
    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return _job_to_response(job, is_running=job_id in running_job_ids)


@router.patch("/api/runtime/cron/jobs/{job_id}", response_model=CronJobResponse)
async def update_cron_job(job_id: int, request: CronJobUpdate, http_request: Request):
    """局部更新任务配置。"""
    if cron_store is None or cron_engine is None or session_manager is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    if request.schedule is not None:
        try:
            cron_engine.validate_schedule(request.schedule)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    db = _build_request_session(http_request)
    try:
        if job.kind == AgentKind.AGENT_SESSION and job.agent_session_id is not None:
            # AgentSession 任务更新时，重新解析最新运行目录。
            resolved_agent_name, default_working_dir, _ = resolve_cron_agent(
                job.kind,
                job.agent_session_id,
                db=db,
            )
            resolved_working_dir = default_working_dir
        else:
            resolved_agent_name = job.agent_name
            resolved_working_dir = job.working_dir
    except ValueError as exc:
        db.close()
        raise HTTPException(status_code=400, detail=str(exc))
    db.close()

    updated = await cron_store.update_job(
        job_id,
        name=request.name,
        schedule=request.schedule,
        prompt=request.prompt,
        enabled=request.enabled,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    # 同步刷新 cron thread 的展示名称和运行元数据。
    await session_manager.update_session_metadata(
        updated.thread_id,
        agent_name=resolved_agent_name,
        working_dir=resolved_working_dir,
        name=f"[定时] {updated.name}",
        history_turn_limit=20,
    )

    schedule_changed = request.schedule is not None and request.schedule != job.schedule
    enabled_changed = request.enabled is not None and request.enabled != job.enabled

    # 只有调度相关字段变化时，才需要同步调整 APScheduler 触发器。
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
    """删除任务定义，并移除后续调度触发器。"""
    if cron_store is None or cron_engine is None or session_manager is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    # 删除任务时，同时清理这条 cron thread 对应的 session 与历史数据。
    await cron_engine.unschedule(job_id)
    await session_manager.delete_session(job.thread_id)
    deleted = await cron_store.delete_job(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cron job not found")

    return {"message": "Cron job deleted"}


@router.post("/api/runtime/cron/jobs/{job_id}/run", status_code=status.HTTP_202_ACCEPTED)
async def run_cron_job(job_id: int):
    """手动触发一次后台执行，立即返回 202。"""
    if cron_store is None or cron_engine is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    # 手动执行走后台任务，不要求 enabled=True。
    accepted = cron_engine.trigger_run_now(job_id)
    if not accepted:
        raise HTTPException(status_code=409, detail="Cron job is already running")
    return {"message": "Job triggered", "job_id": job_id}


@router.post("/api/runtime/cron/jobs/{job_id}/toggle", response_model=CronJobResponse)
async def toggle_cron_job(job_id: int):
    """切换任务启用状态，并同步调度器。"""
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
async def list_cron_history(request: Request, kind: AgentKind, agent_session_id: int | None = None):
    """查询某个作用域下的任务历史摘要列表。"""
    if cron_store is None or session_manager is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    db = _build_request_session(request)
    try:
        resolved_agent_name, _, resolved_agent_session_id = resolve_cron_agent(kind, agent_session_id, db=db)
    except ValueError as exc:
        db.close()
        raise HTTPException(status_code=400, detail=str(exc))
    db.close()

    if kind == AgentKind.AGENT_SESSION:
        if resolved_agent_session_id is None:
            raise HTTPException(status_code=400, detail="agent_session_id is required")
        # AgentSession 作用域按 agent_session_id 取任务。
        jobs = await cron_store.list_jobs_by_agent_session_id(resolved_agent_session_id)
    else:
        # MOSS 作用域按 agent_name 聚合任务。
        jobs = await cron_store.list_jobs(agent_name=resolved_agent_name)
    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return await build_agent_history_list(jobs, session_manager, running_job_ids)


@router.get("/api/runtime/cron/history/jobs/{job_id}", response_model=CronHistoryJobDetail)
async def get_cron_history_job_detail(
    request: Request,
    job_id: int,
    kind: AgentKind | None = None,
    agent_session_id: int | None = None,
    group_limit: int = 20,
    before_cursor: int | None = None,
):
    """
    查询单个任务的执行历史详情，并按 group_id 聚合。

    传入 kind 时，会额外校验任务是否属于该作用域。
    """
    if cron_store is None or session_manager is None:
        raise HTTPException(status_code=500, detail="Cron system not initialized")

    job = await cron_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Cron job not found")

    # 作用域校验，避免跨 agent / session 读取到别的任务历史。
    if kind is not None:
        db = _build_request_session(request)
        try:
            expected_agent_name, _, expected_agent_session_id = resolve_cron_agent(kind, agent_session_id, db=db)
        except ValueError as exc:
            db.close()
            raise HTTPException(status_code=400, detail=str(exc))
        db.close()
        if kind == AgentKind.AGENT_SESSION:
            if job.agent_session_id != expected_agent_session_id:
                raise HTTPException(
                    status_code=403,
                    detail="Cron job does not belong to the requested agent scope",
                )
        elif job.agent_name != expected_agent_name:
            raise HTTPException(
                status_code=403,
                detail="Cron job does not belong to the requested agent scope",
            )

    # 限制单次最多回看 100 组执行历史。
    group_limit = max(1, min(group_limit, 100))

    events, group_ids, next_cursor = await session_manager.list_session_events_by_groups(
        job.thread_id,
        limit_groups=group_limit,
        before_cursor=before_cursor,
    )

    running_job_ids = cron_engine.running_job_ids if cron_engine is not None else set()
    return build_job_history_detail(job, events, group_ids, next_cursor, running_job_ids)
