from sqlalchemy import Column, Integer, String, Text, VARCHAR

from app.core.database import Base


class WorkKnowledge(Base):
    """
    工作知识模型，对应数据库表 `work_knowledge`。

    存储与工作空间相关的知识数据，包括知识名称、类型
    以及序列化后的知识内容 JSON 数据。
    """

    __tablename__ = "work_knowledge"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=True)              # 所属用户 ID
    work_space_id = Column(Integer, nullable=True)        # 所属工作空间 ID
    name = Column(VARCHAR(255), nullable=True)            # 知识名称
    type = Column(VARCHAR(255), nullable=True)            # 知识类型
    knowledge_json = Column(Text, nullable=True)          # 知识内容的 JSON 序列化数据
