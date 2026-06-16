from sqlalchemy import Column, Integer

from app.core.database import Base


class AgentWork(Base):
    """
    智能体与工作项关联模型，对应数据库表 `agent_work`。

    作为关联表/映射表，建立智能体（agent）与工作项（work_item）
    之间的多对多关系。
    """

    __tablename__ = "agent_work"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(Integer, nullable=True)        # 智能体 ID
    work_item_id = Column(Integer, nullable=True)    # 工作项 ID
