"""
工作历史（WorkHistory）的数据访问层。

本模块封装了对 WorkHistory 表的增删改查操作，
提供工作历史列表获取、创建、详情查询、更新、删除以及按工作项批量删除等功能。
"""

import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import WorkHistory


def list_work_histories(db: Session, item_id: int) -> list[WorkHistory]:
    """获取指定工作项下的所有历史记录，按创建时间和 ID 降序排列。

    Args:
        db: SQLAlchemy 数据库会话。
        item_id: 工作项 ID。

    Returns:
        工作历史对象列表。
    """
    return db.scalars(select(WorkHistory).where(WorkHistory.work_item_id == item_id).order_by(WorkHistory.created_at.desc(), WorkHistory.id.desc())).all()


def create_work_history(db: Session, data: dict) -> WorkHistory:
    """创建新的工作历史记录。

    自动填充当前时间戳到 created_at、started_at 和 ended_at 字段。

    Args:
        db: SQLAlchemy 数据库会话。
        data: 工作历史字段字典，将解包传入 WorkHistory 构造器。

    Returns:
        创建成功后的工作历史对象。
    """
    now = int(time.time() * 1000)
    record = WorkHistory(created_at=now, started_at=now, ended_at=now, **data)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_work_history(db: Session, history_id: int) -> WorkHistory | None:
    """根据 ID 获取单条工作历史记录。

    Args:
        db: SQLAlchemy 数据库会话。
        history_id: 工作历史记录 ID。

    Returns:
        工作历史对象；不存在时返回 None。
    """
    return db.get(WorkHistory, history_id)


def update_work_history(db: Session, record: WorkHistory) -> WorkHistory:
    """更新已有工作历史记录。

    通过将对象加入会话并提交来实现更新。

    Args:
        db: SQLAlchemy 数据库会话。
        record: 已修改的工作历史对象。

    Returns:
        更新后的工作历史对象。
    """
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def delete_work_history(db: Session, record: WorkHistory) -> None:
    """删除指定工作历史记录。

    Args:
        db: SQLAlchemy 数据库会话。
        record: 待删除的工作历史对象。
    """
    db.delete(record)
    db.commit()


def delete_work_histories_by_item(db: Session, item_id: int) -> None:
    """删除指定工作项下的所有历史记录。

    Args:
        db: SQLAlchemy 数据库会话。
        item_id: 工作项 ID。
    """
    db.execute(delete(WorkHistory).where(WorkHistory.work_item_id == item_id))
    db.commit()
