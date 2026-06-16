"""
工作空间智能体（WorkspaceAgent）相关的 Pydantic 模式定义。

本模块定义了工作空间内智能体的创建、更新与读取等数据模型，
用于 API 请求/响应的校验与序列化。
"""

from pydantic import BaseModel


class WorkspaceAgentCreate(BaseModel):
    """智能体创建请求模型。

    Attributes:
        user_id: 所属用户 ID，可选。
        work_space_id: 所属工作空间 ID（必填）。
        name: 智能体名称（必填）。
        type: 智能体类型（必填）。
        agent_json: 智能体配置 JSON 字符串，可选。
    """

    user_id: str | None = None
    work_space_id: int
    name: str
    type: str = "mini8"
    agent_json: str | None = None


class WorkspaceAgentUpdate(BaseModel):
    """智能体更新请求模型。

    所有字段均为可选，仅更新传入的字段。

    Attributes:
        name: 智能体名称。
        type: 智能体类型。
        agent_json: 智能体配置 JSON 字符串。
    """

    name: str | None = None
    type: str | None = None
    agent_json: str | None = None


class WorkspaceAgentRead(BaseModel):
    """智能体读取响应模型。

    Attributes:
        id: 智能体唯一标识。
        user_id: 所属用户 ID。
        work_space_id: 所属工作空间 ID。
        name: 智能体名称。
        type: 智能体类型。
        agent_json: 智能体配置 JSON 字符串。
        work_item_ids: 已绑定的工作项 ID 列表，默认为空列表。
    """

    id: int
    user_id: str | None = None
    work_space_id: int | None = None
    name: str | None = None
    type: str | None = None
    agent_json: str | None = None
    working_dir: str | None = None
    work_item_ids: list[int] = []

    model_config = {"from_attributes": True}
