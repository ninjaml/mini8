"""
工作空间（Workspace）的数据访问层。

本模块封装 Workspace 本体及其现役关联数据的读写。
这里专注处理当前 workspace 真相对象，不再承担旧任务化聚合语义。
"""

import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AgentWorkspaceBinding, WorkKnowledge, Workspace, WorkspaceMessage
from app.repositories.agent_session import delete_workspace_agent_sessions_by_workspace_id


def list_workspaces(db: Session) -> list[Workspace]:
    return db.scalars(select(Workspace).order_by(Workspace.id.desc())).all()


def get_workspace(db: Session, workspace_id: int) -> Workspace | None:
    return db.get(Workspace, workspace_id)


def get_workspace_by_name(db: Session, name: str) -> Workspace | None:
    return db.scalar(select(Workspace).where(Workspace.name == name))


def create_workspace(
    db: Session,
    *,
    user_id: str | None,
    name: str,
    goal: str | None,
    working_dir: str,
) -> Workspace:
    workspace = Workspace(
        user_id=user_id,
        name=name,
        goal=goal,
        working_dir=working_dir,
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
    working_dir: str | None = None,
) -> Workspace:
    if name is not None:
        workspace.name = name
    if goal is not None:
        workspace.goal = goal
    if working_dir is not None:
        workspace.working_dir = working_dir
    db.commit()
    db.refresh(workspace)
    return workspace


def delete_workspace(db: Session, workspace: Workspace) -> None:
    db.delete(workspace)
    db.commit()


def delete_workspace_related_rows(db: Session, workspace_id: int) -> None:
    """删除 workspace 自有的数据库关联数据。

    当前清理范围只包含现役 workspace 自有对象：
    - workspace session
    - agent workspace 绑定关系
    - workspace 绑定的知识库关系
    - workspace_message
    """
    delete_workspace_agent_sessions_by_workspace_id(db, workspace_id)
    db.execute(delete(AgentWorkspaceBinding).where(AgentWorkspaceBinding.workspace_id == workspace_id))
    db.execute(delete(WorkKnowledge).where(WorkKnowledge.work_space_id == workspace_id))
    db.execute(delete(WorkspaceMessage).where(WorkspaceMessage.workspace_id == workspace_id))
    db.commit()
