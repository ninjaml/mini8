"""
Agent 与 Workspace 绑定的数据访问层。
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AgentWorkspaceBinding


def bind_agent_to_workspace(
    db: Session, agent_id: int, workspace_id: int
) -> AgentWorkspaceBinding:
    """新增一条 Agent 与 Workspace 绑定关系。"""
    existing = db.scalar(
        select(AgentWorkspaceBinding).where(
            AgentWorkspaceBinding.agent_id == agent_id,
            AgentWorkspaceBinding.workspace_id == workspace_id,
        )
    )
    if existing is not None:
        return existing
    binding = AgentWorkspaceBinding(agent_id=agent_id, workspace_id=workspace_id)
    db.add(binding)
    db.commit()
    db.refresh(binding)
    return binding


def list_workspace_ids_by_agent_id(db: Session, agent_id: int) -> list[int]:
    """获取 Agent 绑定的所有 Workspace ID，按升序返回。"""
    return db.scalars(
        select(AgentWorkspaceBinding.workspace_id)
        .where(AgentWorkspaceBinding.agent_id == agent_id)
        .order_by(AgentWorkspaceBinding.workspace_id.asc())
    ).all()


def delete_agent_workspace_binding(db: Session, agent_id: int, workspace_id: int) -> None:
    """删除指定 Agent 与 Workspace 的单条绑定。"""
    db.execute(
        delete(AgentWorkspaceBinding).where(
            AgentWorkspaceBinding.agent_id == agent_id,
            AgentWorkspaceBinding.workspace_id == workspace_id,
        )
    )
    db.commit()


def delete_agent_workspace_binding_no_commit(db: Session, agent_id: int, workspace_id: int) -> None:
    """删除指定 Agent 与 Workspace 的单条绑定，不提交事务。"""
    db.execute(
        delete(AgentWorkspaceBinding).where(
            AgentWorkspaceBinding.agent_id == agent_id,
            AgentWorkspaceBinding.workspace_id == workspace_id,
        )
    )
    db.flush()


def delete_workspace_bindings_by_agent_id(db: Session, agent_id: int) -> None:
    """删除指定 Agent 的全部 Workspace 绑定。"""
    db.execute(delete(AgentWorkspaceBinding).where(AgentWorkspaceBinding.agent_id == agent_id))
    db.commit()


def delete_workspace_bindings_by_agent_id_no_commit(db: Session, agent_id: int) -> None:
    """删除指定 Agent 的全部 Workspace 绑定，不提交事务。"""
    db.execute(delete(AgentWorkspaceBinding).where(AgentWorkspaceBinding.agent_id == agent_id))
    db.flush()


def delete_workspace_bindings_by_workspace_id(db: Session, workspace_id: int) -> None:
    """删除指定 Workspace 的全部 Agent 绑定关系。"""
    db.execute(delete(AgentWorkspaceBinding).where(AgentWorkspaceBinding.workspace_id == workspace_id))
    db.commit()
