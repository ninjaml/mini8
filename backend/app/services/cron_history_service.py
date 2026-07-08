"""定时任务历史聚合服务。"""

from datetime import datetime, timezone
from typing import Any

from app.repositories.cron_job import CronJob
from app.services.runtime_replay_trace_service import build_replay_trace
from deepagents_webapi.api.cron_history_models import (
    CronHistoryEvent,
    CronHistoryGroup,
    CronHistoryJobDetail,
    CronHistoryJobSummary,
    CronHistoryListResponse,
)
from deepagents_webapi.api.models import ReplayTraceBranchNode, ReplayTraceEvent, ReplayTraceGroup, ReplayTraceInstance


_MAX_SUMMARY_LEN = 120


def _build_replay_group_response(group: dict | None) -> ReplayTraceGroup | None:
    if not group:
        return None
    return ReplayTraceGroup(
        group_id=group["group_id"],
        root_events=[ReplayTraceEvent(**event) for event in group["root_events"]],
        invocations=[
            ReplayTraceInstance(
                subagent_invocation_id=invocation["subagent_invocation_id"],
                subagent_type=invocation.get("subagent_type"),
                description=invocation.get("description"),
                # cron 历史这里沿用普通 grouped replay 的 invocation 锚点语义：
                # 只暴露长期 child thread 身份，不额外承诺独立 child 会话历史。
                child_thread_id=invocation.get("child_thread_id"),
                namespace_key=invocation.get("namespace_key"),
                events=[ReplayTraceEvent(**event) for event in invocation.get("events", [])],
                first_event_id=invocation.get("first_event_id"),
                last_event_id=invocation.get("last_event_id"),
                started_at=invocation.get("started_at"),
                finished_at=invocation.get("finished_at"),
                status=invocation.get("status"),
                preview=invocation.get("preview"),
                branch_tree=ReplayTraceBranchNode(**invocation["branch_tree"]),
            )
            for invocation in group.get("invocations", [])
        ],
    )


def _truncate(text: str | None, max_len: int = _MAX_SUMMARY_LEN) -> str | None:
    """把展示摘要截断到固定长度。"""
    if not text:
        return None
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def _build_group_card(
    group_events: list[dict[str, Any]],
    job: CronJob | None = None,
    *,
    is_latest: bool = False,
    is_running: bool = False,
) -> CronHistoryGroup:
    """
    把同一组执行事件聚合成一张历史卡片。

    ``group_events`` 需要是同一个 group_id 下、按事件时间顺序排列的记录。
    """
    group_id = group_events[0]["group_id"]
    started_at = group_events[0]["created_at"]

    def is_error_event(event: dict[str, Any]) -> bool:
        metadata = event.get("metadata") or {}
        return event["type"] == "error" or metadata.get("status") == "error"

    # 状态由事件内容和当前运行态共同推断，不直接取数据库字段。
    has_error = any(is_error_event(e) for e in group_events)
    has_assistant = any(e["type"] == "assistant" for e in group_events)
    if is_running and is_latest:
        status = "running"
    elif has_error:
        status = "error"
    elif has_assistant:
        status = "success"
    else:
        status = "unknown"

    # 耗时优先使用任务表里最近一次执行的统计值，避免重新估算。
    duration_ms: int | None = None
    if is_latest and job and job.last_duration_ms is not None:
        # 只有确认这组事件确实对应最近一次执行时，才使用任务表里的耗时。
        try:
            group_started = datetime.fromisoformat(group_events[0]["created_at"])
            job_last_run = job.last_run_at
            if job_last_run and abs((group_started - job_last_run).total_seconds()) < 60:
                duration_ms = job.last_duration_ms
        except Exception:
            pass

    if duration_ms is None:
        try:
            min_ts = datetime.fromisoformat(group_events[0]["created_at"])
            max_ts = datetime.fromisoformat(group_events[-1]["created_at"])
            duration_ms = int((max_ts - min_ts).total_seconds() * 1000)
        except Exception:
            duration_ms = None

    # 最终结果优先取最后一个 assistant 事件，再回退到 error 或最后一条事件。
    final_answer: str | None = None
    for e in reversed(group_events):
        if e["type"] == "assistant":
            final_answer = e["content"]
            break
    if not final_answer:
        for e in reversed(group_events):
            if is_error_event(e):
                final_answer = e["content"]
                break
    if not final_answer:
        final_answer = group_events[-1]["content"] if group_events else None

    summary = _truncate(final_answer)

    events = [
        CronHistoryEvent(
            type=e["type"],
            content=e["content"],
            metadata=e.get("metadata", {}),
            created_at=e["created_at"],
        )
        for e in group_events
    ]

    return CronHistoryGroup(
        group_id=group_id,
        started_at=started_at,
        status=status,
        duration_ms=duration_ms,
        summary=summary,
        final_answer=final_answer,
        events=events,
    )


