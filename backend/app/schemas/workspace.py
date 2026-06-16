"""
工作空间（Workspace）相关的 Pydantic 模式定义。

本模块定义了工作空间的创建、读取以及仪表盘数据展示等数据模型，
用于 API 请求/响应的校验与序列化。
"""

from pydantic import BaseModel


class WorkspaceCreate(BaseModel):
    """工作空间创建请求模型。

    Attributes:
        user_id: 所属用户 ID，可选。
        name: 工作空间名称（必填）。
        goal: 工作空间目标描述，可选。
        super_agent_nick_name: 超级智能体昵称，默认为 "项目经理"。
    """

    user_id: str | None = None
    name: str
    goal: str | None = None
    super_agent_nick_name: str | None = "项目经理"


class WorkspaceUpdate(BaseModel):
    """工作空间更新请求模型。

    Attributes:
        name: 工作空间名称，可选。
        goal: 工作空间目标描述，可选。
    """

    name: str | None = None
    goal: str | None = None


class WorkspaceRead(BaseModel):
    """工作空间读取响应模型。

    Attributes:
        id: 工作空间唯一标识。
        user_id: 所属用户 ID。
        name: 工作空间名称。
        goal: 工作空间目标描述。
        super_agent_nick_name: 超级智能体昵称。
        created_at: 创建时间戳（毫秒级）。
    """

    id: int
    user_id: str | None = None
    name: str | None = None
    goal: str | None = None
    super_agent_nick_name: str | None = "项目经理"
    super_agent_working_dir: str | None = None
    created_at: int | None = None

    model_config = {"from_attributes": True}


class WorkspaceDashboard(BaseModel):
    """工作空间仪表盘数据模型。

    用于汇总展示指定工作空间下的核心统计信息。

    Attributes:
        project_manager: 项目经理（超级智能体）信息字典。
        agent_count: 智能体数量。
        item_count: 工作项数量。
        todo_count: 待办/待审数量。
        knowledge_count: 知识库数量。
        result_count: 成果/历史记录数量。
    """

    project_manager: dict
    agent_count: int
    item_count: int
    todo_count: int
    knowledge_count: int
    result_count: int
