"""workspace 群聊上下文解析器。

负责把某个 workspace 最近的可见消息历史压缩成运行时注入文本。
这里读取的是 workspace_message，而不是 agent session 自己的内部事件流。

关键约束：
- 必须显式区分“当前正在执行的 agent”与“其他 agent”
- 不能只依赖 agent_name_snapshot，否则模型会把别人的回答误认成自己的
"""

from sqlalchemy.orm import Session

from app.repositories.workspace_message import list_workspace_messages


def _format_workspace_message_line(message, *, current_agent_session_id: int | None) -> str:
    """把单条 workspace_message 编码成注入给 runtime 的一行文本。

    这里的目标不是保真还原原始数据库结构，
    而是给模型一个尽量不混淆“谁说的、说给谁听”的轻量标注。
    """
    if message.type == "agent":
        agent_name = message.agent_name_snapshot or "未知Agent"
        if current_agent_session_id is not None and message.agent_session_id == current_agent_session_id:
            return f"[self:{agent_name}] {message.content}"
        return f"[other-agent:{agent_name}] {message.content}"

    if message.type == "human":
        target = message.request_id
        if target is not None:
            return f"[human->agent_session:{target}] {message.content}"
        return f"[human] {message.content}"

    return f"[{message.type}] {message.content}"


def build_workspace_message_context(
    db: Session,
    workspace_id: int,
    *,
    current_agent_session_id: int | None = None,
    limit: int = 50,
) -> str:
    """按时间顺序拼接最近一批 workspace_message，供 workspace session 运行时注入。

    调用链：
    - 仅在 ``session_runtime_service.ENABLE_WORKSPACE_MESSAGE_CONTEXT`` 为 True 时启用
    - 最终会作为 ``workspace_message_context`` 进入 runtime_context_entries

    这里刻意使用 workspace_message，而不是 agent 自己的内部事件流，
    因为它想表达的是“群聊可见上下文”，不是某个 Agent 的私有推理轨迹。
    """
    messages = list_workspace_messages(db, workspace_id, limit=limit if limit > 0 else None)

    header_lines = [
        "workspace_message_context:",
        f"- current_agent_session_id: {current_agent_session_id if current_agent_session_id is not None else 'unknown'}",
        "- label_rules:",
        "  - [self:...] 表示当前正在执行的 agent",
        "  - [other-agent:...] 表示其他 agent",
        "  - [human->agent_session:...] 表示用户明确 @ 的目标对象",
        "",
    ]
    lines: list[str] = []
    for message in messages:
        lines.append(_format_workspace_message_line(message, current_agent_session_id=current_agent_session_id))
    return "\n".join(header_lines + lines)
