from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

# SQLAlchemy 声明性基类，所有 ORM 模型均继承此类
Base = declarative_base()


def build_engine(database_url: str = settings.DATABASE_URL):
    """
    创建 SQLAlchemy 数据库引擎。

    :param database_url: 数据库连接 URL，默认使用 settings.DATABASE_URL
    :return: SQLAlchemy Engine 实例
    """
    # check_same_thread=False 允许在 SQLite 中跨线程使用连接
    return create_engine(database_url, connect_args={"check_same_thread": False})


# 全局引擎与会话工厂
engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator:
    """
    获取数据库会话的生成器，用于 FastAPI 依赖注入。

    通过 yield 提供会话，并在请求结束后自动关闭，
    确保连接资源被正确释放。

    :yield: SQLAlchemy Session 实例
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
