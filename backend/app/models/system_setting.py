from sqlalchemy import Column, Integer, String

from app.core.database import Base


class SystemSetting(Base):
    """
    系统全局配置模型，对应数据库表 `system_setting`。

    以 key-value 形式存储系统级配置，如 MOSS 工作目录等。
    """

    __tablename__ = "system_setting"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, nullable=False, unique=True)
    value = Column(String, nullable=True)
