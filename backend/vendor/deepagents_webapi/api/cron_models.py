"""定时任务相关 API 模型。"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class AgentKind(str, Enum):
    """定时任务绑定的执行对象类型。"""

    MOSS = "moss"
    AGENT_SESSION = "agent_session"


@dataclass
class CronJob:
    """后端内部使用的定时任务对象，基本对应 ``cron_jobs`` 表的一行。"""

    id: int
    kind: AgentKind
    # 任务绑定的业务会话；MOSS 任务为空。
    agent_session_id: Optional[int]
    # 真正执行时使用的 agent 标识，例如 ``moss`` / ``agent-12``。
    agent_name: str
    # 任务名称。
    name: str
    # 5 段 cron 表达式。
    schedule: str
    # 每次触发时发给 agent 的指令。
    prompt: str
    # 该任务自己的执行线程标识，用于历史回放。
    thread_id: str
    # 当前任务运行时使用的工作目录。
    working_dir: Optional[str]
    # 是否参与自动调度；不影响手动触发。
    enabled: bool
    # 任务记录创建时间。
    created_at: datetime
    # 任务记录最近更新时间，包含配置和执行状态回写。
    updated_at: datetime
    # 最近一次执行记录时间。
    last_run_at: Optional[datetime]
    # 最近一次执行状态，例如 success / error / skipped。
    last_status: Optional[str]
    # 最近一次失败时的错误摘要。
    last_error: Optional[str]
    # 最近一次执行耗时，单位毫秒。
    last_duration_ms: Optional[int]
    # 累计成功执行次数。
    run_count: int


class CronJobCreate(BaseModel):
    """创建定时任务的请求体。"""

    kind: AgentKind
    agent_session_id: Optional[int] = None
    name: str
    schedule: str
    prompt: str


class CronJobUpdate(BaseModel):
    """更新定时任务的请求体，只允许修改任务自身属性。"""

    name: Optional[str] = None
    schedule: Optional[str] = None
    prompt: Optional[str] = None
    enabled: Optional[bool] = None


class CronJobResponse(BaseModel):
    """定时任务详情/列表的统一响应结构。"""

    id: int
    kind: AgentKind
    agent_session_id: Optional[int]
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
    # 是否正在执行；该字段不落库。
    is_running: bool = False
