"""Agent 生命周期编排服务。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.repositories.agent import delete_agent_no_commit, get_agent
from app.repositories.agent_session import (
    delete_agent_sessions_by_agent_id_no_commit,
    list_agent_sessions,
)
from app.repositories.agent_subagent_binding import (
    delete_subagent_bindings_by_child_agent_id,
    delete_subagent_bindings_by_parent_agent_id,
    list_subagent_bindings_by_child_agent_id,
    list_subagent_bindings_by_parent_agent_id,
)
from app.repositories.agent_workspace_binding import delete_workspace_bindings_by_agent_id_no_commit
from app.services.runtime_cleanup import (
    delete_agent_runtime_artifacts,
    delete_agent_runtime_sessions,
    delete_collaborator_child_runtime_sessions,
)
from app.services.subagent_runtime_service import build_collaborator_child_thread_id


async def delete_agent_with_relations(
    *,
    db: Session,
    agent_id: int,
    session_manager,
) -> None:
    agent = get_agent(db, agent_id)
    if agent is None:
        raise ValueError("Agent not found")

    agent_sessions = list_agent_sessions(db, agent_id)
    thread_ids = [agent_session.thread_id for agent_session in agent_sessions]
    # 删整个 Agent 时，要同时考虑它在子代理图里的两种身份：
    # - outgoing_bindings：它把别人挂成 child，自己是 parent
    # - incoming_bindings：别人把它挂成 child，它自己是 child
    outgoing_bindings = list_subagent_bindings_by_parent_agent_id(db, agent_id)
    incoming_bindings = list_subagent_bindings_by_child_agent_id(db, agent_id)
    collaborator_child_thread_ids = [
        build_collaborator_child_thread_id(agent_session.id, binding.id)
        for agent_session in agent_sessions
        for binding in outgoing_bindings
    ]
    # 如果当前 Agent 还被别的 parent 当作 child 使用，也要把那些 parent session 下
    # 为它派生出来的 collaborator memory 一并找出来清掉。
    for binding in incoming_bindings:
        collaborator_child_thread_ids.extend(
            build_collaborator_child_thread_id(parent_session.id, binding.id)
            for parent_session in list_agent_sessions(db, binding.parent_agent_id)
        )

    try:
        # 先提交数据库真相：关系、session、agent 主记录都删干净。
        # runtime cleanup 放在后面做，避免运行时异常把数据库留在半删状态。
        delete_subagent_bindings_by_parent_agent_id(db, agent_id, commit=False)
        # 删除 Agent 本体时，默认一并清理“别人把它当作子代理”的引用关系。
        delete_subagent_bindings_by_child_agent_id(db, agent_id, commit=False)
        delete_agent_sessions_by_agent_id_no_commit(db, agent_id)
        delete_workspace_bindings_by_agent_id_no_commit(db, agent_id)
        delete_agent_no_commit(db, agent_id)
        db.commit()
    except Exception:
        db.rollback()
        raise

    try:
        await delete_agent_runtime_sessions(db, agent_id, session_manager, thread_ids=thread_ids)
        await delete_collaborator_child_runtime_sessions(
            session_manager=session_manager,
            child_thread_ids=collaborator_child_thread_ids,
        )
        await delete_agent_runtime_artifacts(agent_id, session_manager)
    except Exception as exc:
        # 到这里数据库删除已经成功；runtime 清理失败只记 warning，避免把请求表面上
        # 变成“删除失败”，但实际主记录已经不存在。
        print(f"Warning: runtime cleanup failed after deleting agent {agent_id}: {exc}")
