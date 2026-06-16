"""
工作项（WorkItem）相关的 Pydantic 模式定义。

本模块定义了工作项的创建、更新、读取以及智能体绑定等数据模型，
用于 API 请求/响应的校验与序列化。
"""

from pydantic import BaseModel


class WorkItemCreate(BaseModel):
    """工作项创建请求模型。

    Attributes:
        user_id: 所属用户 ID，可选。
        work_space_id: 所属工作空间 ID（必填）。
        name: 工作项名称（必填）。
        description: 工作项描述，可选。
        work_requirement: 工作需求说明，可选。
        delivery_requirement: 交付要求说明，可选。
        need_superagent_review: 是否需要超级智能体审核，可选。
        need_superone_review: 是否需要超级用户/负责人审核，可选。
        allow_auto_complete: 是否允许自动完成，可选。
    """

    user_id: str | None = None
    work_space_id: int
    name: str
    description: str | None = None
    work_requirement: str | None = None
    delivery_requirement: str | None = None
    need_superagent_review: bool | None = None
    need_superone_review: bool | None = None
    allow_auto_complete: bool | None = None


class WorkItemUpdate(BaseModel):
    """工作项更新请求模型。

    所有字段均为可选，仅更新传入的字段。

    Attributes:
        name: 工作项名称。
        description: 工作项描述。
        work_requirement: 工作需求说明。
        delivery_requirement: 交付要求说明。
        need_superagent_review: 是否需要超级智能体审核。
        need_superone_review: 是否需要超级用户/负责人审核。
        allow_auto_complete: 是否允许自动完成。
    """

    name: str | None = None
    description: str | None = None
    work_requirement: str | None = None
    delivery_requirement: str | None = None
    need_superagent_review: bool | None = None
    need_superone_review: bool | None = None
    allow_auto_complete: bool | None = None


class WorkItemRead(BaseModel):
    """工作项读取响应模型。

    Attributes:
        id: 工作项唯一标识。
        user_id: 所属用户 ID。
        work_space_id: 所属工作空间 ID。
        name: 工作项名称。
        description: 工作项描述。
        work_requirement: 工作需求说明。
        delivery_requirement: 交付要求说明。
        need_superagent_review: 是否需要超级智能体审核。
        need_superone_review: 是否需要超级用户/负责人审核。
        allow_auto_complete: 是否允许自动完成。
        created_at: 创建时间戳（毫秒级）。
        current_status: 当前状态。
        agent_id: 绑定的智能体 ID。
    """

    id: int
    user_id: str | None = None
    work_space_id: int | None = None
    name: str | None = None
    description: str | None = None
    work_requirement: str | None = None
    delivery_requirement: str | None = None
    need_superagent_review: bool | None = None
    need_superone_review: bool | None = None
    allow_auto_complete: bool | None = None
    created_at: int | None = None
    current_status: str | None = None
    agent_id: int | None = None

    model_config = {"from_attributes": True}


class AgentWorkBind(BaseModel):
    """智能体与工作项绑定请求模型。

    Attributes:
        agent_id: 要绑定的智能体 ID；若为 None，则表示解绑。
    """

    agent_id: int | None = None
