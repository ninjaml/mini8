import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings as camphor_settings
from deepagents_webapi.agent import create_agent_with_config
from app.services.session_runtime_service import resolve_runtime_spec_for_connection
from app.services.subagent_runtime_service import create_runtime_agent_for_session
from deepagents_webapi.config import SessionState, create_model, create_model_for_agent, settings, AgentModelNotConfiguredError
from deepagents_webapi.tools import fetch_url, http_request, web_search
from deepagents_webapi.tunnel.client import get_active_tunnel_client
from deepagents_webapi.web_execution import execute_task_streaming

if TYPE_CHECKING:
    from deepagents_webapi.session.session_manager import AsyncSessionManager

router = APIRouter()

session_manager: Optional["AsyncSessionManager"] = None
# 每个 thread 只保留一条活跃的 WS 连接，重连时新连接替换旧连接。
active_connections: dict[str, dict] = {}


def set_session_manager(manager: "AsyncSessionManager"):
    global session_manager
    session_manager = manager


async def report_thread_status(thread_id: str, status: str, run_id: str) -> None:
    """Best-effort relay status reporting for busy/idle tracking.

    本地直连模式下没有 Tunnel Client，这里会自动降级为 no-op。
    """
    client = get_active_tunnel_client()
    if not client:
        return

    try:
        future = client.submit_thread_status(
            thread_id=thread_id,
            status=status,
            run_id=run_id,
        )
        if future is None:
            return
    except Exception as e:
        print(f"[ThreadStatus] report failed: thread_id={thread_id}, status={status}, error={e}")


def check_model_multimodal(agent_name: str) -> bool:
    """Check whether the agent's configured model supports multimodal input."""
    agents_dir = settings.user_deepagents_dir
    agent_config_path = agents_dir / agent_name / "model_config.json"

    if not agent_config_path.exists():
        return False

    try:
        with open(agent_config_path, "r", encoding="utf-8") as f:
            config = json.load(f)

        provider = config.get("provider", "")
        multimodal_providers = ["kimi", "qwen"]
        return provider in multimodal_providers
    except Exception:
        return False


