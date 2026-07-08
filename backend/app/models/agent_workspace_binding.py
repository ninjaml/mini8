"""Agent 与 Workspace 的成员绑定模型。

这张表只表达“某个 Agent 是否属于某个 workspace”这件事本身。

从当前调用链可以确认：
- 它是 workspace 成员关系的轻量真相表
- 是否存在对应的 workspace session、使用什么 persona、显示什么名称，不由这张表承载
- 绑定建立后，session 级真相会另外写入 `agent_session`
"""

from sqlalchemy import Column, Integer, UniqueConstraint

from app.core.database import Base


class AgentWorkspaceBinding(Base):
    """Agent 与 Workspace 的成员关系主记录。"""

    __tablename__ = "agent_workspace_binding"
    __table_args__ = (
        UniqueConstraint(
            "agent_id",
            "workspace_id",
            name="uq_agent_workspace_binding_agent_workspace",
        ),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(Integer, nullable=False)  # 被加入 workspace 的 Agent 主记录 ID。
    workspace_id = Column(Integer, nullable=False)  # 成员所属的 workspace ID。
