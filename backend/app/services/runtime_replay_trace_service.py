"""Runtime replay trace aggregation helpers."""

from __future__ import annotations

from typing import Any


def _event_to_trace_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": event["id"],
        "type": event["type"],
        "content": event["content"],
        "metadata": event.get("metadata") or {},
        "attachments": event.get("attachments") or [],
        "message_index": event.get("message_index"),
        "created_at": event.get("created_at"),
    }


def _longest_common_prefix(paths: list[list[str]]) -> list[str]:
    if not paths:
        return ["root"]
    prefix = list(paths[0])
    for path in paths[1:]:
        max_len = min(len(prefix), len(path))
        i = 0
        while i < max_len and prefix[i] == path[i]:
            i += 1
        prefix = prefix[:i]
        if not prefix:
            return ["root"]
    return prefix or ["root"]


def _namespace_key(namespace: list[str]) -> str:
    return "/".join(namespace) if namespace else "root"


def _build_branch_tree(events: list[dict[str, Any]]) -> dict[str, Any]:
    namespaces = [
        (event.get("metadata") or {}).get("namespace") or ["root"]
        for event in events
    ]
    root_namespace = _longest_common_prefix(namespaces)
    root_key = _namespace_key(root_namespace)

    nodes: dict[str, dict[str, Any]] = {
        root_key: {
            "namespace": root_namespace,
            "namespace_key": root_key,
            "events": [],
            "children": [],
        }
    }
    child_keys_by_parent: dict[str, list[str]] = {root_key: []}

    for event in events:
        namespace = (event.get("metadata") or {}).get("namespace") or ["root"]
        trace_event = _event_to_trace_event(event)
        current_parent_key = root_key

        for depth in range(len(root_namespace), len(namespace)):
            current_namespace = namespace[: depth + 1]
            current_key = _namespace_key(current_namespace)
            if current_key not in nodes:
                nodes[current_key] = {
                    "namespace": current_namespace,
                    "namespace_key": current_key,
                    "events": [],
                    "children": [],
                }
                child_keys_by_parent.setdefault(current_parent_key, []).append(current_key)
                child_keys_by_parent.setdefault(current_key, [])
            current_parent_key = current_key

        target_key = _namespace_key(namespace)
        if target_key not in nodes:
            nodes[target_key] = {
                "namespace": namespace,
                "namespace_key": target_key,
                "events": [],
                "children": [],
            }
            child_keys_by_parent.setdefault(root_key, []).append(target_key)
            child_keys_by_parent.setdefault(target_key, [])
        nodes[target_key]["events"].append(trace_event)

    for parent_key, child_keys in child_keys_by_parent.items():
        nodes[parent_key]["children"] = [nodes[child_key] for child_key in child_keys]

    return nodes[root_key]


def _derive_invocation_status(events: list[dict[str, Any]]) -> str:
    # 单次 invocation 的终态优先看 task 的 tool_result，其次兜底看 error；
    # 如果两者都没出现，说明这次执行只留下了半程轨迹。
    for event in reversed(events):
        metadata = event.get("metadata") or {}
        if event.get("type") == "tool_result" and metadata.get("tool_name") == "task":
            return "error" if metadata.get("status") == "error" else "success"
        if event.get("type") == "error":
            return "error"
    return "unfinished"


def _derive_invocation_preview(events: list[dict[str, Any]]) -> str | None:
    # 卡片摘要尽量取“离结束最近、且人能读懂”的那条内容，
    # 优先 tool_result，再回退到 assistant / tool / error。
    for event in reversed(events):
        content = (event.get("content") or "").strip()
        if not content:
            continue
        if event.get("type") == "tool_result":
            return content
        if event.get("type") in {"assistant", "error", "system", "tool"}:
            return content
    return None


def _build_invocation_trace(instance_events: list[dict[str, Any]]) -> dict[str, Any]:
    # 历史回放里的 invocation 要自带完整摘要信息，
    # 这样前端 hydrate 时就不用再靠额外推导去拼卡片头部。
    first_event = instance_events[0]
    last_event = instance_events[-1]
    first_metadata = first_event.get("metadata") or {}
    # 同一次 invocation 内如果出现过 `child_thread_id`，把它提成摘要字段。
    # 这目前主要是给历史回放保留“长期 child 身份锚点”，还不是完整 child-session 历史。
    child_thread_id = next(
        (
            (event.get("metadata") or {}).get("child_thread_id")
            for event in instance_events
            if (event.get("metadata") or {}).get("child_thread_id")
        ),
        None,
    )
    status = _derive_invocation_status(instance_events)
    finished_at = last_event.get("created_at") if status != "unfinished" else None
    return {
        "subagent_invocation_id": first_metadata.get("subagent_invocation_id"),
        "subagent_type": first_metadata.get("subagent_type"),
        "description": first_metadata.get("description"),
        # 挂在 invocation 摘要上，便于 grouped replay / 历史 hydrate 直接读取。
        "child_thread_id": child_thread_id,
        "namespace_key": first_metadata.get("namespace_key"),
        "events": [_event_to_trace_event(event) for event in instance_events],
        "first_event_id": first_event["id"],
        "last_event_id": last_event["id"],
        "started_at": first_event.get("created_at"),
        "finished_at": finished_at,
        "status": status,
        "preview": _derive_invocation_preview(instance_events),
        "branch_tree": _build_branch_tree(instance_events),
    }


def build_replay_trace(
    events: list[dict[str, Any]],
    group_ids_in_order: list[str],
) -> list[dict[str, Any]]:
    events_by_group: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        events_by_group.setdefault(event["group_id"], []).append(event)

    groups: list[dict[str, Any]] = []
    for group_id in group_ids_in_order:
        group_events = events_by_group.get(group_id, [])
        root_events: list[dict[str, Any]] = []
        invocation_events: dict[str, list[dict[str, Any]]] = {}

        for event in group_events:
            metadata = event.get("metadata") or {}
            invocation_id = metadata.get("subagent_invocation_id")
            if invocation_id:
                invocation_events.setdefault(invocation_id, []).append(event)
            else:
                root_events.append(_event_to_trace_event(event))

        invocations: list[dict[str, Any]] = []
        for invocation_id, instance_events in invocation_events.items():
            invocation_trace = _build_invocation_trace(instance_events)
            invocation_trace["subagent_invocation_id"] = invocation_id
            invocations.append(invocation_trace)

        groups.append(
            {
                "group_id": group_id,
                "root_events": root_events,
                "invocations": invocations,
            }
        )

    return groups
