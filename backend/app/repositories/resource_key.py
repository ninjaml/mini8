"""
资源密钥（ResourceKey）的数据访问层。

本模块封装了对 ResourceKey 表的增删改查操作，
提供资源密钥列表获取、创建、按目标删除以及批量按目标删除等功能。
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import ResourceKey


def list_resource_keys(db: Session) -> list[ResourceKey]:
    """获取所有资源密钥列表，按 ID 降序排列。

    Args:
        db: SQLAlchemy 数据库会话。

    Returns:
        资源密钥对象列表。
    """
    return db.scalars(select(ResourceKey).order_by(ResourceKey.id.desc())).all()


def create_resource_key(db: Session, resource_key: ResourceKey) -> ResourceKey:
    """创建新的资源密钥。

    Args:
        db: SQLAlchemy 数据库会话。
        resource_key: 待持久化的资源密钥对象。

    Returns:
        创建成功后的资源密钥对象。
    """
    db.add(resource_key)
    db.commit()
    db.refresh(resource_key)
    return resource_key


def delete_resource_keys_by_target(db: Session, resource_type: str, resource_identity: str) -> None:
    """删除指定资源类型与标识对应的资源密钥。

    Args:
        db: SQLAlchemy 数据库会话。
        resource_type: 资源类型。
        resource_identity: 资源唯一标识。
    """
    db.execute(
        delete(ResourceKey).where(
            ResourceKey.resource_type == resource_type,
            ResourceKey.resource_identity == resource_identity,
        )
    )
    db.commit()


def delete_resource_keys_by_targets(db: Session, resource_type: str, resource_identities: list[str]) -> None:
    """批量删除指定资源类型下多个标识对应的资源密钥。

    Args:
        db: SQLAlchemy 数据库会话。
        resource_type: 资源类型。
        resource_identities: 资源唯一标识列表。若为空列表则直接返回，不执行删除。
    """
    if not resource_identities:
        return
    db.execute(
        delete(ResourceKey).where(
            ResourceKey.resource_type == resource_type,
            ResourceKey.resource_identity.in_(resource_identities),
        )
    )
    db.commit()
