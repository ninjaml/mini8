"""定时任务使用的无界面执行入口。"""

import asyncio
import uuid
from typing import TYPE_CHECKING, Any, List, Optional

from app.core.config import settings as camphor_settings
from deepagents_webapi.agent import create_agent_with_config
from deepagents_webapi.config import SessionState, create_model_for_agent, settings
from deepagents_webapi.tools import fetch_url, http_request, web_search
from deepagents_webapi.web_execution import execute_task_streaming
from app.core.database import SessionLocal
from app.services.subagent_runtime_service import create_runtime_agent_for_session

if TYPE_CHECKING:
    from deepagents_webapi.session.session_manager import AsyncSessionManager


def resolve_runtime_spec_by_agent_session_id(*, agent_session_id: int, primary_key: str | None):
    """延迟解析 AgentSession 对应的运行时规格，避免循环依赖。"""
    from app.services.session_runtime_service import (
        resolve_runtime_spec_by_agent_session_id as _resolve_runtime_spec_by_agent_session_id,
    )

    return _resolve_runtime_spec_by_agent_session_id(
        agent_session_id=agent_session_id,
        primary_key=primary_key,
    )


def resolve_primary_key_by_agent_session_id(*, agent_session_id: int):
    """延迟解析 AgentSession 对应的运行时主键，避免循环依赖。"""
    from app.services.session_runtime_service import (
        resolve_primary_key_by_agent_session_id as _resolve_primary_key_by_agent_session_id,
    )

    return _resolve_primary_key_by_agent_session_id(
        agent_session_id=agent_session_id,
    )


async def execute_headless(
    agent_name: str,
    prompt: str,
    thread_id: str,
    agent_session_id: int | None = None,
    working_dir: Optional[str] = None,
    session_manager: Optional["AsyncSessionManager"] = None,
) -> List[dict[str, Any]]:
    """
    以 headless 方式执行一次 agent。

    这里复用 chat 执行链，但不依赖 WebSocket，也不会等待人工审批。
    """
    # 修复上一次异常中断后可能残留的 tool_call 状态。
    if session_manager is not None:
        await session_manager.repair_incomplete_tool_call_checkpoint(thread_id)

    # 模型和基础工具集与 chat 模式保持一致。
    model = create_model_for_agent(agent_name)
    tools: List[Any] = [http_request, fetch_url]
    if settings.has_tavily:
        tools.append(web_search)

    # 使用同一套 SQLite checkpoint 机制保存执行状态。
    checkpointer = None
    if session_manager is not None:
        checkpointer = await session_manager.create_sqlite_saver()

    # 组装运行时 agent 配置。
    if working_dir is None:
        working_dir = str(
            settings.project_root or settings.user_deepagents_dir.parent
        )
    spec = None
    if agent_session_id is not None:
        # 普通 Agent 任务以 AgentSession 解析出来的 runtime spec 为准。
        resolved_primary_key = resolve_primary_key_by_agent_session_id(
            agent_session_id=agent_session_id,
        )
        spec = resolve_runtime_spec_by_agent_session_id(
            agent_session_id=agent_session_id,
            primary_key=resolved_primary_key,
        )
        working_dir = spec.working_dir
    base_agent_dir = spec.base_agent_dir if spec else camphor_settings.RUNTIME_MOSS_DIR
    skill_source_dirs = spec.skill_source_dirs if spec else []
    if spec is None:
        # 没有普通 AgentSession runtime spec，说明这次执行不走普通 Agent
        # 的平台运行时装配链；典型情况就是 moss，因此继续沿用旧的
        # create_agent_with_config(...) 直建路径。
        agent, composite_backend = create_agent_with_config(
            model,
            agent_name,
            tools,
            thread_id=thread_id,
            checkpointer=checkpointer,
            working_dir=working_dir,
            base_agent_dir=base_agent_dir,
            prompt_overlay=None,
            scope_context=None,
            skill_source_dirs=skill_source_dirs,
        )
    else:
        # 能解析出普通 Agent 的 SessionRuntimeSpec，说明这次执行属于平台
        # 普通 Agent，会话级 working_dir / prompt_overlay / skills / subagents
        # 都应按这份 spec 组装，因此走 create_runtime_agent_for_session(...)。
        with SessionLocal() as db:
            agent, composite_backend = create_runtime_agent_for_session(
                db=db,
                model=model,
                agent_name=agent_name,
                tools=tools,
                checkpointer=checkpointer,
                parent_runtime_spec=spec,
                thread_id=thread_id,
                # cron 普通 Agent 分支也要把 session_manager 往下传；
                # 协作者 child 若要接回持久 memory，同样依赖这条链。
                session_manager=session_manager,
            )

    # headless 模式下默认自动批准所有 HITL 请求。
    session_state = SessionState(auto_approve=True, no_splash=True)
    session_state.thread_id = thread_id

    # 为复用 execute_task_streaming() 准备占位对象。
    dummy_queue: asyncio.Queue[Any] = asyncio.Queue()
    dummy_flag = {"interrupted": False, "user_stopped": False}
    # 这次执行的 run_id，后续会作为历史事件的 group_id。
    run_id = uuid.uuid4().hex
    user_event_id = None
    if session_manager is not None:
        user_event_id = await session_manager.append_session_event(
            thread_id=thread_id,
            group_id=run_id,
            event_type="user",
            content=prompt,
            metadata={
                "group_id": run_id,
                "namespace": ["root"],
                "namespace_key": "root",
                "subagent_invocation_id": None,
            },
        )

    # 收集流式执行过程中产出的 chunk。
    results: List[dict[str, Any]] = []
    async for chunk in execute_task_streaming(
        {"text": prompt},
        agent,
        agent_name,
        session_state,
        is_multimodal=False,
        backend=composite_backend,
        interrupt_flag=dummy_flag,
        message_queue=dummy_queue,
        hitl_queue=None,
        session_manager=session_manager,
        run_id=run_id,
        user_event_id=user_event_id,
    ):
        results.append(chunk)

    return results
