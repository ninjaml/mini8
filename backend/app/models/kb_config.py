from sqlalchemy import Column, Integer, String, Text

from app.core.database import Base


class KBConfig(Base):
    """
    知识库连接配置表，对应数据库表 `kb_config`。

    存储 R2R 团队知识图谱引擎的连接地址等全局配置，
    取代原来写死在 config.py 中的环境变量默认值。
    """

    __tablename__ = "kb_config"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, nullable=False, unique=True)      # 配置键，如 "r2r_base_url"
    value = Column(Text, nullable=False)                   # 配置值
    description = Column(Text, nullable=True)              # 描述说明
