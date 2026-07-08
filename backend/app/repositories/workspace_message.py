import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import WorkspaceMessage


def _now_ms() -> int:
    return int(time.time() * 1000)


def create_workspace_message(
    db: Session,
    *,
    workspace_id: int,
    type: str,
    content: str,
    request_id: int | None = None,
    agent_session_id: int | None = None,
    agent_id: int | None = None,
    agent_name_snapshot: str | None = None,
    thread_id: str | None = None,
    group_id: str | None = None,
) -> WorkspaceMessage:
    message = WorkspaceMessage(
        workspace_id=workspace_id,
        type=type,
        content=content,
        created_at=_now_ms(),
        request_id=request_id,
        agent_session_id=agent_session_id,
        agent_id=agent_id,
        agent_name_snapshot=agent_name_snapshot,
        thread_id=thread_id,
        group_id=group_id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def list_workspace_messages(
    db: Session,
    workspace_id: int,
    *,
    limit: int | None = None,
    before_id: int | None = None,
) -> list[WorkspaceMessage]:
    stmt = select(WorkspaceMessage).where(WorkspaceMessage.workspace_id == workspace_id)
    if before_id is not None:
        stmt = stmt.where(WorkspaceMessage.id < before_id)

    if limit is not None:
        stmt = stmt.order_by(WorkspaceMessage.created_at.desc(), WorkspaceMessage.id.desc()).limit(limit)
        messages = list(db.scalars(stmt).all())
        messages.reverse()
        return messages

    stmt = stmt.order_by(WorkspaceMessage.created_at.asc(), WorkspaceMessage.id.asc())
    return db.scalars(stmt).all()



def delete_workspace_messages_by_workspace_id(db: Session, workspace_id: int) -> None:
    db.execute(delete(WorkspaceMessage).where(WorkspaceMessage.workspace_id == workspace_id))
    db.commit()


