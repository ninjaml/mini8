"""Workspace 群聊消息模型。

这张表保存的是工作空间维度“对用户和 Agent 可见”的消息历史，
不是底层 runtime session 的完整事件流。

从当前调用链可以确认：
- public API 第一阶段只允许写入 `human` 消息
- 当 human 消息携带 `request_id` 时，它当前直接表示目标 `AgentSession.id`
- 对应 Agent 执行完成后，会再回填一条 `agent` 消息
- `thread_id` / `group_id` 只是回溯内部执行链的关联信息，不是群聊主键
"""

from sqlalchemy import BigInteger, Column, Integer, Text, VARCHAR

from app.core.database import Base


class WorkspaceMessage(Base):
    """Workspace 群聊可见消息主记录。"""

    __tablename__ = "workspace_message"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    workspace_id = Column(Integer, nullable=False, index=True)  # 所属 workspace ID。
    type = Column(VARCHAR(32), nullable=False)  # 当前代码只读取 `human` 和 `agent` 两类消息。
    content = Column(Text, nullable=False)  # 群聊最终可见的正文内容。
    created_at = Column(BigInteger, nullable=False)  # 创建时间，毫秒时间戳。
    request_id = Column(Integer, nullable=True)  # 对 human 消息，当前直接表示被 @ 的目标 AgentSession.id。
    agent_session_id = Column(Integer, nullable=True)  # 对 agent 消息，表示产出这条回复的稳定 AgentSession.id。
    agent_id = Column(Integer, nullable=True)  # 对 agent 消息，表示对应 Agent 主记录 ID。
    agent_name_snapshot = Column(VARCHAR(255), nullable=True)  # 生成消息时刻的 Agent 名称快照。
    thread_id = Column(VARCHAR(255), nullable=True)  # 关联的 runtime thread 标识；可通过 agent_session_id 间接查到，这里冗余保存以便直接回溯执行链。
    group_id = Column(VARCHAR(255), nullable=True)  # 关联的 runtime 分组标识，便于按执行批次回看事件。
