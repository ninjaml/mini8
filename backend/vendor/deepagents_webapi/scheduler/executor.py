"""Headless agent execution for cron jobs (no WebSocket)."""

import asyncio
import uuid
from typing import TYPE_CHECKING, Any, List, Optional

from deepagents_webapi.agent import create_agent_with_config
from deepagents_webapi.config import SessionState, create_model_for_agent, settings
from deepagents_webapi.tools import fetch_url, http_request, web_search
from deepagents_webapi.web_execution import execute_task_streaming

if TYPE_CHECKING:
    from deepagents_webapi.session.session_manager import AsyncSessionManager


async def execute_headless(
    agent_name: str,
    prompt: str,
    thread_id: str,
    working_dir: Optional[str] = None,
    session_manager: Optional["AsyncSessionManager"] = None,
) -> List[dict[str, Any]]:
    """Execute an agent without WebSocket and collect all output chunks.

    This reconstructs the same execution chain as ``chat.py`` but without
    any WebSocket, message_queue or hitl_queue interaction.

    Args:
        agent_name: The agent identifier (e.g. "moss" or "workagent-3").
        prompt: The user message to send to the agent.
        thread_id: Fixed thread_id for this cron job (checkpoint persistence).
        working_dir: Working directory; falls back to project root.
        session_manager: For checkpoint repair and event persistence.

    Returns:
        List of yield chunks (dicts with type/content/metadata).
    """
    # 1. Repair incomplete tool_call tail from prior interrupted runs
    if session_manager is not None:
        await session_manager.repair_incomplete_tool_call_checkpoint(thread_id)

    # 2. Model + tools (same as chat.py)
    model = create_model_for_agent(agent_name)
    tools: List[Any] = [http_request, fetch_url]
    if settings.has_tavily:
        tools.append(web_search)

    # 3. Checkpointer (SQLite checkpoint saver)
    checkpointer = None
    if session_manager is not None:
        checkpointer = await session_manager.create_sqlite_saver()

    # 4. Agent graph assembly
    if working_dir is None:
        working_dir = str(
            settings.project_root or settings.user_deepagents_dir.parent
        )
    agent, composite_backend = create_agent_with_config(
        model,
        agent_name,
        tools,
        thread_id=thread_id,
        checkpointer=checkpointer,
        working_dir=working_dir,
    )

    # 5. Session state — headless = auto_approve everything
    session_state = SessionState(auto_approve=True, no_splash=True)
    session_state.thread_id = thread_id

    # 6. Dummy compatibility objects for execute_task_streaming
    dummy_queue: asyncio.Queue[Any] = asyncio.Queue()
    dummy_flag = {"interrupted": False, "user_stopped": False}
    run_id = uuid.uuid4().hex

    # 7. Execute and collect
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
        user_event_id=None,
    ):
        results.append(chunk)

    return results