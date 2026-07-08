"""Agent 稳定会话模型。

这个表不是运行时事件流，而是普通业务 Agent 在平台侧的稳定会话主记录。

从当前调用链可以确认：
- 每个 Agent 有且仅有一个 default session
- 每个 Agent 在每个 workspace 下最多有一个 workspace session
- `thread_id` 是 vendor/runtime 层恢复会话的稳定锚点
- `persona_name` 和 `display_name` 都是 session 级真相，不落在 Agent 主表上
- workspace 群聊、runtime 建连、cron 作用域都会直接引用 `agent_session_id`
"""

from sqlalchemy import BigInteger, Column, Index, Integer, UniqueConstraint, VARCHAR, text

from app.core.database import Base


class AgentSession(Base):
    """普通业务 Agent 的稳定会话主记录。"""

    __tablename__ = "agent_session"
    __table_args__ = (
        UniqueConstraint("agent_id", "workspace_id", name="uq_agent_session_agent_workspace"),
        Index(
            "ux_agent_session_default_agent_id",
            "agent_id",
            unique=True,
            sqlite_where=text("session_type = 'default'"),
        ),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(Integer, nullable=False, index=True)  # 所属 Agent 主记录 ID。
    session_type = Column(VARCHAR(32), nullable=False)  # 会话类型：当前代码只使用 `default` 与 `workspace`。
    workspace_id = Column(Integer, nullable=True)  # 当 `session_type=workspace` 时指向所属 workspace；default session 为空。
    thread_id = Column(VARCHAR(255), nullable=False, unique=True)  # 运行时稳定 thread 标识；用于恢复 vendor session。
    persona_name = Column(VARCHAR(255), nullable=True)  # 该会话叠加的人格名称；运行时按它加载 persona 资源。
    display_name = Column(VARCHAR(255), nullable=False)  # 该会话在运行时和前端展示时使用的名称。
    subagent_mode = Column(VARCHAR(32), nullable=True, server_default=None)  # 子 Agent 工作模式：null / executor / collaborator。
    created_at = Column(BigInteger, nullable=False)  # 创建时间，毫秒时间戳。
    updated_at = Column(BigInteger, nullable=False)  # 预留为会话更新时间，当前代码在创建时写入。
