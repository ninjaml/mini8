"""MOSS 配置模型。

这张表是一个轻量的 key-value 配置容器，用来保存 MOSS 相关的少量可变配置。

从当前调用链可以直接确认：
- 目前已知稳定使用的 key 是 `moss_working_dir`
- 该值用于覆盖 MOSS 运行时默认工作目录
- 普通 Agent 的工作目录不走这张表，而是落在 `agent.default_working_dir`
"""

from sqlalchemy import Column, Integer, String

from app.core.database import Base


class MossConfig(Base):
    """MOSS 级 key-value 配置主记录。"""

    __tablename__ = "moss_config"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, nullable=False, unique=True)  # 配置项名称。
    value = Column(String, nullable=True)  # 配置项值；当前主要保存字符串路径。
