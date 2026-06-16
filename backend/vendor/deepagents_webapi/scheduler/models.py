"""Cron job data models and Pydantic schemas."""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class AgentKind(str, Enum):
    """Supported agent kinds for cron jobs."""

    MOSS = "moss"
    SUPERAGENT = "workspace_superagent"
    WORKAGENT = "workagent"


@dataclass
class CronJob:
    """Internal dataclass representing a cron job row."""

    id: int
    kind: AgentKind
    target_id: Optional[int]
    agent_name: str
    name: str
    schedule: str
    prompt: str
    thread_id: str
    working_dir: Optional[str]
    enabled: bool
    created_at: datetime
    updated_at: datetime
    last_run_at: Optional[datetime]
    last_status: Optional[str]
    last_error: Optional[str]
    last_duration_ms: Optional[int]
    run_count: int


class CronJobCreate(BaseModel):
    """Request schema for creating a cron job."""

    kind: AgentKind
    target_id: Optional[int] = None
    name: str
    schedule: str
    prompt: str
    working_dir: Optional[str] = None


class CronJobUpdate(BaseModel):
    """Request schema for updating a cron job."""

    name: Optional[str] = None
    schedule: Optional[str] = None
    prompt: Optional[str] = None
    enabled: Optional[bool] = None
    working_dir: Optional[str] = None


class CronJobResponse(BaseModel):
    """Response schema for a cron job."""

    id: int
    kind: AgentKind
    target_id: Optional[int]
    agent_name: str
    name: str
    schedule: str
    prompt: str
    thread_id: str
    working_dir: Optional[str]
    enabled: bool
    created_at: str
    updated_at: str
    last_run_at: Optional[str]
    last_status: Optional[str]
    last_error: Optional[str]
    last_duration_ms: Optional[int]
    run_count: int
    is_running: bool = False