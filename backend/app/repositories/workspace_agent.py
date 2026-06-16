"""
工作空间智能体（WorkspaceAgent）的数据访问层。

本模块封装了对 WorkspaceAgent 及 AgentWork 关联表的增删改查操作，
提供智能体列表获取、详情查询、创建、更新、删除以及工作项绑定查询等功能。
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AgentWork, WorkspaceAgent


def list_workspace_agents(db: Session, workspace_id: int) -> list[WorkspaceAgent]:
    """获取指定工作空间下的所有智能体列表，按 ID 升序排列。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。

    Returns:
        智能体对象列表。
    """
    return db.scalars(select(WorkspaceAgent).where(WorkspaceAgent.work_space_id == workspace_id).order_by(WorkspaceAgent.id.asc())).all()


def get_workspace_agent(db: Session, agent_id: int) -> WorkspaceAgent | None:
    """根据 ID 获取单个智能体详情。

    Args:
        db: SQLAlchemy 数据库会话。
        agent_id: 智能体 ID。

    Returns:
        智能体对象；不存在时返回 None。
    """
    return db.get(WorkspaceAgent, agent_id)


def get_workspace_agent_by_name(db: Session, workspace_id: int, name: str) -> WorkspaceAgent | None:
    """根据名称在工作空间内查找智能体。

    Args:
        db: SQLAlchemy 数据库会话。
        workspace_id: 工作空间 ID。
        name: 智能体名称。

    Returns:
        匹配的智能体对象；不存在时返回 None。
    """
    return db.scalars(
        select(WorkspaceAgent)
        .where(WorkspaceAgent.work_space_id == workspace_id, WorkspaceAgent.name == name)
        .limit(1)
    ).first()


def create_workspace_agent(db: Session, agent: WorkspaceAgent) -> WorkspaceAgent:
    """创建新的智能体。

    Args:
        db: SQLAlchemy 数据库会话。
        agent: 待持久化的智能体对象。

    Returns:
        创建成功后的智能体对象。
    """
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def update_workspace_agent(db: Session, agent: WorkspaceAgent) -> WorkspaceAgent:
    """更新已有智能体。

    通过将对象加入会话并提交来实现更新。

    Args:
        db: SQLAlchemy 数据库会话。
        agent: 已修改的智能体对象。

    Returns:
        更新后的智能体对象。
    """
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def delete_workspace_agent(db: Session, agent: WorkspaceAgent) -> None:
    """删除指定智能体。

    删除前会先清理该智能体在 agent_work 关联表中的所有绑定记录。

    Args:
        db: SQLAlchemy 数据库会话。
        agent: 待删除的智能体对象。
    """
    db.execute(delete(AgentWork).where(AgentWork.agent_id == agent.id))
    db.delete(agent)
    db.commit()


def get_agent_work_item_ids(db: Session, agent_id: int) -> list[int]:
    """获取指定智能体已绑定的所有工作项 ID 列表（去重）。

    查询 AgentWork 关联表，过滤掉 work_item_id 为 None 的记录。

    Args:
        db: SQLAlchemy 数据库会话。
        agent_id: 智能体 ID。

    Returns:
        工作项 ID 列表。
    """
    return db.scalars(
        select(AgentWork.work_item_id)
        .where(AgentWork.agent_id == agent_id, AgentWork.work_item_id.isnot(None))
        .distinct()
    ).all()
