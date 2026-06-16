from sqlalchemy import Column, Integer, String, Text, VARCHAR

from app.core.database import Base


class WorkspaceAgent(Base):
    """
    工作空间智能体模型，对应数据库表 `workspace_agent`。

    记录某个工作空间下的智能体信息，包括智能体名称、类型
    以及序列化后的智能体配置 JSON 数据。
    """

    __tablename__ = "workspace_agent"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=True)              # 所属用户 ID
    work_space_id = Column(Integer, nullable=True)        # 所属工作空间 ID
    name = Column(VARCHAR(255), nullable=True)            # 智能体名称
    type = Column(VARCHAR(255), nullable=True)            # 智能体类型
    agent_json = Column(Text, nullable=True)              # 智能体配置的 JSON 序列化数据
    working_dir = Column(String, nullable=True)           # 自定义工作目录
