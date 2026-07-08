"""团队知识库连接配置模型。

这张表保存的是企业知识库 / R2R 相关的全局连接配置，
不是某个 workspace 私有的数据。

从当前调用链可以确认：
- 启动时会把 `settings` 中的默认值补写到这张表
- 运行时以数据库中的配置为主，再同步到 enterprise knowledge service 缓存
- 当前稳定使用的 key 包括：
  - `r2r_base_url`：R2R 服务根地址
  - `r2r_login_url`：R2R 登录页地址
"""

from sqlalchemy import Column, Integer, String, Text

from app.core.database import Base


class KBConfig(Base):
    """团队知识库全局配置主记录。"""

    __tablename__ = "kb_config"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, nullable=False, unique=True)  # 配置键，如 `r2r_base_url`。
    value = Column(Text, nullable=False)  # 配置值；当前主要保存 URL 等文本配置。
    description = Column(Text, nullable=True)  # 配置项说明，供前端配置界面展示。
