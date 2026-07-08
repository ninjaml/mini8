"""Agent 与子 Agent 绑定模型。"""

from sqlalchemy import BigInteger, CheckConstraint, Column, Integer, UniqueConstraint, VARCHAR

from app.core.database import Base


class AgentSubagentBinding(Base):
    """普通业务 Agent 的子代理绑定关系。"""

    __tablename__ = "agent_subagent_binding"
    __table_args__ = (
        # 同一父 Agent 下，child roster 必须满足：不能自绑定、名称唯一、同一个 child 只能挂一次。
        CheckConstraint("parent_agent_id != child_agent_id", name="ck_agent_subagent_not_self"),
        UniqueConstraint("parent_agent_id", "subagent_name", name="uq_agent_subagent_parent_name"),
        UniqueConstraint("parent_agent_id", "child_agent_id", name="uq_agent_subagent_parent_child"),
        {"sqlite_autoincrement": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_agent_id = Column(Integer, nullable=False, index=True)
    child_agent_id = Column(Integer, nullable=False, index=True)
    subagent_name = Column(VARCHAR(255), nullable=False)
    description = Column(VARCHAR(2000), nullable=False)
    created_at = Column(BigInteger, nullable=False)
