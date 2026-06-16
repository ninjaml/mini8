from sqlalchemy import BigInteger, Column, Integer, String, Text, VARCHAR

from app.core.database import Base


class WorkItem(Base):
    """
    工作项模型，对应数据库表 `work_item`。

    表示工作空间中的一个具体任务/工作项，包含任务名称、描述、
    工作要求、交付要求，以及是否需要超级智能体审核、是否需要人工审核、
    是否允许自动完成等配置。
    """

    __tablename__ = "work_item"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=True)                  # 所属用户 ID
    work_space_id = Column(Integer, nullable=True)            # 所属工作空间 ID
    name = Column(VARCHAR(255), nullable=True)                # 工作项名称
    description = Column(Text, nullable=True)                 # 工作项描述
    work_requirement = Column(Text, nullable=True)            # 工作要求
    delivery_requirement = Column(Text, nullable=True)        # 交付要求
    need_superagent_review = Column(Integer, nullable=True)   # 是否需要超级智能体审核（0/1）
    need_superone_review = Column(Integer, nullable=True)     # 是否需要人工审核（0/1）
    allow_auto_complete = Column(Integer, nullable=True)      # 是否允许自动完成（0/1）
    created_at = Column(BigInteger, nullable=True)            # 创建时间（时间戳）