@router.websocket("/api/runtime/chat/{thread_id}/stream")
async def chat_stream(websocket: WebSocket, thread_id: str):
    """WebSocket streaming chat endpoint, one URL per thread.

    这一层既负责维持 thread 的长连接，也负责把 thread 的执行状态
    通过 Tunnel 上报给 Gateway，用于后续 busy/idle 感知。
    """
    if not session_manager:
        await websocket.close(code=1011, reason="Session manager not initialized")
        return

    if not await session_manager.session_exists(thread_id):
        await websocket.close(code=1008, reason="Session not found")
        return

    # 同一个 thread 重连时，用新连接替换旧连接，避免一个 thread 挂多条 WS。
    is_reconnect = thread_id in active_connections
    if is_reconnect:
        old_conn = active_connections.pop(thread_id)
        try:
            await old_conn["websocket"].close(code=1001, reason="Replaced by new connection")
        except Exception:
            pass

    await websocket.accept()
    active_connections[thread_id] = {
        "websocket": websocket,
        "connected_at": datetime.now().timestamp(),
    }

    # 当前正在执行的 run_id，用于异常或断连时补发 idle 状态。
    current_run_id: str | None = None

    try:
        import sys
        sys.stderr.write(f"DEBUG: chat_stream started for thread_id={thread_id}\n")
        sys.stderr.flush()

        # 第一帧既可能是配置，也可能直接就是用户消息。
        init_data = await websocket.receive_json()
        sys.stderr.write(f"DEBUG: received init_data\n")
        sys.stderr.flush()
        if "message" in init_data:
            auto_approve = init_data.get("auto_approve", True)
            first_message = init_data
            print(f"[DEBUG] first packet is user message, auto_approve={auto_approve}")
        else:
            auto_approve = init_data.get("auto_approve", True)
            first_message = None
            print(f"[DEBUG] received config packet, auto_approve={auto_approve}")

        agent_name = None
        if session_manager:
            agent_name = await session_manager.get_session_agent_name(thread_id)
        sys.stderr.write(f"DEBUG: agent_name={agent_name}\n")
        sys.stderr.flush()
        if not agent_name:
            await websocket.send_json({"type": "error", "content": "Session agent is missing"})
            return

        try:
            sys.stderr.write(f"DEBUG: calling create_model_for_agent\n")
            sys.stderr.flush()
            model = create_model_for_agent(agent_name)
            sys.stderr.write(f"DEBUG: create_model_for_agent succeeded\n")
            sys.stderr.flush()
        except AgentModelNotConfiguredError as e:
            sys.stderr.write(f"DEBUG: agent model not configured: {e}\n")
            sys.stderr.flush()
            await websocket.send_json({
                "type": "error",
                "content": str(e),
                "code": "AGENT_MODEL_NOT_CONFIGURED"
            })
            return
        except RuntimeError as e:
            sys.stderr.write(f"DEBUG: create_model_for_agent failed: {e}\n")
            sys.stderr.flush()
            print(f"Warning: failed to use agent config for '{agent_name}': {e}")
            print("   fallback to global model config")
            model = create_model()

        tools = [http_request, fetch_url]
        if settings.has_tavily:
            tools.append(web_search)

        checkpointer = None
        if session_manager:
            checkpointer = await session_manager.create_sqlite_saver()

        spec = None
        prompt_overlay = None
        scope_context = None
        skill_source_dirs = None
        if agent_name == "moss":
            working_dir = await session_manager.get_session_working_dir(thread_id) if session_manager else None
            if not working_dir:
                working_dir = str(camphor_settings.MOSS_WORK_DIR)
        else:
            spec = resolve_runtime_spec_for_connection(thread_id=thread_id, init_data=init_data)
            working_dir = spec.working_dir
            prompt_overlay = spec.prompt_overlay
            scope_context = (
                "\n".join(f"- {key}: {value}" for key, value in spec.runtime_context_entries)
                if spec.runtime_context_entries
                else None
            )
            skill_source_dirs = spec.skill_source_dirs

        if agent_name == "moss":
            agent, composite_backend = create_agent_with_config(
                model,
                agent_name,
                tools,
                thread_id=thread_id,
                checkpointer=checkpointer,
                working_dir=working_dir,
                base_agent_dir=camphor_settings.RUNTIME_MOSS_DIR,
                prompt_overlay=prompt_overlay,
                scope_context=scope_context,
                skill_source_dirs=skill_source_dirs,
            )
        else:
            from app.core.database import SessionLocal

            with SessionLocal() as db:
                agent, composite_backend = create_runtime_agent_for_session(
                    db=db,
                    model=model,
                    agent_name=agent_name,
                    tools=tools,
                    checkpointer=checkpointer,
                    parent_runtime_spec=spec,
                    # 聊天 live path 也要把 session_manager 继续传下去；
                    # 协作者 child 若要接回持久 memory，需要在运行时装配层拿到它。
                    session_manager=session_manager,
                )

        session_state = SessionState(auto_approve=auto_approve, no_splash=True)
        session_state.thread_id = thread_id
        is_multimodal = check_model_multimodal(agent_name)

        await websocket.send_json(
            {
                "type": "ready",
                "content": "Agent initialized, ready to receive messages",
                "thread_id": thread_id,
                "working_dir": working_dir,
                "is_multimodal": is_multimodal,
            }
        )

        # 普通消息都先进入队列，再由主循环串行消费。
        message_queue: asyncio.Queue = asyncio.Queue()
        if first_message:
            message_text = first_message.get("message")
            attachments = first_message.get("attachments")
            if message_text:
                await message_queue.put({"text": message_text, "attachments": attachments})
                print(f"[DEBUG] first user message queued: {message_text}")

        # HITL 响应走独立队列，避免和普通用户消息混在一起。
        hitl_queue: asyncio.Queue = asyncio.Queue()
        interrupt_flag = {"interrupted": False, "user_stopped": False}

        async def receive_messages():
            """持续接收前端消息，并按消息类型分发到对应控制流。"""
            try:
                while True:
                    data = await websocket.receive_json()
                    msg_type = data.get("type")

                    if msg_type == "ping":
                        # ping/pong 只停留在 WS 控制层，不进入 agent 执行队列。
                        await websocket.send_json({"type": "pong"})
                    elif msg_type == "stop":
                        interrupt_flag["interrupted"] = True
                        interrupt_flag["user_stopped"] = True
                    elif msg_type == "config_update":
                        if "auto_approve" in data:
                            session_state.auto_approve = data["auto_approve"]
                    elif msg_type == "hitl_response":
                        await hitl_queue.put(data.get("hitl_response", {}))
                    elif "message" in data:
                        # 优先处理消息
                        message = data.get("message")
                        attachments = data.get("attachments")
                        if message:
                            await message_queue.put({"text": message, "attachments": attachments})
                        # 同时处理 auto_approve 配置
                        if "auto_approve" in data:
                            session_state.auto_approve = data["auto_approve"]
                    elif "auto_approve" in data and msg_type is None:
                        # 只有 auto_approve，没有 message
                        session_state.auto_approve = data["auto_approve"]
                        await websocket.send_json(
                            {
                                "type": "ready",
                                "content": "Agent initialized, ready to receive messages",
                                "thread_id": thread_id,
                                "working_dir": working_dir,
                                "is_multimodal": is_multimodal,
                            }
                        )
            except WebSocketDisconnect as e:
                print(f"[WebSocket] Client disconnected in receive_messages - thread_id={thread_id}, code={getattr(e, 'code', 'unknown')}, reason={getattr(e, 'reason', 'unknown')}")
                await message_queue.put(None)
            except Exception as e:
                print(f"[WebSocket] Exception in receive_messages - thread_id={thread_id}, error={e}")
                await message_queue.put(None)

        receive_task = asyncio.create_task(receive_messages())

        # 主循环一次只处理一条消息；新的消息到来时，会中断当前执行。
        while True:
            try:
                run_id = None
                message = await message_queue.get()
                if message is None:
                    break

                if not message_queue.empty():
                    await websocket.send_json(
                        {
                            "type": "interrupted",
                            "content": "Skipped due to newer message in queue",
                        }
                    )
                    continue

                interrupt_flag["interrupted"] = False
                interrupt_flag["user_stopped"] = False

                if isinstance(message, dict):
                    user_input = message["text"]
                else:
                    user_input = message

                if session_manager:
                    repaired = await session_manager.repair_incomplete_tool_call_checkpoint(thread_id)
                    if repaired:
                        print(f"[WebSocket] Repaired incomplete tool_call checkpoint - thread_id={thread_id}")

                # 进入真正执行区前先生成 run_id 并上报 running。
                run_id = uuid.uuid4().hex
                current_run_id = run_id
                await report_thread_status(thread_id, "running", run_id)

                attachments_payload = []
                user_event_id = None
                if isinstance(message, dict):
                    attachments_payload = [
                        {
                            "type": attachment.get("type"),
                            "url": attachment.get("data"),
                        }
                        for attachment in (message.get("attachments") or [])
                    ]

                if session_manager:
                    await session_manager.update_session_preview(thread_id, user_input)
                    user_event_id = await session_manager.append_session_event(
                        thread_id=thread_id,
                        group_id=run_id,
                        event_type="user",
                        content=user_input,
                        metadata={
                            "group_id": run_id,
                            "namespace": ["root"],
                            "namespace_key": "root",
                            "subagent_invocation_id": None,
                        },
                        attachments=attachments_payload,
                    )

                async for chunk in execute_task_streaming(
                    message,
                    agent,
                    agent_name,
                    session_state,
                    is_multimodal=is_multimodal,
                    backend=composite_backend,
                    interrupt_flag=interrupt_flag,
                    message_queue=message_queue,
                    hitl_queue=hitl_queue,
                    session_manager=session_manager,
                    run_id=run_id,
                    user_event_id=user_event_id,
                ):
                    if not message_queue.empty() or interrupt_flag.get("interrupted"):
                        interrupt_flag["interrupted"] = True

                        if not interrupt_flag.get("user_stopped"):
                            await websocket.send_json(
                                {
                                    "type": "interrupted",
                                    "content": "Task interrupted by new message",
                                }
                            )

                        try:
                            if session_manager:
                                await session_manager.repair_incomplete_tool_call_checkpoint(
                                    session_state.thread_id
                                )
                        except Exception as e:
                            print(f"Warning: Failed to repair interrupted agent state: {e}")

                        break

                    await websocket.send_json(chunk)

                # 无论是正常完成还是被中断，只要离开执行区就恢复 idle。
                await report_thread_status(thread_id, "idle", run_id)
                current_run_id = None

                if not interrupt_flag["interrupted"]:
                    await websocket.send_json(
                        {
                            "type": "done",
                            "content": "Task completed",
                        }
                    )

            except Exception as e:
                if current_run_id:
                    await report_thread_status(thread_id, "idle", current_run_id)
                    current_run_id = None
                # 移除可能导致编码问题的 emoji 字符
                error_msg = str(e).replace("⚠️", "WARNING").replace("✅", "OK").replace("❌", "ERROR")
                await websocket.send_json({"type": "error", "content": error_msg})

    except WebSocketDisconnect as e:
        print(f"[WebSocket] Main handler - Client disconnected - thread_id={thread_id}, code={getattr(e, 'code', 'unknown')}, reason={getattr(e, 'reason', 'unknown')}")
        pass
    except Exception as e:
        print(f"[WebSocket] Main handler - Exception occurred - thread_id={thread_id}, error={e}")
        try:
            # 移除可能导致编码问题的 emoji 字符
            error_msg = str(e).replace("⚠️", "WARNING").replace("✅", "OK").replace("❌", "ERROR")
            await websocket.send_json({"type": "error", "content": f"Server error: {error_msg}"})
        except Exception:
            pass
    finally:
        # 如果连接断开时仍残留一个运行中的 run_id，补发一次 idle，避免 Gateway 长期误判 busy。
        if current_run_id:
            await report_thread_status(thread_id, "idle", current_run_id)

        print(f"[WebSocket] Cleaning up connection - thread_id={thread_id}")

        if "receive_task" in locals():
            receive_task.cancel()
            try:
                await receive_task
            except asyncio.CancelledError:
                pass

        active_connections.pop(thread_id, None)
        print(f"[WebSocket] Connection removed from active_connections - thread_id={thread_id}")
        try:
            await websocket.close()
            print(f"[WebSocket] WebSocket closed - thread_id={thread_id}")
        except Exception as e:
            print(f"[WebSocket] Error closing websocket - thread_id={thread_id}, error={e}")
            pass
