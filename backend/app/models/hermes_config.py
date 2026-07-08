"""Hermes 外部集成配置模型。

这张表只保存 Hermes 当前正式支持的 3 个连接类配置：
- `api_base_url`
- `api_key`
- `dashboard_url`

`home_dir`、`skills_dir`、`cron_jobs_path`、`config_path` 属于已废弃的 legacy 语义，
当前主链路不会再读取或暴露这些 key。
"""

from sqlalchemy import Column, Integer, String, Text

from app.core.database import Base


class HermesConfig(Base):
    """Hermes 全局配置主记录。"""

    __tablename__ = "hermes_config"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, nullable=False, unique=True)  # 配置键，仅保留 Hermes 正式支持的连接类 key。
    value = Column(Text, nullable=False)  # 配置值，当前用于 URL 与密钥等文本配置。
    description = Column(Text, nullable=True)  # 配置项说明，供前端配置界面展示。
