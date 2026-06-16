from sqlalchemy import BigInteger, Column, Integer, String, Text, VARCHAR

from app.core.database import Base


class Workspace(Base):
    """
    工作空间模型，对应数据库表 `workspace`。

    表示一个用户的工作空间，包含空间名称、所属用户、目标描述
    以及超级智能体昵称等信息。
    """

    __tablename__ = "workspace"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(VARCHAR(255), nullable=True)                        # 工作空间名称
    user_id = Column(String, nullable=True)                          # 所属用户 ID
    goal = Column(Text, nullable=True)                                # 工作空间目标/描述
    super_agent_nick_name = Column(VARCHAR(255), nullable=True, default="项目经理")  # 超级智能体昵称
    super_agent_working_dir = Column(String, nullable=True)                          # SuperAgent 自定义工作目录
    created_at = Column(BigInteger, nullable=True)                    # 创建时间（时间戳）
