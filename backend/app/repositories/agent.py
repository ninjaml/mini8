"""普通业务 Agent 的数据访问层。"""

import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Agent
from app.models.agent_workspace_binding import AgentWorkspaceBinding
from app.models.agent_session import AgentSession


def list_agents(db: Session) -> list[Agent]:
    """获取所有 Agent，按 ID 升序排列。"""
    return db.scalars(select(Agent).order_by(Agent.id.asc())).all()


def get_agent(db: Session, agent_id: int) -> Agent | None:
    """根据 ID 获取单个 Agent。"""
    return db.get(Agent, agent_id)


def get_agent_by_name(db: Session, name: str) -> Agent | None:
    """根据名称获取单个 Agent。"""
    return db.scalar(select(Agent).where(Agent.name == name))


def get_workspace_agent_by_name(db: Session, workspace_id: int, name: str) -> Agent | None:
    """根据 workspace 绑定与名称获取单个成员 agent。"""
    return db.scalar(
        select(Agent)
        .join(AgentWorkspaceBinding, AgentWorkspaceBinding.agent_id == Agent.id)
        .join(
            AgentSession,
            (AgentSession.agent_id == Agent.id)
            & (AgentSession.session_type == "workspace")
            & (AgentSession.workspace_id == workspace_id),
        )
        .where(
            AgentWorkspaceBinding.workspace_id == workspace_id,
            Agent.name == name,
        )
        .limit(1)
    )


def list_agents_by_workspace_id(db: Session, workspace_id: int) -> list[Agent]:
    """获取绑定到指定 workspace 的成员 agent 列表。"""
    return db.scalars(
        select(Agent)
        .join(AgentWorkspaceBinding, AgentWorkspaceBinding.agent_id == Agent.id)
        .join(
            AgentSession,
            (AgentSession.agent_id == Agent.id)
            & (AgentSession.session_type == "workspace")
            & (AgentSession.workspace_id == workspace_id),
        )
        .where(
            AgentWorkspaceBinding.workspace_id == workspace_id,
        )
        .order_by(Agent.id.asc())
    ).all()


def create_agent(
    db: Session,
    *,
    user_id: str | None,
    name: str,
    type: str | None,
    agent_json: str | None,
    default_working_dir: str | None = None,
) -> Agent:
    """创建新的 Agent 本体记录。"""
    agent = Agent(
        user_id=user_id,
        name=name,
        type=type,
        agent_json=agent_json,
        default_working_dir=default_working_dir,
        created_at=int(time.time() * 1000),
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def update_agent(db: Session, agent: Agent) -> Agent:
    """更新已有 Agent。"""
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def delete_agent(db: Session, agent_id: int) -> None:
    """删除指定 Agent 本体记录。"""
    db.execute(delete(Agent).where(Agent.id == agent_id))
    db.commit()


def delete_agent_no_commit(db: Session, agent_id: int) -> None:
    """删除指定 Agent 本体记录，但不提交事务。"""
    db.execute(delete(Agent).where(Agent.id == agent_id))
    db.flush()
