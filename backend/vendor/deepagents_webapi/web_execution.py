"""Web-adapted task execution with streaming support."""

import asyncio
import json
from typing import Any, AsyncGenerator, Optional

from langchain.agents.middleware.human_in_the_loop import HITLRequest
from langchain_core.messages import HumanMessage, ToolMessage
from pydantic import TypeAdapter

from deepagents_webapi.config import SessionState
from deepagents_webapi.file_ops import FileOpTracker

_HITL_REQUEST_ADAPTER = TypeAdapter(HITLRequest)


async def execute_task_streaming(
    user_input: str | dict,  # dict 时包含 {"text": str, "attachments": list | None}
    agent,
    assistant_id: str | None,
    session_state: SessionState,
    is_multimodal: bool = False,
    backend=None,
    interrupt_flag: dict | None = None,
    message_queue: asyncio.Queue | None = None,
    hitl_queue: asyncio.Queue | None = None,
    session_manager=None,
    run_id: Optional[str] = None,
    user_event_id: Optional[int] = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    执行任务并通过异步生成器流式返回结果。

    每个 yield 的字典格式:
    {
        "type": "text" | "tool_call" | "tool_result" | "thinking" | "error" | "hitl_request",
        "content": str,
        "metadata": dict (可选)
    }
    """

    # 解析输入：支持 dict（含附件）和纯字符串两种格式
    if isinstance(user_input, dict):
        final_input = user_input["text"]
        attachments = user_input.get("attachments") or []
    else:
        final_input = user_input
        attachments = []

    config = {
        "configurable": {"thread_id": session_state.thread_id},
        "metadata": {"assistant_id": assistant_id} if assistant_id else {},
    }

    file_op_tracker = FileOpTracker(assistant_id=assistant_id, backend=backend)

    async def persist_event(
        event_type: str,
        content: str,
        *,
        metadata: Optional[dict[str, Any]] = None,
        attachments_payload: Optional[list[dict[str, Any]]] = None,
        message_index: Optional[int] = None,
    ) -> Optional[int]:
        if not session_manager or not run_id:
            return None
        return await session_manager.append_session_event(
            thread_id=session_state.thread_id,
            group_id=run_id,
            event_type=event_type,
            content=content,
            metadata=metadata,
            attachments=attachments_payload,
            message_index=message_index,
        )

    pending_thinking_parts: list[str] = []
    pending_assistant_parts: list[str] = []

    async def flush_pending_text_events() -> None:
        nonlocal pending_thinking_parts, pending_assistant_parts
        if pending_thinking_parts:
            await persist_event("thinking", "".join(pending_thinking_parts))
            pending_thinking_parts = []
        if pending_assistant_parts:
            await persist_event("assistant", "".join(pending_assistant_parts))
            pending_assistant_parts = []

    # 跟踪已显示的工具调用
    displayed_tool_ids = set()
    tool_call_buffers: dict[str | int, dict] = {}

    # 构造流式输入：根据 is_multimodal 决定消息格式
    if is_multimodal:
        content_parts = []
        for att in attachments:
            if att["type"] == "image":
                content_parts.append({"type": "image_url", "image_url": {"url": att["data"]}})
            elif att["type"] == "video":
                content_parts.append({"type": "video_url", "video_url": {"url": att["data"]}})
        content_parts.append({"type": "text", "text": final_input})
        stream_input = {"messages": [{"role": "user", "content": content_parts}]}
    else:
        stream_input = {"messages": [{"role": "user", "content": final_input}]}

    try:
        while True:
            interrupt_occurred = False
            pending_interrupts: dict[str, HITLRequest] = {}

            # 检查是否被中断
            if interrupt_flag and interrupt_flag.get("interrupted"):
                yield {
                    "type": "system",
                    "content": "Task interrupted by new message"
                }
                return

            async for chunk in agent.astream(
                stream_input,
                stream_mode=["messages", "updates"],
                subgraphs=True,
                config=config,
                durability="exit",
            ):
                if not isinstance(chunk, tuple) or len(chunk) != 3:
                    continue

                # 在处理每个 chunk 前检查中断
                if interrupt_flag and interrupt_flag.get("interrupted"):
                    return

                _namespace, current_stream_mode, data = chunk

                # 处理 UPDATES 流 - 中断和 todos
                if current_stream_mode == "updates":
                    if not isinstance(data, dict):
                        continue

                    # 检查中断
                    if "__interrupt__" in data:
                        interrupts = data["__interrupt__"]
                        if interrupts:
                            for interrupt_obj in interrupts:
                                try:
                                    validated_request = _HITL_REQUEST_ADAPTER.validate_python(
                                        interrupt_obj.value
                                    )
                                    pending_interrupts[interrupt_obj.id] = validated_request
                                    interrupt_occurred = True
                                except Exception as e:
                                    yield {
                                        "type": "error",
                                        "content": f"Invalid HITL request: {e}"
                                    }

                    # 检查 todos
                    chunk_data = next(iter(data.values())) if data else None
                    if chunk_data and isinstance(chunk_data, dict):
                        if "todos" in chunk_data:
                            todos = chunk_data["todos"]
                            await flush_pending_text_events()
                            await persist_event(
                                "tool",
                                f"🔧 write_todos: write_todos({json.dumps({'todos': todos}, ensure_ascii=False)})",
                                metadata={"todos": todos, "tool_name": "write_todos"},
                            )
                            yield {
                                "type": "todos",
                                "content": json.dumps(todos),
                                "metadata": {"todos": todos}
                            }

                # 处理 MESSAGES 流
                elif current_stream_mode == "messages":
                    if not isinstance(data, tuple) or len(data) != 2:
                        continue

                    message, _metadata = data

                    # 处理 HumanMessage
                    if isinstance(message, HumanMessage):
                        content = message.text
                        if content:
                            yield {
                                "type": "text",
                                "content": content
                            }
                        continue

                    # 处理 ToolMessage
                    if isinstance(message, ToolMessage):
                        tool_name = getattr(message, "name", "")
                        tool_status = getattr(message, "status", "success")
                        tool_content = str(message.content) if message.content else ""

                        record = file_op_tracker.complete_with_message(message)

                        # 显示错误
                        if tool_status != "success" or tool_content.lower().startswith("error"):
                            await flush_pending_text_events()
                            await persist_event(
                                "error",
                                tool_content,
                                metadata={
                                    "tool_name": tool_name,
                                    "status": "error",
                                },
                            )
                            yield {
                                "type": "tool_result",
                                "content": tool_content,
                                "metadata": {
                                    "tool_name": tool_name,
                                    "status": "error"
                                }
                            }

                        # 显示文件操作记录
                        if record:
                            await flush_pending_text_events()
                            await persist_event(
                                "file",
                                f"{record.tool_name}({record.display_path})",
                                metadata={
                                    "tool_name": record.tool_name,
                                    "path": record.display_path,
                                    "status": record.status,
                                    "metrics": {
                                        "lines_read": record.metrics.lines_read,
                                        "lines_written": record.metrics.lines_written,
                                        "lines_added": record.metrics.lines_added,
                                        "lines_removed": record.metrics.lines_removed,
                                        "start_line": record.metrics.start_line,
                                        "end_line": record.metrics.end_line,
                                    },
                                    "diff": record.diff,
                                },
                            )
                            yield {
                                "type": "file_operation",
                                "content": f"{record.tool_name}({record.display_path})",
                                "metadata": {
                                    "tool_name": record.tool_name,
                                    "path": record.display_path,
                                    "status": record.status,
                                    "metrics": {
                                        "lines_read": record.metrics.lines_read,
                                        "lines_written": record.metrics.lines_written,
                                        "lines_added": record.metrics.lines_added,
                                        "lines_removed": record.metrics.lines_removed,
                                        "start_line": record.metrics.start_line,
                                        "end_line": record.metrics.end_line,
                                    },
                                    "diff": record.diff
                                }
                            }

                        continue

                    # 处理 AIMessageChunk
                    if not hasattr(message, "content_blocks"):
                        continue

                    # 先检查 additional_kwargs 中的 reasoning_content（Kimi k2.5 等模型）
                    if hasattr(message, "additional_kwargs"):
                        rc = message.additional_kwargs.get("reasoning_content")
                        if rc:
                            if interrupt_flag and interrupt_flag.get("interrupted"):
                                return
                            pending_thinking_parts.append(rc)
                            yield {
                                "type": "thinking",
                                "content": rc
                            }
                            # thinking 阶段跳过 content_blocks 处理，
                            # 避免中间穿插其他消息类型打断前端的 thinking 拼接
                            continue

                    # 处理内容块
                    for block in message.content_blocks:
                        block_type = block.get("type")

                        # 文本块
                        if block_type == "text":
                            text = block.get("text", "")
                            if text:
                                # 在 yield 前检查中断
                                if interrupt_flag and interrupt_flag.get("interrupted"):
                                    return
                                pending_assistant_parts.append(text)
                                yield {
                                    "type": "text",
                                    "content": text
                                }

                        # 推理块
                        elif block_type == "reasoning":
                            reasoning = block.get("reasoning", "")
                            if reasoning:
                                # 在 yield 前检查中断
                                if interrupt_flag and interrupt_flag.get("interrupted"):
                                    return
                                pending_thinking_parts.append(reasoning)
                                yield {
                                    "type": "thinking",
                                    "content": reasoning
                                }

                        # 工具调用块
                        elif block_type in ("tool_call_chunk", "tool_call"):
                            chunk_name = block.get("name")
                            chunk_args = block.get("args")
                            chunk_id = block.get("id")
                            chunk_index = block.get("index")

                            # 使用 index 作为缓冲键
                            buffer_key: str | int
                            if chunk_index is not None:
                                buffer_key = chunk_index
                            elif chunk_id is not None:
                                buffer_key = chunk_id
                            else:
                                buffer_key = f"unknown-{len(tool_call_buffers)}"

                            buffer = tool_call_buffers.setdefault(
                                buffer_key,
                                {"name": None, "id": None, "args": None, "args_parts": []},
                            )

                            if chunk_name:
                                buffer["name"] = chunk_name
                            if chunk_id:
                                buffer["id"] = chunk_id

                            if isinstance(chunk_args, dict):
                                buffer["args"] = chunk_args
                                buffer["args_parts"] = []
                            elif isinstance(chunk_args, str):
                                if chunk_args:
                                    parts: list[str] = buffer.setdefault("args_parts", [])
                                    if not parts or chunk_args != parts[-1]:
                                        parts.append(chunk_args)
                                    buffer["args"] = "".join(parts)
                            elif chunk_args is not None:
                                buffer["args"] = chunk_args

                            buffer_name = buffer.get("name")
                            buffer_id = buffer.get("id")
                            if buffer_name is None:
                                continue

                            parsed_args = buffer.get("args")
                            if isinstance(parsed_args, str):
                                if not parsed_args:
                                    continue
                                try:
                                    parsed_args = json.loads(parsed_args)
                                except json.JSONDecodeError:
                                    continue
                            elif parsed_args is None:
                                continue

                            if not isinstance(parsed_args, dict):
                                parsed_args = {"value": parsed_args}

                            # 发送工具调用
                            if buffer_id is not None:
                                if buffer_id not in displayed_tool_ids:
                                    displayed_tool_ids.add(buffer_id)
                                    file_op_tracker.start_operation(
                                        buffer_name, parsed_args, buffer_id
                                    )

                                    await flush_pending_text_events()
                                    await persist_event(
                                        "tool",
                                        f"🔧 {buffer_name}: {buffer_name}({json.dumps(parsed_args, ensure_ascii=False)})",
                                        metadata={
                                            "tool_name": buffer_name,
                                            "args": parsed_args,
                                            "tool_call_id": buffer_id,
                                        },
                                    )
                                    yield {
                                        "type": "tool_call",
                                        "content": f"{buffer_name}({json.dumps(parsed_args, ensure_ascii=False)})",
                                        "metadata": {
                                            "tool_name": buffer_name,
                                            "args": parsed_args,
                                            "tool_call_id": buffer_id
                                        }
                                    }
                                else:
                                    file_op_tracker.update_args(buffer_id, parsed_args)

                            tool_call_buffers.pop(buffer_key, None)

            # 处理中断（HITL）
            if interrupt_occurred and pending_interrupts:
                # 在 Web API 模式下，如果启用了 auto_approve，自动批准（不通知前端）
                if session_state.auto_approve:
                    from langgraph.types import Command

                    hitl_response = {}
                    for interrupt_id, hitl_request in pending_interrupts.items():
                        decisions = [{"type": "approve"} for _ in hitl_request["action_requests"]]
                        hitl_response[interrupt_id] = {"decisions": decisions}

                    stream_input = Command(resume=hitl_response)
                    continue

                # 非自动批准：将中断请求发送给前端
                for interrupt_id, hitl_request in pending_interrupts.items():
                    await flush_pending_text_events()
                    await persist_event(
                        "hitl_request",
                        json.dumps(hitl_request, ensure_ascii=False),
                        metadata={
                            "interrupt_id": interrupt_id,
                            "action_requests": hitl_request["action_requests"],
                        },
                    )
                    yield {
                        "type": "hitl_request",
                        "content": json.dumps(hitl_request),
                        "metadata": {
                            "interrupt_id": interrupt_id,
                            "action_requests": hitl_request["action_requests"]
                        }
                    }
                else:
                    # 需要用户批准，等待前端审批决策
                    if hitl_queue is None:
                        # 没有审批队列，无法等待，直接中止
                        yield {
                            "type": "hitl_pending",
                            "content": "Waiting for user approval (no hitl_queue)"
                        }
                        break

                    # 通知前端所有审批请求已发送完毕，可以渲染审批卡片
                    await persist_event("system", "Waiting for user approval")
                    yield {
                        "type": "hitl_pending",
                        "content": "Waiting for user approval"
                    }

                    # 等待用户通过 WebSocket 发送审批决策
                    try:
                        # 带超时和中断检查的等待
                        while True:
                            if interrupt_flag and interrupt_flag.get("interrupted"):
                                yield {
                                    "type": "system",
                                    "content": "Approval wait interrupted"
                                }
                                return
                            try:
                                user_decisions = await asyncio.wait_for(hitl_queue.get(), timeout=0.5)
                                break
                            except asyncio.TimeoutError:
                                continue

                        # 构造 hitl_response
                        from langgraph.types import Command

                        hitl_response = {}
                        for interrupt_id, hitl_request in pending_interrupts.items():
                            # user_decisions 格式: { interrupt_id: { decisions: [...] } }
                            if interrupt_id in user_decisions:
                                hitl_response[interrupt_id] = user_decisions[interrupt_id]
                            else:
                                # 默认拒绝
                                decisions = [{"type": "reject"} for _ in hitl_request["action_requests"]]
                                hitl_response[interrupt_id] = {"decisions": decisions}

                        # 检查是否有拒绝
                        any_rejected = False
                        for resp in hitl_response.values():
                            for d in resp.get("decisions", []):
                                if d.get("type") == "reject":
                                    any_rejected = True
                                    break

                        if any_rejected:
                            await persist_event("system", "Tool call rejected by user")
                            yield {
                                "type": "hitl_rejected",
                                "content": "Tool call rejected by user"
                            }
                            break

                        stream_input = Command(resume=hitl_response)
                        continue

                    except Exception as e:
                        yield {
                            "type": "error",
                            "content": f"HITL approval error: {str(e)}"
                        }
                        break
            else:
                # 没有中断，正常结束
                # 返回最后一条用户消息的索引（用于前端回退功能）
                try:
                    state = await agent.aget_state(config)
                    messages = state.values.get("messages", [])
                    # 找到最后一条用户消息的索引
                    user_message_index = None
                    for i, msg in enumerate(messages):
                        if isinstance(msg, HumanMessage):
                            user_message_index = i

                    if user_message_index is not None:
                        if user_event_id is not None and session_manager is not None:
                            await session_manager.update_session_event_message_index(
                                user_event_id, user_message_index
                            )
                        await flush_pending_text_events()
                        await persist_event("system", "Task completed")
                        yield {
                            "type": "message_index",
                            "content": str(user_message_index)
                        }
                except Exception as e:
                    print(f"[web_execution] Error updating message_index: {e}")
                    import traceback
                    traceback.print_exc()
                break

    except asyncio.CancelledError:
        await flush_pending_text_events()
        await persist_event("error", "任务已被用户取消")
        yield {
            "type": "error",
            "content": "任务已被用户取消"
        }
    except Exception as e:
        await flush_pending_text_events()
        await persist_event("error", _friendly_error(e))
        yield {
            "type": "error",
            "content": _friendly_error(e)
        }


def _friendly_error(e: Exception) -> str:
    """将常见 API 错误转为用户友好的中文提示。"""
    msg = str(e)

    # 429 限流错误
    if "429" in msg:
        if "TPD" in msg or "rate_limit" in msg:
            return "⚠️ 今日 API 调用额度已用完，请明天再试或升级账户额度。"
        if "engine_overloaded" in msg:
            return "⚠️ 模型服务繁忙，请稍后重试。"
        return "⚠️ API 请求过于频繁，请稍后重试。"

    # 400 请求错误
    if "400" in msg:
        if "reasoning_content" in msg:
            return "⚠️ 模型思考模式兼容性问题，请新建会话重试。"
        if "image_url" in msg or "unknown variant" in msg:
            return "⚠️ 当前模型不支持图片/视频，请切换到多模态模型（如 Kimi）。"

    # 401 认证错误
    if "401" in msg or "authentication" in msg.lower() or "unauthorized" in msg.lower():
        return "⚠️ API Key 无效或已过期，请检查 API Key 配置。"

    # 其他错误，截取关键信息
    if "Error code:" in msg:
        # 提取 message 字段
        try:
            import re
            match = re.search(r"'message':\s*'([^']+)'", msg)
            if match:
                return f"⚠️ 接口错误：{match.group(1)}"
        except Exception:
            pass

    return f"⚠️ 执行出错：{msg[:200]}"

