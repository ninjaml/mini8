from sqlalchemy import Column, Integer, VARCHAR

from app.core.database import Base


class ResourceKey(Base):
    """
    资源密钥模型，对应数据库表 `resource_key`。

    用于存储各类外部资源的访问密钥或标识信息，
    通过资源类型（resource_type）和资源标识（resource_identity）
    区分不同的资源。
    """

    __tablename__ = "resource_key"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(VARCHAR(255), nullable=True)             # 密钥值或访问令牌
    resource_type = Column(VARCHAR(255), nullable=True)   # 资源类型，用于区分不同服务/资源类别
    resource_identity = Column(VARCHAR(255), nullable=True)  # 资源唯一标识，用于定位具体资源实例
