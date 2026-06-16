"""Cron history aggregation service.

Assembles ``cron_jobs + session_events`` into UI-ready read-only structures.
No new tables; no writes.
"""

from datetime import datetime, timezone
from itertools import groupby
from typing import Any, List, Optional

from deepagents_webapi.scheduler.history_models import (
    CronHistoryEvent,
    CronHistoryGroup,
    CronHistoryJobDetail,
    CronHistoryJobSummary,
    CronHistoryListResponse,
)
from deepagents_webapi.scheduler.models import AgentKind, CronJob


_MAX_SUMMARY_LEN = 120


def _truncate(text: str | None, max_len: int = _MAX_SUMMARY_LEN) -> str | None:
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
    """Build a single execution group card from flat events.

    Args:
        group_events: events for one group_id, ordered by id ASC.
        job: optional CronJob for duration_ms fallback.
        is_latest: whether this is the most-recent group.
    """
    group_id = group_events[0]["group_id"]
    started_at = group_events[0]["created_at"]

    # Status inference
    has_error = any(e["type"] == "error" for e in group_events)
    has_assistant = any(e["type"] == "assistant" for e in group_events)
    if has_error:
        status = "error"
    elif has_assistant:
        status = "success"
    elif is_running and is_latest:
        status = "running"
    else:
        status = "unknown"

    # Duration
    duration_ms: int | None = None
    if is_latest and job and job.last_duration_ms is not None:
        # Verify this group actually corresponds to the most recent run
        # before using the stored duration (avoids mis-match on paginated pages).
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

    # Final answer: last assistant, fallback last error, fallback last event content
    final_answer: str | None = None
    for e in reversed(group_events):
        if e["type"] == "assistant":
            final_answer = e["content"]
            break
    if not final_answer:
        for e in reversed(group_events):
            if e["type"] == "error":
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
    """Build left-panel card for a single job."""
    last_result_summary: str | None = None
    last_result_created_at: str | None = None

    if snapshot:
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
    """Build right-panel detail for a single job."""
    is_running = job.id in (running_job_ids or set())
    # Group events by group_id preserving the order from group_ids_in_order
    events_by_group: dict[str, list[dict[str, Any]]] = {}
    for e in events:
        gid = e["group_id"]
        events_by_group.setdefault(gid, []).append(e)

    # Determine the globally latest group via the highest event id
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
    kind: AgentKind,
    target_id: int | None,
    jobs: list[CronJob],
    session_manager: Any,
    running_job_ids: set[int] | None = None,
) -> CronHistoryListResponse:
    """Build the full history list response for an agent scope."""
    summaries: list[CronHistoryJobSummary] = []
    default_job_id: int | None = None
    running_ids = running_job_ids or set()

    for job in jobs:
        snapshot = await session_manager.get_latest_group_snapshot(job.thread_id)
        summary = build_job_history_summary(job, snapshot, is_running=job.id in running_ids)
        summaries.append(summary)

    if summaries:
        default_job_id = summaries[0].job_id

    return CronHistoryListResponse(
        jobs=summaries,
        default_job_id=default_job_id,
    )