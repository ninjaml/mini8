"""OpenClaw 外部集成配置模型。

这张表保存的是 OpenClaw Gateway 相关的全局连接配置。

从当前调用链可以确认：
- 数据库为空时不会自动写入默认值，等待用户在前端手动配置
- 运行时通过 service 层缓存读取配置，并在代理 WebSocket 建连时使用
- 当前已知稳定 key 包括：
  - `gateway_url`：OpenClaw Gateway WebSocket 地址
  - `gateway_token`：OpenClaw Gateway 认证 Token
"""

from sqlalchemy import Column, Integer, String, Text

from app.core.database import Base


class OpenClawConfig(Base):
    """OpenClaw 全局配置主记录。"""

    __tablename__ = "openclaw_config"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, nullable=False, unique=True)  # 配置键，如 `gateway_url`。
    value = Column(Text, nullable=False)  # 配置值；当前主要保存 Gateway 地址和认证 Token。
    description = Column(Text, nullable=True)  # 配置项说明，供前端配置界面展示。
