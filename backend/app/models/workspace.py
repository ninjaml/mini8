"""Workspace 主模型。

这个表描述平台里的“工作空间”本体，用来承载一组协作边界：
- 工作空间名称与目标描述
- 共享工作目录
- 与 Agent / WorkspaceMessage / WorkKnowledge 等现役数据的关联锚点

从当前代码使用方式看，`working_dir` 不是展示字段，而是 workspace session
运行时解析时直接依赖的共享目录真相。
"""

from sqlalchemy import BigInteger, Column, Integer, String, Text, VARCHAR

from app.core.database import Base


class Workspace(Base):
    """工作空间主记录。"""

    __tablename__ = "workspace"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(VARCHAR(255), nullable=False)  # 工作空间名称；当前由接口层保证全局唯一。
    user_id = Column(String, nullable=True)  # 归属用户标识；当前业务允许为空。
    goal = Column(Text, nullable=True)  # 工作空间目标或背景说明，供前端和协作流程展示。
    working_dir = Column(String, nullable=False)  # workspace 共享工作目录；workspace session 运行时直接依赖它。
    created_at = Column(BigInteger, nullable=False)  # 创建时间，毫秒时间戳。
