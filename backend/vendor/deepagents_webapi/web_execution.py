"""Web-adapted task execution with streaming support."""

import asyncio
import json
from collections import deque
from typing import Any, AsyncGenerator, Optional

from langchain.agents.middleware.human_in_the_loop import HITLRequest
from langchain_core.messages import HumanMessage, ToolMessage
from pydantic import TypeAdapter

from deepagents_webapi.config import SessionState
from deepagents_webapi.file_ops import FileOpTracker

_HITL_REQUEST_ADAPTER = TypeAdapter(HITLRequest)


def _normalize_namespace(raw_namespace: Any) -> list[str]:
    if raw_namespace in (None, (), [], ""):
        return ["root"]
    if isinstance(raw_namespace, tuple):
        parts = [str(part) for part in raw_namespace if str(part)]
        return parts or ["root"]
    if isinstance(raw_namespace, list):
        parts = [str(part) for part in raw_namespace if str(part)]
        return parts or ["root"]
    return [str(raw_namespace)]


def _namespace_key(namespace_parts: list[str]) -> str:
    return "/".join(namespace_parts) if namespace_parts else "root"


def _extract_subagent_metadata(tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
    if tool_name != "task":
        return {}
    return {
        "subagent_type": args.get("subagent_type"),
        "description": args.get("description"),
    }


async def execute_task_streaming(
    user_input: str | dict,  # 传 dict 时结构为 {"text": str, "attachments": list | None}
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

    pending_text_buffers: dict[tuple[str, str], dict[str, Any]] = {}
    fallback_invocation_bindings: dict[str, dict[str, Any]] = {}
    open_invocations: deque[dict[str, Any]] = deque()
    replay_sequence = 0

    def next_sequence() -> int:
        nonlocal replay_sequence
        replay_sequence += 1
        return replay_sequence

    def build_replay_metadata(
        namespace_parts: list[str],
        *,
        tool_name: str | None = None,
        tool_call_id: str | None = None,
        invocation_context: dict[str, Any] | None = None,
        status: str | None = None,
        args: dict[str, Any] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "group_id": run_id,
            "namespace": namespace_parts,
            "namespace_key": _namespace_key(namespace_parts),
        }
        if tool_name is not None:
            metadata["tool_name"] = tool_name
        if tool_call_id is not None:
            metadata["tool_call_id"] = tool_call_id
        if status is not None:
            metadata["status"] = status
        if args is not None:
            metadata["args"] = args
        if invocation_context is not None:
            metadata["subagent_invocation_id"] = invocation_context.get("subagent_invocation_id")
            metadata["subagent_type"] = invocation_context.get("subagent_type")
            metadata["description"] = invocation_context.get("description")
            # 协作者模式下，同一次 invocation 还可能对应一个长期 child thread；
            # 这里把它和 invocation 元数据一起带上，供后面的 grouped replay / 历史 hydrate 使用。
            metadata["child_thread_id"] = invocation_context.get("child_thread_id")
        if extra:
            metadata.update(extra)
        return metadata

    def resolve_stream_metadata_invocation(
        stream_metadata: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        # 子 agent 运行时已经把“这次调用是谁”的身份信息写进流式元数据。
        # 这里优先信任这条显式绑定，避免多个子 agent 并发时只靠命名空间路径猜错归属。
        if not isinstance(stream_metadata, dict):
            return None
        raw_invocation_id = stream_metadata.get("subagent_invocation_id")
        if raw_invocation_id is None:
            return None
        invocation_id = str(raw_invocation_id).strip()
        if not invocation_id:
            return None
        started_tool_metadata = tool_call_metadata_by_id.get(invocation_id)
        if started_tool_metadata is not None:
            child_thread_id = stream_metadata.get("child_thread_id")
            if child_thread_id:
                # opener 阶段如果还没拿到长期 child 身份，后续流片段到了就顺手补齐。
                started_tool_metadata["child_thread_id"] = child_thread_id
            return started_tool_metadata
        return {
            "subagent_invocation_id": invocation_id,
            "subagent_type": stream_metadata.get("subagent_type"),
            "description": stream_metadata.get("description"),
            "child_thread_id": stream_metadata.get("child_thread_id"),
        }

    def resolve_invocation_context(
        namespace_parts: list[str],
        *,
        stream_metadata: dict[str, Any] | None = None,
        allow_root_fallback: bool = False,
    ) -> dict[str, Any] | None:
        namespace_key = _namespace_key(namespace_parts)
        metadata_invocation = resolve_stream_metadata_invocation(stream_metadata)
        if metadata_invocation is not None:
            if namespace_key != "root":
                fallback_invocation_bindings[namespace_key] = metadata_invocation
            return metadata_invocation
        matching_keys = [
            key for key in fallback_invocation_bindings
            if namespace_key == key or namespace_key.startswith(f"{key}/")
        ]
        if matching_keys:
            best_key = max(matching_keys, key=len)
            return fallback_invocation_bindings[best_key]
        if not open_invocations:
            return None
        if namespace_key == "root":
            # root 这条线在并发场景下不能盲目拿“最后一个活动子调用”做归属；
            # 只有当前确实只剩一个活动子调用时，才允许做兜底判断。
            if allow_root_fallback and len(open_invocations) == 1:
                return open_invocations[-1]
            return None
        invocation_context = open_invocations[-1]
        fallback_invocation_bindings[namespace_key] = invocation_context
        return invocation_context

    def register_open_invocation(invocation_context: dict[str, Any]) -> None:
        open_invocations.append(invocation_context)

    def close_open_invocation(subagent_invocation_id: str | None) -> None:
        if not subagent_invocation_id:
            return
        for index in range(len(open_invocations) - 1, -1, -1):
            if open_invocations[index].get("subagent_invocation_id") == subagent_invocation_id:
                del open_invocations[index]
                break
        stale_keys = [
            key
            for key, value in fallback_invocation_bindings.items()
            if value.get("subagent_invocation_id") == subagent_invocation_id
        ]
        for key in stale_keys:
            fallback_invocation_bindings.pop(key, None)

    def append_text_buffer(
        kind: str,
        content: str,
        namespace_parts: list[str],
        *,
        stream_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # thinking / assistant 会以很多小分片流出来；
        # 这里先按“同一次子调用”聚合，等这一轮分片结束后再一次性落成完整事件。
        invocation_context = resolve_invocation_context(
            namespace_parts,
            stream_metadata=stream_metadata,
            allow_root_fallback=True,
        )
        namespace_key = _namespace_key(namespace_parts)
        instance_key = (
            f"{namespace_key}::{invocation_context.get('subagent_invocation_id')}"
            if invocation_context and invocation_context.get("subagent_invocation_id")
            else namespace_key
        )
        buffer_key = (instance_key, kind)
        record = pending_text_buffers.get(buffer_key)
        if record is None:
            record = {
                "parts": [],
                "namespace": namespace_parts,
                "namespace_key": namespace_key,
                "group_id": run_id,
                "instance_key": instance_key,
                "first_seq": next_sequence(),
                "tool_call_id": None,
                "subagent_invocation_id": invocation_context.get("subagent_invocation_id") if invocation_context else None,
                "subagent_type": invocation_context.get("subagent_type") if invocation_context else None,
                "description": invocation_context.get("description") if invocation_context else None,
                # 文本分片也要记住长期 child 身份；否则实时和历史聚合时，只剩 invocation_id
                # 而看不到它背后的 collaborator child thread。
                "child_thread_id": invocation_context.get("child_thread_id") if invocation_context else None,
            }
            pending_text_buffers[buffer_key] = record
        elif invocation_context and invocation_context.get("child_thread_id") and not record.get("child_thread_id"):
            record["child_thread_id"] = invocation_context.get("child_thread_id")
        record["parts"].append(content)
        return build_replay_metadata(
            namespace_parts,
            invocation_context=invocation_context,
        )

    async def flush_pending_text_events() -> None:
        for (_instance_key, kind), record in sorted(
            list(pending_text_buffers.items()),
            key=lambda item: item[1]["first_seq"],
        ):
            content = "".join(record["parts"])
            if not content:
                pending_text_buffers.pop((_instance_key, kind), None)
                continue
            await persist_event(
                "thinking" if kind == "thinking" else "assistant",
                content,
                metadata={
                    "group_id": run_id,
                    "namespace": record["namespace"],
                    "namespace_key": record["namespace_key"],
                    "tool_call_id": record.get("tool_call_id"),
                    "subagent_invocation_id": record.get("subagent_invocation_id"),
                    "subagent_type": record.get("subagent_type"),
                    "description": record.get("description"),
                    "child_thread_id": record.get("child_thread_id"),
                },
            )
            pending_text_buffers.pop((_instance_key, kind), None)

    # 跟踪已显示的工具调用
    displayed_tool_ids = set()
    tool_call_buffers: dict[str | int, dict] = {}
    tool_call_metadata_by_id: dict[str, dict[str, Any]] = {}

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
            pending_interrupts: dict[str, dict[str, Any]] = {}

            if interrupt_flag and interrupt_flag.get("interrupted"):
                yield {
                    "type": "system",
                    "content": "Task interrupted by new message",
                }
                return

            try:
                async for chunk in agent.astream(
                    stream_input,
                    stream_mode=["messages", "updates"],
                    subgraphs=True,
                    config=config,
                    durability="exit",
                ):
                    if not isinstance(chunk, tuple) or len(chunk) != 3:
                        continue

                    if interrupt_flag and interrupt_flag.get("interrupted"):
                        return

                    raw_namespace, current_stream_mode, data = chunk
                    namespace_parts = _normalize_namespace(raw_namespace)

                    if current_stream_mode == "updates":
                        if not isinstance(data, dict):
                            continue

                        current_invocation = resolve_invocation_context(
                            namespace_parts,
                            allow_root_fallback=True,
                        )

                        interrupts = data.get("__interrupt__")
                        if interrupts:
                            for interrupt_obj in interrupts:
                                try:
                                    validated_request = _HITL_REQUEST_ADAPTER.validate_python(
                                        interrupt_obj.value
                                    )
                                    pending_interrupts[interrupt_obj.id] = {
                                        "request": validated_request,
                                        "metadata": build_replay_metadata(
                                            namespace_parts,
                                            invocation_context=current_invocation,
                                            extra={
                                                "interrupt_id": interrupt_obj.id,
                                                "action_requests": validated_request["action_requests"],
                                            },
                                        ),
                                    }
                                    interrupt_occurred = True
                                except Exception as e:
                                    yield {
                                        "type": "error",
                                        "content": f"Invalid HITL request: {e}",
                                    }

                        for update_key, chunk_data in data.items():
                            if update_key == "__interrupt__":
                                continue
                            if not isinstance(chunk_data, dict) or "todos" not in chunk_data:
                                continue
                            todos = chunk_data["todos"]
                            todo_metadata = build_replay_metadata(
                                namespace_parts,
                                tool_name="write_todos",
                                invocation_context=current_invocation,
                                extra={"todos": todos},
                            )
                            await flush_pending_text_events()
                            await persist_event(
                                "tool",
                                f"🔧 write_todos: write_todos({json.dumps({'todos': todos}, ensure_ascii=False)})",
                                metadata=todo_metadata,
                            )
                            yield {
                                "type": "todos",
                                "content": json.dumps(todos),
                                "metadata": todo_metadata,
                            }

                    elif current_stream_mode == "messages":
                        if not isinstance(data, tuple) or len(data) != 2:
                            continue

                        message, _metadata = data

                        if isinstance(message, HumanMessage):
                            content = message.text
                            if content:
                                yield {
                                    "type": "text",
                                    "content": content,
                                    "metadata": build_replay_metadata(namespace_parts),
                                }
                            continue

                        if isinstance(message, ToolMessage):
                            tool_name = getattr(message, "name", "")
                            tool_status = getattr(message, "status", "success")
                            tool_content = str(message.content) if message.content else ""
                            tool_call_id = getattr(message, "tool_call_id", None)
                            started_tool_metadata = tool_call_metadata_by_id.get(tool_call_id or "")
                            current_invocation = (
                                started_tool_metadata
                                if started_tool_metadata and started_tool_metadata.get("subagent_invocation_id")
                                else resolve_invocation_context(
                                    namespace_parts,
                                    stream_metadata=_metadata,
                                    allow_root_fallback=True,
                                )
                            )
                            record = file_op_tracker.complete_with_message(message)

                            if tool_name == "task" and tool_status == "success" and started_tool_metadata:
                                await flush_pending_text_events()
                                task_result_metadata = build_replay_metadata(
                                    started_tool_metadata["namespace"],
                                    tool_name="task",
                                    tool_call_id=tool_call_id,
                                    invocation_context=started_tool_metadata,
                                    status="success",
                                )
                                await persist_event(
                                    "tool_result",
                                    tool_content,
                                    metadata=task_result_metadata,
                                )
                                yield {
                                    "type": "tool_result",
                                    "content": tool_content,
                                    "metadata": task_result_metadata,
                                }
                                close_open_invocation(started_tool_metadata.get("subagent_invocation_id"))
                                continue

                            if tool_status != "success" or tool_content.lower().startswith("error"):
                                await flush_pending_text_events()
                                error_namespace = (
                                    started_tool_metadata["namespace"]
                                    if tool_name == "task" and started_tool_metadata
                                    else namespace_parts
                                )
                                error_metadata = build_replay_metadata(
                                    error_namespace,
                                    tool_name=tool_name,
                                    tool_call_id=tool_call_id,
                                    invocation_context=current_invocation,
                                    status="error",
                                )
                                await persist_event(
                                    "tool_result",
                                    tool_content,
                                    metadata=error_metadata,
                                )
                                yield {
                                    "type": "tool_result",
                                    "content": tool_content,
                                    "metadata": error_metadata,
                                }
                                if tool_name == "task" and started_tool_metadata:
                                    close_open_invocation(
                                        started_tool_metadata.get("subagent_invocation_id")
                                    )

                            if record:
                                await flush_pending_text_events()
                                file_metadata = build_replay_metadata(
                                    namespace_parts,
                                    tool_name=record.tool_name,
                                    tool_call_id=tool_call_id,
                                    invocation_context=current_invocation,
                                    status=record.status,
                                    extra={
                                        "path": record.display_path,
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
                                await persist_event(
                                    "file",
                                    f"{record.tool_name}({record.display_path})",
                                    metadata=file_metadata,
                                )
                                yield {
                                    "type": "file_operation",
                                    "content": f"{record.tool_name}({record.display_path})",
                                    "metadata": file_metadata,
                                }
                                continue

                            if tool_status == "success":
                                await flush_pending_text_events()
                                result_namespace = (
                                    started_tool_metadata["namespace"]
                                    if started_tool_metadata and started_tool_metadata.get("namespace")
                                    else namespace_parts
                                )
                                # 非文件类工具的成功结果也要显式落一条 `tool_result`，
                                # 否则历史回放只能看到 `tool_call`，看不到真正返回了什么。
                                result_metadata = build_replay_metadata(
                                    result_namespace,
                                    tool_name=tool_name,
                                    tool_call_id=tool_call_id,
                                    invocation_context=current_invocation,
                                    status="success",
                                )
                                await persist_event(
                                    "tool_result",
                                    tool_content,
                                    metadata=result_metadata,
                                )
                                yield {
                                    "type": "tool_result",
                                    "content": tool_content,
                                    "metadata": result_metadata,
                                }
                            continue

                        if not hasattr(message, "content_blocks"):
                            continue

                        if hasattr(message, "additional_kwargs"):
                            rc = message.additional_kwargs.get("reasoning_content")
                            if rc:
                                if interrupt_flag and interrupt_flag.get("interrupted"):
                                    return
                                reasoning_metadata = append_text_buffer(
                                    "thinking",
                                    rc,
                                    namespace_parts,
                                    stream_metadata=_metadata,
                                )
                                yield {
                                    "type": "thinking",
                                    "content": rc,
                                    "metadata": reasoning_metadata,
                                }
                                continue

                        for block in message.content_blocks:
                            block_type = block.get("type")

                            if block_type == "text":
                                text = block.get("text", "")
                                if text:
                                    if interrupt_flag and interrupt_flag.get("interrupted"):
                                        return
                                    text_metadata = append_text_buffer(
                                        "assistant",
                                        text,
                                        namespace_parts,
                                        stream_metadata=_metadata,
                                    )
                                    yield {
                                        "type": "text",
                                        "content": text,
                                        "metadata": text_metadata,
                                    }

                            elif block_type == "reasoning":
                                reasoning = block.get("reasoning", "")
                                if reasoning:
                                    if interrupt_flag and interrupt_flag.get("interrupted"):
                                        return
                                    reasoning_metadata = append_text_buffer(
                                        "thinking",
                                        reasoning,
                                        namespace_parts,
                                        stream_metadata=_metadata,
                                    )
                                    yield {
                                        "type": "thinking",
                                        "content": reasoning,
                                        "metadata": reasoning_metadata,
                                    }

                            elif block_type in ("tool_call_chunk", "tool_call"):
                                chunk_name = block.get("name")
                                chunk_args = block.get("args")
                                chunk_id = block.get("id")
                                chunk_index = block.get("index")

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

                                if buffer_id is not None:
                                    if buffer_id not in displayed_tool_ids:
                                        displayed_tool_ids.add(buffer_id)
                                        file_op_tracker.start_operation(
                                            buffer_name, parsed_args, buffer_id
                                        )

                                        parent_invocation = resolve_invocation_context(
                                            namespace_parts,
                                            stream_metadata=_metadata,
                                            allow_root_fallback=True,
                                        )
                                        task_invocation = None
                                        if buffer_name == "task":
                                            task_invocation = {
                                                "subagent_invocation_id": buffer_id,
                                                "subagent_type": parsed_args.get("subagent_type"),
                                                "description": parsed_args.get("description"),
                                                # task opener 在创建 invocation 卡片时，就把长期 child 身份绑上；
                                                # 这样后续 thinking / assistant / tool_result 都能稳定挂回同一张卡片。
                                                "child_thread_id": _metadata.get("child_thread_id") if isinstance(_metadata, dict) else None,
                                                "namespace": namespace_parts,
                                                "namespace_key": _namespace_key(namespace_parts),
                                            }
                                        invocation_context = task_invocation or parent_invocation
                                        tool_metadata = build_replay_metadata(
                                            namespace_parts,
                                            tool_name=buffer_name,
                                            tool_call_id=buffer_id,
                                            invocation_context=invocation_context,
                                            status="running",
                                            args=parsed_args,
                                        )

                                        if task_invocation is not None:
                                            register_open_invocation(task_invocation)
                                            tool_call_metadata_by_id[buffer_id] = {
                                                **task_invocation,
                                                **tool_metadata,
                                            }
                                        else:
                                            tool_call_metadata_by_id[buffer_id] = tool_metadata

                                        await flush_pending_text_events()
                                        await persist_event(
                                            "tool",
                                            f"🔧 {buffer_name}: {buffer_name}({json.dumps(parsed_args, ensure_ascii=False)})",
                                            metadata=tool_metadata,
                                        )
                                        yield {
                                            "type": "tool_call",
                                            "content": f"{buffer_name}({json.dumps(parsed_args, ensure_ascii=False)})",
                                            "metadata": tool_metadata,
                                        }
                                    else:
                                        file_op_tracker.update_args(buffer_id, parsed_args)

                                tool_call_buffers.pop(buffer_key, None)
            finally:
                await flush_pending_text_events()

            if interrupt_occurred and pending_interrupts:
                if session_state.auto_approve:
                    from langgraph.types import Command

                    hitl_response = {}
                    for interrupt_id, payload in pending_interrupts.items():
                        hitl_request = payload["request"]
                        decisions = [{"type": "approve"} for _ in hitl_request["action_requests"]]
                        hitl_response[interrupt_id] = {"decisions": decisions}

                    stream_input = Command(resume=hitl_response)
                    continue

                for interrupt_id, payload in pending_interrupts.items():
                    hitl_request = payload["request"]
                    hitl_metadata = payload["metadata"]
                    await persist_event(
                        "hitl_request",
                        json.dumps(hitl_request, ensure_ascii=False),
                        metadata=hitl_metadata,
                    )
                    yield {
                        "type": "hitl_request",
                        "content": json.dumps(hitl_request),
                        "metadata": hitl_metadata,
                    }
                else:
                    if hitl_queue is None:
                        yield {
                            "type": "hitl_pending",
                            "content": "Waiting for user approval (no hitl_queue)",
                        }
                        break

                    await persist_event("system", "Waiting for user approval")
                    yield {
                        "type": "hitl_pending",
                        "content": "Waiting for user approval",
                    }

                    try:
                        while True:
                            if interrupt_flag and interrupt_flag.get("interrupted"):
                                yield {
                                    "type": "system",
                                    "content": "Approval wait interrupted",
                                }
                                return
                            try:
                                user_decisions = await asyncio.wait_for(hitl_queue.get(), timeout=0.5)
                                break
                            except asyncio.TimeoutError:
                                continue

                        from langgraph.types import Command

                        hitl_response = {}
                        for interrupt_id, payload in pending_interrupts.items():
                            hitl_request = payload["request"]
                            if interrupt_id in user_decisions:
                                hitl_response[interrupt_id] = user_decisions[interrupt_id]
                            else:
                                decisions = [{"type": "reject"} for _ in hitl_request["action_requests"]]
                                hitl_response[interrupt_id] = {"decisions": decisions}

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
                                "content": "Tool call rejected by user",
                            }
                            break

                        stream_input = Command(resume=hitl_response)
                        continue

                    except Exception as e:
                        yield {
                            "type": "error",
                            "content": f"HITL approval error: {str(e)}",
                        }
                        break
            else:
                try:
                    state = await agent.aget_state(config)
                    messages = state.values.get("messages", [])
                    user_message_index = None
                    for i, msg in enumerate(messages):
                        if isinstance(msg, HumanMessage):
                            user_message_index = i

                    if user_message_index is not None:
                        if user_event_id is not None and session_manager is not None:
                            await session_manager.update_session_event_message_index(
                                user_event_id, user_message_index
                            )
                        await persist_event("system", "Task completed")
                        yield {
                            "type": "message_index",
                            "content": str(user_message_index),
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
