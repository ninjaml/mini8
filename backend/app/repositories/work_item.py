"""
工作项（WorkItem）的数据访问层。

本模块封装了对 WorkItem 及 AgentWork 关联表的增删改查操作，
提供工作项列表获取、详情查询、创建、更新、删除以及智能体绑定等功能。
"""

import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AgentWork, WorkHistory, WorkItem


def list_work_items(db: Session, workspace_id: int) -> list[WorkItem]:
    """获取指定工作空间下的所有工作项列表，按 ID 降序排列。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。

    Returns:
        工作项对象列表。
    """
    return db.scalars(select(WorkItem).where(WorkItem.work_space_id == workspace_id).order_by(WorkItem.id.desc())).all()


def get_work_item(db: Session, item_id: int) -> WorkItem | None:
    """根据 ID 获取单个工作项详情。

    Args:
        db: SQLAlchemy 数据库会话。
        item_id: 工作项 ID。

    Returns:
        工作项对象；不存在时返回 None。
    """
    return db.get(WorkItem, item_id)


def get_work_item_by_name(
    db: Session, workspace_id: int, name: str, exclude_item_id: int | None = None
) -> WorkItem | None:
    """根据名称在工作空间内查找工作项，支持排除指定 ID。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。
        name: 工作项名称。
        exclude_item_id: 需要排除的工作项 ID（常用于更新时校验重名），可选。

    Returns:
        匹配的工作项对象；不存在时返回 None。
    """
    stmt = select(WorkItem).where(
        WorkItem.work_space_id == workspace_id,
        WorkItem.name == name,
    )
    # 若传入了 exclude_item_id，则排除该 ID 的记录
    if exclude_item_id is not None:
        stmt = stmt.where(WorkItem.id != exclude_item_id)
    return db.scalars(stmt.limit(1)).first()


def create_work_item(db: Session, data: dict) -> WorkItem:
    """创建新的工作项。

    Args:
        db: SQLAlchemy 数据库会话。
        data: 工作项字段字典，将解包传入 WorkItem 构造器。

    Returns:
        创建成功后的工作项对象。
    """
    item = WorkItem(created_at=int(time.time() * 1000), **data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_work_item(db: Session, item: WorkItem) -> WorkItem:
    """更新已有工作项。

    通过将对象加入会话并提交来实现更新。

    Args:
        db: SQLAlchemy 数据库会话。
        item: 已修改的工作项对象。

    Returns:
        更新后的工作项对象。
    """
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def bind_agent_to_item(db: Session, item_id: int, agent_id: int) -> None:
    """将智能体绑定到指定工作项（或解绑）。

    先清除该工作项已有的所有绑定关系，再根据 agent_id 决定是否建立新绑定。

    Args:
        db: SQLAlchemy 数据库会话。
        item_id: 工作项 ID。
        agent_id: 要绑定的智能体 ID；若为 None，则表示仅解绑。
    """
    # 清除该工作项已有的全部绑定记录
    db.execute(delete(AgentWork).where(AgentWork.work_item_id == item_id))
    # 若指定了新的智能体 ID，则建立绑定关系
    if agent_id is not None:
        db.add(AgentWork(agent_id=agent_id, work_item_id=item_id))
    db.commit()


def get_bound_agent_id(db: Session, item_id: int) -> int | None:
    """获取绑定到指定工作项的智能体 ID。

    Args:
        db: SQLAlchemy 数据库会话。
        item_id: 工作项 ID。

    Returns:
        绑定的智能体 ID；未绑定时返回 None。
    """
    row = db.execute(select(AgentWork.agent_id).where(AgentWork.work_item_id == item_id)).first()
    return row[0] if row else None


def get_item_current_status(db: Session, item_id: int) -> str | None:
    """获取指定工作项的最新历史状态。

    按创建时间和 ID 双重降序，取最最近一条历史记录的状态。

    Args:
        db: SQLAlchemy 数据库会话。
        item_id: 工作项 ID。

    Returns:
        最新历史记录的状态字符串；无历史记录时返回 None。
    """
    row = db.execute(
        select(WorkHistory.status)
        .where(WorkHistory.work_item_id == item_id)
        .order_by(WorkHistory.created_at.desc(), WorkHistory.id.desc())
    ).first()
    return row[0] if row else None


def delete_agent_work_bindings(db: Session, item_id: int) -> None:
    """删除指定工作项的所有智能体绑定关系。

    Args:
        db: SQLAlchemy 数据库会话。
        item_id: 工作项 ID。
    """
    db.execute(delete(AgentWork).where(AgentWork.work_item_id == item_id))
    db.commit()


def delete_agent_work_bindings_by_item_ids(db: Session, item_ids: list[int]) -> None:
    """批量删除多个工作项的智能体绑定关系。

    Args:
        db: SQLAlchemy 数据库会话。
        item_ids: 工作项 ID 列表。若为空列表则直接返回，不执行删除。
    """
    if not item_ids:
        return
    db.execute(delete(AgentWork).where(AgentWork.work_item_id.in_(item_ids)))
    db.commit()


def delete_work_item(db: Session, item: WorkItem) -> None:
    """删除指定工作项。

    Args:
        db: SQLAlchemy 数据库会话。
        item: 待删除的工作项对象。
    """
    db.delete(item)
    db.commit()
