"""Agent 与子 Agent 绑定的数据访问层。"""

import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AgentSubagentBinding


def _now_ms() -> int:
    return int(time.time() * 1000)


def list_subagent_bindings_by_parent_agent_id(db: Session, parent_agent_id: int) -> list[AgentSubagentBinding]:
    return db.scalars(
        select(AgentSubagentBinding)
        .where(AgentSubagentBinding.parent_agent_id == parent_agent_id)
        .order_by(AgentSubagentBinding.created_at.asc(), AgentSubagentBinding.id.asc())
    ).all()


def list_subagent_bindings_by_child_agent_id(db: Session, child_agent_id: int) -> list[AgentSubagentBinding]:
    return db.scalars(
        select(AgentSubagentBinding)
        .where(AgentSubagentBinding.child_agent_id == child_agent_id)
        .order_by(AgentSubagentBinding.created_at.asc(), AgentSubagentBinding.id.asc())
    ).all()


def get_subagent_binding(db: Session, binding_id: int) -> AgentSubagentBinding | None:
    return db.get(AgentSubagentBinding, binding_id)


def get_subagent_binding_by_parent_and_name(
    db: Session,
    *,
    parent_agent_id: int,
    subagent_name: str,
) -> AgentSubagentBinding | None:
    return db.scalar(
        select(AgentSubagentBinding).where(
            AgentSubagentBinding.parent_agent_id == parent_agent_id,
            AgentSubagentBinding.subagent_name == subagent_name,
        )
    )


def get_subagent_binding_by_parent_and_child(
    db: Session,
    *,
    parent_agent_id: int,
    child_agent_id: int,
) -> AgentSubagentBinding | None:
    return db.scalar(
        select(AgentSubagentBinding).where(
            AgentSubagentBinding.parent_agent_id == parent_agent_id,
            AgentSubagentBinding.child_agent_id == child_agent_id,
        )
    )


def create_subagent_binding(
    db: Session,
    *,
    parent_agent_id: int,
    child_agent_id: int,
    subagent_name: str,
    description: str,
    commit: bool = True,
) -> AgentSubagentBinding:
    binding = AgentSubagentBinding(
        parent_agent_id=parent_agent_id,
        child_agent_id=child_agent_id,
        subagent_name=subagent_name,
        description=description,
        created_at=_now_ms(),
    )
    db.add(binding)
    if commit:
        db.commit()
        db.refresh(binding)
    else:
        db.flush()
    return binding


def delete_subagent_binding(db: Session, binding_id: int, *, commit: bool = True) -> None:
    db.execute(delete(AgentSubagentBinding).where(AgentSubagentBinding.id == binding_id))
    if commit:
        db.commit()
    else:
        db.flush()


def delete_subagent_bindings_by_parent_agent_id(db: Session, parent_agent_id: int, *, commit: bool = True) -> None:
    db.execute(delete(AgentSubagentBinding).where(AgentSubagentBinding.parent_agent_id == parent_agent_id))
    if commit:
        db.commit()
    else:
        db.flush()


def delete_subagent_bindings_by_child_agent_id(db: Session, child_agent_id: int, *, commit: bool = True) -> None:
    db.execute(delete(AgentSubagentBinding).where(AgentSubagentBinding.child_agent_id == child_agent_id))
    if commit:
        db.commit()
    else:
        db.flush()
