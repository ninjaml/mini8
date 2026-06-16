from sqlalchemy import Column, Integer, String, Text

from app.core.database import Base


class HermesConfig(Base):
    """
    Hermes 外部服务配置表，对应数据库表 `hermes_config`。

    以 key-value 形式存储 Hermes 连接配置，
    取代原来写死在 config.py 中的环境变量默认值。
    """

    __tablename__ = "hermes_config"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, nullable=False, unique=True)      # 配置键，如 "api_base_url"
    value = Column(Text, nullable=False)                   # 配置值
    description = Column(Text, nullable=True)              # 描述说明
