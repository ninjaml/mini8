"""Agent 子代理绑定服务。"""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.repositories.agent import get_agent
from app.repositories.agent_subagent_binding import (
    create_subagent_binding,
    delete_subagent_binding,
    get_subagent_binding,
    get_subagent_binding_by_parent_and_child,
    get_subagent_binding_by_parent_and_name,
    list_subagent_bindings_by_parent_agent_id,
)
from app.repositories.agent_session import list_agent_sessions, set_all_agent_sessions_subagent_mode
from app.schemas.agent import AgentSubagentBindingRead, build_agent_subagent_binding_read
from app.services.runtime_cleanup import delete_collaborator_child_runtime_sessions
from app.services.subagent_runtime_service import build_collaborator_child_thread_id


def _serialize_binding(db: Session, binding) -> AgentSubagentBindingRead:
    child_agent = get_agent(db, binding.child_agent_id)
    return build_agent_subagent_binding_read(
        binding_id=binding.id,
        parent_agent_id=binding.parent_agent_id,
        child_agent_id=binding.child_agent_id,
        child_agent_name=child_agent.name if child_agent is not None else None,
        subagent_name=binding.subagent_name,
        description=binding.description,
        created_at=binding.created_at,
    )


def list_agent_subagent_bindings(db: Session, *, parent_agent_id: int):
    return [_serialize_binding(db, binding) for binding in list_subagent_bindings_by_parent_agent_id(db, parent_agent_id)]


def create_agent_subagent_binding(
    db: Session,
    *,
    parent_agent_id: int,
    child_agent_id: int,
    subagent_name: str,
    description: str,
):
    # 先记住创建前有没有 roster，用来判断这次是不是“第一个 binding”。
    existing_bindings = list_subagent_bindings_by_parent_agent_id(db, parent_agent_id)
    if get_agent(db, parent_agent_id) is None:
        raise ValueError("Parent agent not found")
    if get_agent(db, child_agent_id) is None:
        raise ValueError("Child agent not found")
    if parent_agent_id == child_agent_id:
        raise ValueError("Agent cannot bind itself as subagent")
    if get_subagent_binding_by_parent_and_name(
        db,
        parent_agent_id=parent_agent_id,
        subagent_name=subagent_name,
    ) is not None:
        raise ValueError("Subagent name already exists under parent agent")
    if get_subagent_binding_by_parent_and_child(
        db,
        parent_agent_id=parent_agent_id,
        child_agent_id=child_agent_id,
    ) is not None:
        raise ValueError("Child agent already bound under parent agent")
    try:
        binding = create_subagent_binding(
            db,
            parent_agent_id=parent_agent_id,
            child_agent_id=child_agent_id,
            subagent_name=subagent_name,
            description=description,
            commit=False,
        )
        if not existing_bindings:
            # 创建第一个 child roster 时，把该 parent 名下全部既有 session 自动切到 collaborator。
            set_all_agent_sessions_subagent_mode(
                db,
                agent_id=parent_agent_id,
                subagent_mode="collaborator",
            )
        db.commit()
        db.refresh(binding)
        return _serialize_binding(db, binding)
    except IntegrityError as exc:
        # service 层已经做过显式校验，但并发创建 / 库外写入时仍可能先撞到数据库约束。
        # 这里把底层约束错误重新翻译成稳定的业务错误，避免 API 直接漏出 500。
        db.rollback()
        error_text = str(getattr(exc, "orig", exc))
        if (
            ("parent_agent_id" in error_text and "child_agent_id" in error_text)
            or "uq_agent_subagent_parent_child" in error_text
        ):
            raise ValueError("Child agent already bound under parent agent") from exc
        if (
            ("parent_agent_id" in error_text and "subagent_name" in error_text)
            or "uq_agent_subagent_parent_name" in error_text
        ):
            raise ValueError("Subagent name already exists under parent agent") from exc
        if "ck_agent_subagent_not_self" in error_text:
            raise ValueError("Agent cannot bind itself as subagent") from exc
        if get_subagent_binding_by_parent_and_name(
            db,
            parent_agent_id=parent_agent_id,
            subagent_name=subagent_name,
        ) is not None:
            raise ValueError("Subagent name already exists under parent agent") from exc
        if get_subagent_binding_by_parent_and_child(
            db,
            parent_agent_id=parent_agent_id,
            child_agent_id=child_agent_id,
        ) is not None:
            raise ValueError("Child agent already bound under parent agent") from exc
        if parent_agent_id == child_agent_id:
            raise ValueError("Agent cannot bind itself as subagent") from exc
        raise ValueError("Invalid subagent binding constraint") from exc


async def delete_agent_subagent_binding(
    db: Session,
    *,
    parent_agent_id: int,
    binding_id: int,
    session_manager=None,
) -> None:
    binding = get_subagent_binding(db, binding_id)
    if binding is None or binding.parent_agent_id != parent_agent_id:
        raise ValueError("Subagent binding not found")
    is_last_binding = len(list_subagent_bindings_by_parent_agent_id(db, parent_agent_id)) == 1
    # 协作者 child 的稳定 thread_id 由 `parent session + binding` 派生；一旦数据库行删掉，
    # 后面就不好再回推出完整集合，所以要在删库前先算出来。
    collaborator_child_thread_ids = [
        build_collaborator_child_thread_id(agent_session.id, binding.id)
        for agent_session in list_agent_sessions(db, parent_agent_id)
    ]
    delete_subagent_binding(db, binding_id, commit=False)
    if is_last_binding:
        # 删掉最后一个 child roster 时，该 parent 名下所有 session 回到“无团队”状态。
        set_all_agent_sessions_subagent_mode(
            db,
            agent_id=parent_agent_id,
            subagent_mode=None,
        )
    db.commit()
    try:
        await delete_collaborator_child_runtime_sessions(
            session_manager=session_manager,
            child_thread_ids=collaborator_child_thread_ids,
        )
    except Exception as exc:
        # 这里的运行时清理是“尽力而为”的后处理。主数据库真相已经提交成功，
        # 不应再把整个解绑请求回滚成“看起来失败但其实 binding 已删掉”的状态。
        print(
            f"Warning: collaborator runtime cleanup failed after deleting binding "
            f"{binding_id} under agent {parent_agent_id}: {exc}"
        )
