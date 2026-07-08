"""Workspace 群聊消息的请求/响应模型。

这层 schema 服务的是“工作空间可见聊天记录”，不是 deepagents runtime 的内部事件流。

当前调用链：
1. 前端通过 ``POST /workspaces/{workspace_id}/messages`` 写入一条 human 消息。
2. 若 human 消息带 ``request_id``，后端会把它当成目标 ``AgentSession.id``，
   触发对应 workspace agent 的一次 headless 执行。
3. 执行完成后，后端再补写一条 agent 消息作为群聊里的可见回复。

因此这里的 ``thread_id`` / ``group_id`` 只是回溯内部执行链的关联信息，
不应误解为 workspace 群聊本身的主键或分页游标。
"""

from typing import Literal

from pydantic import BaseModel, model_validator


class WorkspaceMessageCreate(BaseModel):
    """创建 workspace 群聊消息的请求体。

    使用方：
    - ``POST /workspaces/{workspace_id}/messages``

    当前 public API 只允许客户端提交 ``human`` 消息。
    Agent 侧消息由后端在执行完成后自动回填，因此客户端不能主动传入
    ``agent_session_id / agent_id / thread_id / group_id`` 这类运行时字段。
    """
    type: Literal["human"]
    # 用户在 workspace 群聊里输入的原始文本；保存前会在路由层做 strip。
    content: str
    # 当前阶段若不为空，直接表示用户显式指定的目标 AgentSession.id。
    # 该值会在 _run_workspace_agent_and_fillback() 中被取出，用来定位要执行的 workspace session。
    request_id: int | None = None
    # 以下字段属于 agent 回填消息时才会出现的运行时关联信息；
    # public API 不允许客户端主动声明。
    agent_session_id: int | None = None
    agent_id: int | None = None
    agent_name_snapshot: str | None = None
    thread_id: str | None = None
    group_id: str | None = None

    @model_validator(mode="after")
    def validate_payload(self):
        """限制 public API 只能写入用户可声明的字段。"""
        if not self.content.strip():
            raise ValueError("content is required")

        forbidden_fields = {
            "agent_session_id": self.agent_session_id,
            "agent_id": self.agent_id,
            "agent_name_snapshot": self.agent_name_snapshot,
            "thread_id": self.thread_id,
            "group_id": self.group_id,
        }
        present = [name for name, value in forbidden_fields.items() if value not in (None, "")]
        if present:
            raise ValueError(f"human message cannot carry runtime-only fields: {', '.join(present)}")
        return self


class WorkspaceMessageRead(BaseModel):
    """workspace 群聊消息的读取模型。

    使用方：
    - ``GET /workspaces/{workspace_id}/messages``
    - ``POST /workspaces/{workspace_id}/messages`` 的返回体

    字段语义：
    - ``request_id``: 对 human 消息，当前表示用户显式指定的目标 ``AgentSession.id``。
    - ``agent_session_id`` / ``agent_id``: 对 agent 消息，标识是哪一个 Agent 会话产出了这条回复。
    - ``agent_name_snapshot``: 生成消息时刻的名字快照，便于历史展示；不要把它当成稳定主键。
    - ``thread_id`` / ``group_id``: 仅用于回溯内部执行链，与 workspace 群聊主语不是一回事。
    """
    # workspace_message 表主键；消息列表分页的 before 参数也是基于它工作的。
    id: int
    # 这条可见消息所属的 workspace。
    workspace_id: int
    # 当前代码路径只会产生 human 和 agent 两类消息。
    type: Literal["human", "agent"]
    # 群聊里最终展示给用户/Agent 的正文，不是底层流式 chunk。
    content: str
    # 仓储层 create_workspace_message() 写入的毫秒时间戳。
    created_at: int
    # 对 human 消息：表示被 @ 的目标 AgentSession.id。
    # 对 agent 消息：当前调用链不会写这个字段，因此通常为 None。
    request_id: int | None = None
    # 对 agent 消息：产出该回复的稳定 AgentSession.id。
    # workspace_message_context_resolver 依赖它区分 [self:...] 和 [other-agent:...]。
    agent_session_id: int | None = None
    # 对 agent 消息：对应 Agent 主记录的主键，便于界面侧继续跳转/关联。
    agent_id: int | None = None
    # 对 agent 消息：生成该回复时的 Agent 名称快照，用于展示。
    # 它不是稳定身份标识，重命名后历史消息不会自动追写。
    agent_name_snapshot: str | None = None
    # 对 agent 消息：此次执行所绑定的 runtime thread_id，来自目标 AgentSession.thread_id。
    # 这是为了便于回溯 deepagents 执行链，不能把它当成 workspace 消息线程主键。
    thread_id: str | None = None
    # 对 agent 消息：最近一次执行批次的 group_id。
    # 优先取 session_manager.get_latest_group_snapshot() 的结果，取不到时退化为 workspace-msg-{human_message.id}。
    group_id: str | None = None

    model_config = {"from_attributes": True}
