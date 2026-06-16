"""
工作知识库（WorkKnowledge）的数据访问层。

本模块封装了对 WorkKnowledge 表的增删改查操作，
提供知识库列表获取、详情查询、按端口查找、创建、更新与删除等功能。
"""

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import WorkKnowledge


def list_workspace_knowledge(db: Session, workspace_id: int) -> list[WorkKnowledge]:
    """获取指定工作空间下的所有知识库列表，按 ID 升序排列。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。

    Returns:
        知识库对象列表。
    """
    return db.scalars(select(WorkKnowledge).where(WorkKnowledge.work_space_id == workspace_id).order_by(WorkKnowledge.id.asc())).all()


def get_workspace_knowledge(db: Session, knowledge_id: int) -> WorkKnowledge | None:
    """根据 ID 获取单个知识库详情。

    Args:
        db: SQLAlchemy 数据库会话。
        knowledge_id: 知识库 ID。

    Returns:
        知识库对象；不存在时返回 None。
    """
    return db.scalar(select(WorkKnowledge).where(WorkKnowledge.id == knowledge_id))


def get_workspace_knowledge_by_port(db: Session, workspace_id: int, port: int) -> WorkKnowledge | None:
    """在工作空间内根据服务端口号查找知识库。

    端口信息存储在 knowledge_json JSON 字符串中，
    本函数在应用层解析 JSON 后比对 port 字段，不依赖序列化格式。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。
        port: 目标端口号。

    Returns:
        匹配的知识库对象；未找到时返回 None。
    """
    entries = list_workspace_knowledge(db, workspace_id)
    for entry in entries:
        try:
            data = json.loads(entry.knowledge_json or "{}")
            if data.get("port") == port:
                return entry
        except (json.JSONDecodeError, TypeError):
            continue
    return None


def create_workspace_knowledge(db: Session, knowledge: WorkKnowledge) -> WorkKnowledge:
    """创建新的知识库。

    Args:
        db: SQLAlchemy 数据库会话。
        knowledge: 待持久化的知识库对象。

    Returns:
        创建成功后的知识库对象。
    """
    db.add(knowledge)
    db.commit()
    db.refresh(knowledge)
    return knowledge


def update_workspace_knowledge(db: Session, knowledge: WorkKnowledge, **changes) -> WorkKnowledge:
    """更新已有知识库。

    通过 setattr 动态设置变更字段，然后提交会话。

    Args:
        db: SQLAlchemy 数据库会话。
        knowledge: 待更新的知识库对象。
        **changes: 要更新的字段键值对。

    Returns:
        更新后的知识库对象。
    """
    for key, value in changes.items():
        setattr(knowledge, key, value)
    db.add(knowledge)
    db.commit()
    db.refresh(knowledge)
    return knowledge


def delete_workspace_knowledge(db: Session, knowledge: WorkKnowledge) -> None:
    """删除指定知识库。

    Args:
        db: SQLAlchemy 数据库会话。
        knowledge: 待删除的知识库对象。
    """
    db.delete(knowledge)
    db.commit()
