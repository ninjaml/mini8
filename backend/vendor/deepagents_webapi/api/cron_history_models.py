"""定时任务历史页的只读响应结构。"""

from typing import List, Optional

from pydantic import BaseModel

from deepagents_webapi.api.models import ReplayTraceGroup


class CronHistoryEvent(BaseModel):
    """一次执行过程中的单条事件。"""

    # 事件类型，来自 session_events.event_type。
    type: str
    # 事件正文。
    content: str
    # 事件附带的原始元数据；具体 key 取决于 type。
    metadata: dict
    # 事件写入历史表的时间。
    created_at: str


class CronHistoryGroup(BaseModel):
    """一次完整执行的聚合结果。"""

    # 同一次运行的事件共用一个 group_id。
    group_id: str
    # 这组事件中第一条记录的时间。
    started_at: str
    # 历史服务根据事件内容推断出的状态。
    status: str
    # 展示用耗时，优先取任务表记录，否则取首尾事件时间差。
    duration_ms: Optional[int]
    # 给列表展示的简短摘要。
    summary: Optional[str]
    # 最终结果文本；优先取 assistant，其次 error，再退化到最后一条事件。
    final_answer: Optional[str]
    # 这次运行的事件明细。
    events: List[CronHistoryEvent]
    # 与普通聊天统一的 grouped replay 结构；有值时前端可直接投影出子Agent卡片。
    replay_group: Optional[ReplayTraceGroup] = None


class CronHistoryJobSummary(BaseModel):
    """历史页左侧任务摘要卡片。"""

    job_id: int
    thread_id: str
    # 任务名称。
    name: str
    # cron 表达式。
    schedule: str
    # 是否启用自动调度。
    enabled: bool
    # 最近一次执行时间。
    last_run_at: Optional[str]
    # 最近一次执行状态。
    last_status: Optional[str]
    # 最近一次执行耗时。
    last_duration_ms: Optional[int]
    # 成功执行次数累计。
    run_count: int
    # 最近一次历史结果的摘要，来自最新执行组快照。
    last_result_summary: Optional[str]
    # 最近一次结果摘要对应的事件时间。
    last_result_created_at: Optional[str]
    # 当前是否正在执行；该字段不落库。
    is_running: bool = False


class CronHistoryJobDetail(BaseModel):
    """历史页右侧单任务详情结构。"""

    job_id: int
    thread_id: str
    # 当前已加载范围内最新的一次执行组。
    latest_group: Optional[CronHistoryGroup]
    # 当前已加载到的执行组列表。
    groups: List[CronHistoryGroup]
    # 继续向更早历史翻页时使用的游标。
    next_cursor: Optional[int]


class CronHistoryListResponse(BaseModel):
    """历史概览接口的响应结构。"""

    jobs: List[CronHistoryJobSummary]
    # 前端首次进入历史页时默认选中的任务。
    default_job_id: Optional[int]
