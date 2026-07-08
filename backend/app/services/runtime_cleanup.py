"""
运行时清理服务。

当前文件只负责清理 Agent 运行时残留：
1. runtime_agents 下该 Agent 的运行时脚手架目录
2. 已知 thread_id 对应的 runtime session

注意：
- 这里清理的是 Agent 自身的默认运行态，不是 agent + workspace 作用域会话。
- 这里不会删除任何工作目录；工作目录视为用户数据，不视为可自动回收的临时产物。
- 若未来需要按 workspace 维度清理 scoped session / scoped work dir，应在 session 层另做专门入口，
  不要继续把多种语义混进这个文件。
"""

import shutil

from sqlalchemy.orm import Session

from deepagents_webapi.session.session_manager import AsyncSessionManager

from app.core.config import settings
from app.repositories.agent_session import (
    get_workspace_agent_session,
    list_agent_sessions,
    list_workspace_agent_sessions_by_workspace_id,
)
from app.repositories.agent_subagent_binding import list_subagent_bindings_by_parent_agent_id
from app.services.session_runtime_service import (
    build_agent_default_thread_id,
    resolve_agent_base_dir,
)
from app.services.subagent_runtime_service import build_collaborator_child_thread_id


def build_agent_thread_id(agent_id: int) -> str:
    """返回 Agent default session 使用的 thread_id。

    这个函数现在只是对 ``build_agent_default_thread_id()`` 的轻包装，
    保留它主要是为了让“清理默认运行态”这层语义更直白。
    """
    return build_agent_default_thread_id(agent_id)


async def delete_agent_runtime_artifacts(
    agent_id: int,
    session_manager: AsyncSessionManager | None,
) -> None:
    """
    删除 Agent 默认运行态的平台残留。

    清理范围固定为默认运行态：
    - runtime scaffold 目录：`runtime_agents/agent-{id}`
    设计边界：
    - 不负责删除任何 runtime session；session 清理由专门函数负责
    - 不负责删除 workspace 共享 working_dir
    - 不负责删除任何默认或自定义工作目录
    - 不负责数据库中的绑定关系
    """
    # 删除 runtime/context 在本地生成的 agent 脚手架目录。
    runtime_agent_dir = resolve_agent_base_dir(agent_id)
    if runtime_agent_dir.exists():
        shutil.rmtree(runtime_agent_dir, ignore_errors=True)

    _ = session_manager


async def delete_workspace_runtime_session(
    db: Session,
    agent_id: int,
    workspace_id: int,
    session_manager: AsyncSessionManager | None,
) -> None:
    """删除单个 agent + workspace 稳定会话对应的 vendor runtime session。

    这里只删除 vendor session，不删除：
    - AgentSession 数据库行
    - workspace 绑定关系
    - workspace_message
    - workspace 共享 working_dir
    """
    if session_manager is None:
        return
    agent_session = get_workspace_agent_session(db, agent_id, workspace_id)
    if agent_session is not None:
        # workspace session 被删掉时，它在协作者模式下派生出来的 child checkpoints
        # 也要一起清掉；否则 parent session 没了，child 记忆还会残留。
        bindings = list_subagent_bindings_by_parent_agent_id(db, agent_id)
        child_thread_ids = [
            build_collaborator_child_thread_id(agent_session.id, binding.id)
            for binding in bindings
        ]
        await delete_collaborator_child_runtime_sessions(
            session_manager=session_manager,
            child_thread_ids=child_thread_ids,
        )
        await session_manager.delete_session(agent_session.thread_id)


async def delete_workspace_runtime_sessions(
    db: Session,
    workspace_id: int,
    session_manager: AsyncSessionManager | None,
) -> None:
    """删除某个 workspace 下所有稳定 workspace session 对应的 vendor runtime session。

    这里只清理运行时 session 残留，不触碰数据库关系，也不删除 workspace.working_dir。
    """
    if session_manager is None:
        return
    for agent_session in list_workspace_agent_sessions_by_workspace_id(db, workspace_id):
        # 批量删 workspace runtime 时，同样要先按每个 workspace session 派生出
        # 对应的 collaborator child thread，再做 checkpoint 清理。
        bindings = list_subagent_bindings_by_parent_agent_id(db, agent_session.agent_id)
        child_thread_ids = [
            build_collaborator_child_thread_id(agent_session.id, binding.id)
            for binding in bindings
        ]
        await delete_collaborator_child_runtime_sessions(
            session_manager=session_manager,
            child_thread_ids=child_thread_ids,
        )
        await session_manager.delete_session(agent_session.thread_id)


async def delete_agent_runtime_sessions(
    db: Session,
    agent_id: int,
    session_manager: AsyncSessionManager | None,
    *,
    thread_ids: list[str] | None = None,
) -> None:
    """删除某个 agent 旗下全部稳定 session 对应的 vendor runtime session。

    包括 default session 与各个 workspace session 的 vendor runtime session。
    不负责删除 Agent、本地 base 目录或任何 workspace 自有数据。
    """
    # 注意：这里只删 parent session 自己的 runtime。collaborator child 的清理由
    # 生命周期编排层单独完成，避免这里在不知道完整 binding 上下文时误删或漏删。
    if session_manager is None:
        return
    resolved_thread_ids = thread_ids
    if resolved_thread_ids is None:
        resolved_thread_ids = [agent_session.thread_id for agent_session in list_agent_sessions(db, agent_id)]
    for thread_id in resolved_thread_ids:
        await session_manager.delete_session(thread_id)


async def delete_collaborator_child_runtime_sessions(
    *,
    session_manager: AsyncSessionManager | None,
    child_thread_ids: list[str] | None,
) -> None:
    """删除协作者子 Agent 的持久 checkpoint。

    这些 child thread 不是产品级 AgentSession，因此只清 checkpoint / writes，
    不要求存在 session_metadata。
    """
    if session_manager is None or not child_thread_ids:
        return

    seen: set[str] = set()
    for thread_id in child_thread_ids:
        # 不同清理路径可能会汇总出重复 thread_id；这里先去重，避免重复打删除请求。
        if not thread_id or thread_id in seen:
            continue
        seen.add(thread_id)
        await session_manager.delete_session_checkpoints(thread_id)

