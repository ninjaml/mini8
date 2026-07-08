import time

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AgentSession


def _now_ms() -> int:
    return int(time.time() * 1000)


def get_agent_session(db: Session, session_id: int) -> AgentSession | None:
    return db.get(AgentSession, session_id)


def get_agent_session_by_thread_id(db: Session, thread_id: str) -> AgentSession | None:
    return db.scalar(select(AgentSession).where(AgentSession.thread_id == thread_id))


def list_agent_sessions(db: Session, agent_id: int) -> list[AgentSession]:
    return db.scalars(
        select(AgentSession)
        .where(AgentSession.agent_id == agent_id)
        .order_by(AgentSession.id.asc())
    ).all()


def list_workspace_agent_sessions_by_workspace_id(db: Session, workspace_id: int) -> list[AgentSession]:
    return db.scalars(
        select(AgentSession)
        .where(
            AgentSession.session_type == "workspace",
            AgentSession.workspace_id == workspace_id,
        )
        .order_by(AgentSession.id.asc())
    ).all()


def get_default_agent_session(db: Session, agent_id: int) -> AgentSession | None:
    return db.scalar(
        select(AgentSession).where(
            AgentSession.agent_id == agent_id,
            AgentSession.session_type == "default",
        )
    )


def get_workspace_agent_session(db: Session, agent_id: int, workspace_id: int) -> AgentSession | None:
    return db.scalar(
        select(AgentSession).where(
            AgentSession.agent_id == agent_id,
            AgentSession.session_type == "workspace",
            AgentSession.workspace_id == workspace_id,
        )
    )


def _create_agent_session(
    db: Session,
    *,
    agent_id: int,
    session_type: str,
    workspace_id: int | None,
    thread_id: str,
    persona_name: str | None,
    display_name: str,
    subagent_mode: str | None,
) -> AgentSession:
    # `subagent_mode` 是 session 级真相的一部分，所以 default / workspace session
    # 在创建时就要一并落库，而不是等运行时再临时猜。
    session = AgentSession(
        agent_id=agent_id,
        session_type=session_type,
        workspace_id=workspace_id,
        thread_id=thread_id,
        persona_name=persona_name,
        display_name=display_name,
        subagent_mode=subagent_mode,
        created_at=_now_ms(),
        updated_at=_now_ms(),
    )
    db.add(session)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if session_type == "default":
            existing = get_default_agent_session(db, agent_id)
        else:
            existing = get_workspace_agent_session(db, agent_id, workspace_id) if workspace_id is not None else None
        if existing is not None:
            return existing
        raise
    db.refresh(session)
    return session


def create_default_agent_session(
    db: Session,
    *,
    agent_id: int,
    thread_id: str,
    persona_name: str | None,
    display_name: str,
    subagent_mode: str | None = None,
) -> AgentSession:
    existing = get_default_agent_session(db, agent_id)
    if existing is not None:
        return existing
    return _create_agent_session(
        db,
        agent_id=agent_id,
        session_type="default",
        workspace_id=None,
        thread_id=thread_id,
        persona_name=persona_name,
        display_name=display_name,
        subagent_mode=subagent_mode,
    )


def create_workspace_agent_session(
    db: Session,
    *,
    agent_id: int,
    workspace_id: int,
    thread_id: str,
    persona_name: str | None,
    display_name: str,
    subagent_mode: str | None = None,
) -> AgentSession:
    existing = get_workspace_agent_session(db, agent_id, workspace_id)
    if existing is not None:
        return existing
    return _create_agent_session(
        db,
        agent_id=agent_id,
        session_type="workspace",
        workspace_id=workspace_id,
        thread_id=thread_id,
        persona_name=persona_name,
        display_name=display_name,
        subagent_mode=subagent_mode,
    )


def set_all_agent_sessions_subagent_mode(
    db: Session,
    *,
    agent_id: int,
    subagent_mode: str | None,
) -> None:
    """批量更新某个 Agent 名下全部会话的 subagent_mode。

    调用方主要是“第一个 binding 创建 / 最后一个 binding 删除”这两条编排链。
    这里故意只 ``flush`` 不 ``commit``，让上层 service 继续掌握事务边界。
    """
    sessions = list_agent_sessions(db, agent_id)
    now_ms = _now_ms()
    for agent_session in sessions:
        agent_session.subagent_mode = subagent_mode
        agent_session.updated_at = now_ms
        db.add(agent_session)
    db.flush()


def delete_agent_sessions_by_agent_id(db: Session, agent_id: int) -> None:
    db.execute(delete(AgentSession).where(AgentSession.agent_id == agent_id))
    db.commit()


def delete_agent_sessions_by_agent_id_no_commit(db: Session, agent_id: int) -> None:
    db.execute(delete(AgentSession).where(AgentSession.agent_id == agent_id))
    db.flush()


def delete_workspace_agent_session(db: Session, agent_id: int, workspace_id: int) -> None:
    db.execute(
        delete(AgentSession).where(
            AgentSession.agent_id == agent_id,
            AgentSession.session_type == "workspace",
            AgentSession.workspace_id == workspace_id,
        )
    )
    db.commit()


def delete_workspace_agent_session_no_commit(db: Session, agent_id: int, workspace_id: int) -> None:
    db.execute(
        delete(AgentSession).where(
            AgentSession.agent_id == agent_id,
            AgentSession.session_type == "workspace",
            AgentSession.workspace_id == workspace_id,
        )
    )
    db.flush()


def delete_workspace_agent_sessions_by_workspace_id(db: Session, workspace_id: int) -> None:
    db.execute(
        delete(AgentSession).where(
            AgentSession.session_type == "workspace",
            AgentSession.workspace_id == workspace_id,
        )
    )
    db.commit()


def update_agent_session(db: Session, agent_session: AgentSession) -> AgentSession:
    # 只要 session 真相发生变化（例如 persona、display_name、subagent_mode），
    # 都统一刷新 `updated_at`，避免 mode 切换在时间语义上像“没发生过”。
    agent_session.updated_at = _now_ms()
    db.add(agent_session)
    db.commit()
    db.refresh(agent_session)
    return agent_session
