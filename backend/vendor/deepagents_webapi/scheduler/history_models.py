"""Pydantic schemas for cron history read-only aggregation."""

from typing import List, Optional

from pydantic import BaseModel


class CronHistoryEvent(BaseModel):
    """A single event within a cron execution group."""

    type: str
    content: str
    metadata: dict
    created_at: str


class CronHistoryGroup(BaseModel):
    """An execution group (one run) of a cron job."""

    group_id: str
    started_at: str
    status: str
    duration_ms: Optional[int]
    summary: Optional[str]
    final_answer: Optional[str]
    events: List[CronHistoryEvent]


class CronHistoryJobSummary(BaseModel):
    """Left-panel task card structure."""

    job_id: int
    thread_id: str
    name: str
    schedule: str
    enabled: bool
    last_run_at: Optional[str]
    last_status: Optional[str]
    last_duration_ms: Optional[int]
    run_count: int
    last_result_summary: Optional[str]
    last_result_created_at: Optional[str]
    is_running: bool = False


class CronHistoryJobDetail(BaseModel):
    """Right-panel detail for a selected job."""

    job_id: int
    thread_id: str
    latest_group: Optional[CronHistoryGroup]
    groups: List[CronHistoryGroup]
    next_cursor: Optional[int]


class CronHistoryListResponse(BaseModel):
    """Response for the history list endpoint."""

    jobs: List[CronHistoryJobSummary]
    default_job_id: Optional[int]