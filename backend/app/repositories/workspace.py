"""
工作空间（Workspace）的数据访问层。

本模块封装了对 Workspace 表及其关联表的增删改查操作，
提供工作空间列表获取、详情查询、创建、删除以及仪表盘统计等功能。
"""

import time

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import WorkHistory, WorkItem, WorkKnowledge, Workspace, WorkspaceAgent


def list_workspaces(db: Session) -> list[Workspace]:
    """获取所有工作空间列表，按 ID 降序排列。

    Args:
        db: SQLAlchemy 数据库会话。

    Returns:
        工作空间对象列表。
    """
    return db.scalars(select(Workspace).order_by(Workspace.id.desc())).all()


def get_workspace(db: Session, workspace_id: int) -> Workspace | None:
    """根据 ID 获取单个工作空间详情。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。

    Returns:
        工作空间对象；不存在时返回 None。
    """
    return db.get(Workspace, workspace_id)


def get_workspace_by_name(db: Session, name: str) -> Workspace | None:
    """根据名称获取单个工作空间详情。

    Args:
        db: SQLAlchemy 数据库会话。
        name: 工作空间名称。

    Returns:
        工作空间对象；不存在时返回 None。
    """
    return db.scalar(select(Workspace).where(Workspace.name == name))


def create_workspace(
    db: Session,
    *,
    user_id: str | None,
    name: str,
    goal: str | None,
    super_agent_nick_name: str | None,
) -> Workspace:
    """创建新的工作空间。

    Args:
        db: SQLAlchemy 数据库会话。
        user_id: 所属用户 ID。
        name: 工作空间名称。
        goal: 工作空间目标描述。
        super_agent_nick_name: 超级智能体昵称；未传值时默认为 "项目经理"。

    Returns:
        创建成功后的工作空间对象。
    """
    workspace = Workspace(
        user_id=user_id,
        name=name,
        goal=goal,
        # 若未指定昵称，则使用默认名称 "项目经理"
        super_agent_nick_name=super_agent_nick_name or "项目经理",
        # 记录当前时间戳（毫秒级）
        created_at=int(time.time() * 1000),
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def update_workspace(
    db: Session,
    workspace: Workspace,
    *,
    name: str | None = None,
    goal: str | None = None,
) -> Workspace:
    """更新指定工作空间的名称和目标。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace: 待更新的工作空间对象。
        name: 新的工作空间名称；None 表示不更新。
        goal: 新的工作空间目标描述；None 表示不更新。

    Returns:
        更新后的工作空间对象。
    """
    if name is not None:
        workspace.name = name
    if goal is not None:
        workspace.goal = goal
    db.commit()
    db.refresh(workspace)
    return workspace


def delete_workspace(db: Session, workspace: Workspace) -> None:
    """删除指定工作空间。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace: 待删除的工作空间对象。
    """
    db.delete(workspace)
    db.commit()


def list_workspace_item_ids(db: Session, workspace_id: int) -> list[int]:
    """获取指定工作空间下的所有工作项 ID 列表。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。

    Returns:
        工作项 ID 列表。
    """
    return list(
        db.scalars(
            select(WorkItem.id).where(WorkItem.work_space_id == workspace_id)
        ).all()
    )


def delete_workspace_related_rows(db: Session, workspace_id: int, item_ids: list[int]) -> None:
    """级联删除指定工作空间下的所有关联数据。

    包括：工作历史记录、工作项、智能体、知识库。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。
        item_ids: 该工作空间下待删除的工作项 ID 列表。
    """
    # 删除该工作空间下的所有工作历史记录
    db.execute(delete(WorkHistory).where(WorkHistory.work_space_id == workspace_id))
    # 若存在工作项，则批量删除
    if item_ids:
        db.execute(delete(WorkItem).where(WorkItem.id.in_(item_ids)))
    # 删除该工作空间下的所有智能体
    db.execute(delete(WorkspaceAgent).where(WorkspaceAgent.work_space_id == workspace_id))
    # 删除该工作空间下的所有知识库
    db.execute(delete(WorkKnowledge).where(WorkKnowledge.work_space_id == workspace_id))
    db.commit()


def get_dashboard(db: Session, workspace_id: int) -> dict:
    """获取指定工作空间的仪表盘统计数据。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。

    Returns:
        包含项目经理信息及各类统计数量的字典。
    """
    # 统计该工作空间下的智能体数量
    agent_count = db.scalar(select(func.count()).select_from(WorkspaceAgent).where(WorkspaceAgent.work_space_id == workspace_id)) or 0
    # 统计该工作空间下的工作项数量
    item_count = db.scalar(select(func.count()).select_from(WorkItem).where(WorkItem.work_space_id == workspace_id)) or 0
    # 统计该工作空间下的知识库数量
    knowledge_count = db.scalar(select(func.count()).select_from(WorkKnowledge).where(WorkKnowledge.work_space_id == workspace_id)) or 0
    # 统计该工作空间下的历史记录（成果）数量
    result_count = db.scalar(select(func.count()).select_from(WorkHistory).where(WorkHistory.work_space_id == workspace_id)) or 0
    # 统计状态为 "reviewing"（待审）的历史记录数量，作为待办数
    todo_count = db.scalar(
        select(func.count()).select_from(WorkHistory).where(
            WorkHistory.work_space_id == workspace_id, WorkHistory.status == "reviewing"
        )
    ) or 0
    # 获取工作空间信息，用于提取项目经理昵称
    workspace = get_workspace(db, workspace_id)
    return {
        "project_manager": {"name": (workspace.super_agent_nick_name if workspace else "项目经理"), "status": "在线"},
        "agent_count": agent_count,
        "item_count": item_count,
        "todo_count": todo_count,
        "knowledge_count": knowledge_count,
        "result_count": result_count,
    }