def build_job_history_summary(
    job: CronJob,
    snapshot: dict[str, Any] | None,
    is_running: bool = False,
) -> CronHistoryJobSummary:
    """组装历史页左侧单任务摘要卡片。"""
    last_result_summary: str | None = None
    last_result_created_at: str | None = None

    if snapshot:
        # 摘要来自最新执行组快照，不直接取 cron_jobs.last_error 等字段。
        content = snapshot.get("content")
        if content:
            last_result_summary = _truncate(content)
        last_result_created_at = snapshot.get("created_at")

    return CronHistoryJobSummary(
        job_id=job.id,
        thread_id=job.thread_id,
        name=job.name,
        schedule=job.schedule,
        enabled=job.enabled,
        last_run_at=job.last_run_at.replace(tzinfo=timezone.utc).isoformat() if job.last_run_at else None,
        last_status=job.last_status,
        last_duration_ms=job.last_duration_ms,
        run_count=job.run_count,
        last_result_summary=last_result_summary,
        last_result_created_at=last_result_created_at,
        is_running=is_running,
    )


def build_job_history_detail(
    job: CronJob,
    events: list[dict[str, Any]],
    group_ids_in_order: list[str],
    next_cursor: int | None,
    running_job_ids: set[int] | None = None,
) -> CronHistoryJobDetail:
    """组装历史页右侧单任务详情。"""
    is_running = job.id in (running_job_ids or set())
    # 先按 group_id 重建分组，同时保留上游给定的显示顺序。
    events_by_group: dict[str, list[dict[str, Any]]] = {}
    for e in events:
        gid = e["group_id"]
        events_by_group.setdefault(gid, []).append(e)

    # cron 历史详情现在和普通聊天共用 grouped replay 语义，
    # 这样历史卡片能直接拿到 root_events + invocations，不必再靠前端二次拼装。
    replay_groups_by_id = {
        group["group_id"]: group
        for group in build_replay_trace(events, group_ids_in_order)
    }

    # 用最大事件 id 所在的组，作为当前结果集里的最新执行组。
    global_latest_gid = None
    if events:
        global_latest_gid = max(events, key=lambda e: e["id"])["group_id"]

    groups: list[CronHistoryGroup] = []
    for gid in group_ids_in_order:
        group_events = events_by_group.get(gid, [])
        if not group_events:
            continue
        card = _build_group_card(
            group_events,
            job=job,
            is_latest=(gid == global_latest_gid),
            is_running=is_running,
        )
        card.replay_group = _build_replay_group_response(replay_groups_by_id.get(gid))
        groups.append(card)

    latest_group = next(
        (g for g in groups if g.group_id == global_latest_gid), groups[0] if groups else None
    )

    return CronHistoryJobDetail(
        job_id=job.id,
        thread_id=job.thread_id,
        latest_group=latest_group,
        groups=groups,
        next_cursor=next_cursor,
    )


async def build_agent_history_list(
    jobs: list[CronJob],
    session_manager: Any,
    running_job_ids: set[int] | None = None,
) -> CronHistoryListResponse:
    """组装某个作用域下的历史任务列表响应。"""
    summaries: list[CronHistoryJobSummary] = []
    default_job_id: int | None = None
    running_ids = running_job_ids or set()

    for job in jobs:
        # 每个任务只取最新执行组快照，供左侧列表展示摘要。
        snapshot = await session_manager.get_latest_group_snapshot(job.thread_id)
        summary = build_job_history_summary(job, snapshot, is_running=job.id in running_ids)
        summaries.append(summary)

    if summaries:
        # 前端首次进入历史页时，默认选中第一条任务。
        default_job_id = summaries[0].job_id

    return CronHistoryListResponse(
        jobs=summaries,
        default_job_id=default_job_id,
    )
