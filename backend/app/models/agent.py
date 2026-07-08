"""Agent 主模型。

这个表保存普通业务 Agent 的长期属性，不直接承载某次运行或某个工作空间里的会话状态。

从当前调用链可以确认：
- default / workspace 两类稳定会话真相落在 `agent_session`
- Agent 是否加入某个 workspace 落在 `agent_workspace_binding`
- 运行时工作目录会先看 `default_working_dir`，否则按平台规则回退
- `type` 和 `agent_json` 当前按保留字段处理
"""

from sqlalchemy import BigInteger, Column, Integer, String, Text, VARCHAR

from app.core.database import Base


class Agent(Base):
    """普通业务 Agent 主记录。"""

    __tablename__ = "agent"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=True)  # 归属用户标识；当前业务允许为空。
    name = Column(VARCHAR(255), nullable=False)  # Agent 名称；业务层会基于它做重名校验。
    type = Column(VARCHAR(255), nullable=True)  # 保留字段。
    agent_json = Column(Text, nullable=True)  # 保留字段。
    default_working_dir = Column(String, nullable=True)  # 默认工作目录；为空时运行时会回退到平台约定目录。
    created_at = Column(BigInteger, nullable=False)  # 创建时间，毫秒时间戳。
