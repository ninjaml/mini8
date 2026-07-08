"""子代理运行时组装服务。"""

from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Any
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy.orm import Session

from deepagents.middleware.subagents import CompiledSubAgent
from deepagents_webapi.agent import create_agent_with_config, create_inmemory_checkpointer
from deepagents_webapi.config import create_model_for_agent, settings as runtime_settings

from app.domain.session_runtime import SessionRuntimeSpec
from app.repositories.agent import get_agent
from app.repositories.agent_subagent_binding import list_subagent_bindings_by_parent_agent_id
from app.services.agent_service import ensure_agent_base_dir
from app.services.session_runtime_service import build_agent_runtime_name


_ALLOWED_SCOPE_KEYS = {
    "primary_key",
    "workspace_id",
    "current_agent_name",
    "workspace_message_context",
}

_COLLABORATOR_ACTIVE_THREADS_GUARD = Lock()
_COLLABORATOR_ACTIVE_THREADS: set[str] = set()


def build_collaborator_child_thread_id(
    parent_agent_session_id: int,
    binding_id: int,
) -> str:
    """为协作者模式 child 生成稳定 thread_id。

    注意这不是所有子 Agent 通用的 thread 规则：
    - collaborator：按 ``parent_agent_session_id + binding_id`` 稳定派生
    - executor：每次调用都重新生成执行线程
    """
    return str(
        uuid5(
            NAMESPACE_URL,
            f"CamphorEOS:subagent-collaborator:{parent_agent_session_id}:{binding_id}",
        )
    )


def _try_acquire_collaborator_thread(thread_id: str) -> bool:
    """按稳定 child thread 做进程内单活跃保护。"""
    with _COLLABORATOR_ACTIVE_THREADS_GUARD:
        if thread_id in _COLLABORATOR_ACTIVE_THREADS:
            return False
        _COLLABORATOR_ACTIVE_THREADS.add(thread_id)
        return True


def _release_collaborator_thread(thread_id: str) -> None:
    # 协作者模式的“单活跃”只是一层进程内调度保护；真正的长期身份仍然是
    # `child_thread_id` 本身，而不是这个内存 set。
    with _COLLABORATOR_ACTIVE_THREADS_GUARD:
        _COLLABORATOR_ACTIVE_THREADS.discard(thread_id)


def _get_required_runtime_entry(
    runtime_context_entries: list[tuple[str, object]],
    key: str,
) -> str:
    for entry_key, entry_value in runtime_context_entries:
        if entry_key != key:
            continue
        value = str(entry_value).strip()
        if not value:
            break
        return value
    raise RuntimeError(f"{key} is required for child agent runtime")


def build_scope_context_from_runtime_entries(runtime_context_entries: list[tuple[str, object]]) -> str | None:
    parts = [
        f"- {key}: {value}"
        for key, value in runtime_context_entries
        if key in _ALLOWED_SCOPE_KEYS
    ]
    return "\n".join(parts) if parts else None


def _build_child_skill_source_dirs(child_base_dir: Path) -> list[Path]:
    skill_source_dirs = [child_base_dir / "skills"]
    project_skills_dir = runtime_settings.get_project_skills_dir()
    if project_skills_dir is not None:
        skill_source_dirs.append(project_skills_dir)
    return skill_source_dirs


def build_scope_context(runtime_context_entries: list[tuple[str, object]], *, allowed_keys: set[str] | None = None) -> str | None:
    parts = [
        f"- {key}: {value}"
        for key, value in runtime_context_entries
        if allowed_keys is None or key in allowed_keys
    ]
    return "\n".join(parts) if parts else None


def _resolve_subagent_invocation_id(config: dict[str, Any] | None) -> str:
    # 优先复用 `task` 工具已经分配好的“本次子调用 ID”；
    # 如果上游没传，就在 child 侧兜底补一个，保证事件归属不会丢。
    configurable = config.get("configurable") if isinstance(config, dict) else None
    if isinstance(configurable, dict):
        invocation_id = configurable.get("subagent_invocation_id")
        if invocation_id is not None:
            value = str(invocation_id).strip()
            if value:
                return value
    return uuid4().hex


def _build_child_runnable_config(
    config: dict[str, Any] | None,
    *,
    thread_id: str,
    child_thread_id: str | None = None,
) -> dict[str, Any]:
    # 子运行体必须拿到独立 `thread_id`，同时把“本次子调用”的元数据继续往下透传，
    # 这样回放和聊天投影才能把后续 `thinking`、`tool`、`assistant` 正确挂回同一张卡片。
    merged_config = dict(config or {})
    merged_configurable = dict(merged_config.get("configurable") or {})
    merged_configurable["thread_id"] = thread_id
    merged_config["configurable"] = merged_configurable
    merged_metadata = dict(merged_config.get("metadata") or {})
    invocation_id = merged_configurable.get("subagent_invocation_id")
    if invocation_id is not None:
        invocation_id_text = str(invocation_id).strip()
        if invocation_id_text:
            merged_metadata.setdefault("subagent_invocation_id", invocation_id_text)
    subagent_type = merged_configurable.get("subagent_type")
    if subagent_type is not None:
        subagent_type_text = str(subagent_type).strip()
        if subagent_type_text:
            merged_metadata.setdefault("subagent_type", subagent_type_text)
    if child_thread_id is not None:
        # 对协作者模式而言，`child_thread_id` 是后续 replay / 调试 / 历史锚点；
        # 这里继续往下透传，避免事件落盘后只剩 invocation_id 而找不到长期 child 身份。
        merged_metadata.setdefault("child_thread_id", child_thread_id)
    if merged_metadata:
        merged_config["metadata"] = merged_metadata
    return merged_config


class ExecutorModeSubagentRunnable:
    """按次创建 child runtime 的执行器包装器。"""

    def __init__(
        self,
        *,
        child_agent_id: int,
        parent_runtime_spec: SessionRuntimeSpec,
        tools: list[Any],
    ):
        self._child_agent_id = child_agent_id
        self._parent_runtime_spec = parent_runtime_spec
        self._tools = list(tools)

    def _build_execution_thread_id(self, invocation_id: str) -> str:
        return f"{self._parent_runtime_spec.thread_id}:subagent:{self._child_agent_id}:{invocation_id}"

    def invoke(self, state: dict[str, Any], config: dict[str, Any] | None = None):
        # 执行器模式的关键点：同一个子 agent 定义可以复用，
        # 但每次 `task` 调用都要新建独立 `runnable / thread / checkpointer`。
        invocation_id = _resolve_subagent_invocation_id(config)
        thread_id = self._build_execution_thread_id(invocation_id)
        child_config = _build_child_runnable_config(config, thread_id=thread_id)
        checkpointer = create_inmemory_checkpointer()
        child_runnable = None
        try:
            child_runnable = build_child_agent_runnable(
                child_agent_id=self._child_agent_id,
                parent_runtime_spec=self._parent_runtime_spec,
                tools=self._tools,
                thread_id=thread_id,
                checkpointer=checkpointer,
            )
            return child_runnable.invoke(state, config=child_config)
        finally:
            child_runnable = None
            checkpointer = None

    async def ainvoke(self, state: dict[str, Any], config: dict[str, Any] | None = None):
        # 异步路径保持和同步路径同样的“按次创建执行实例”语义，避免并发时串状态。
        invocation_id = _resolve_subagent_invocation_id(config)
        thread_id = self._build_execution_thread_id(invocation_id)
        child_config = _build_child_runnable_config(config, thread_id=thread_id)
        checkpointer = create_inmemory_checkpointer()
        child_runnable = None
        try:
            child_runnable = build_child_agent_runnable(
                child_agent_id=self._child_agent_id,
                parent_runtime_spec=self._parent_runtime_spec,
                tools=self._tools,
                thread_id=thread_id,
                checkpointer=checkpointer,
            )
            return await child_runnable.ainvoke(state, config=child_config)
        finally:
            child_runnable = None
            checkpointer = None


class CollaboratorModeSubagentRunnable:
    """协作者模式子代理包装器。"""

    def __init__(
        self,
        *,
        child_agent_id: int,
        binding_id: int,
        parent_runtime_spec: SessionRuntimeSpec,
        tools: list[Any],
        session_manager=None,
    ):
        self._child_agent_id = child_agent_id
        self._binding_id = binding_id
        self._parent_runtime_spec = parent_runtime_spec
        self._tools = list(tools)
        self._session_manager = session_manager
        self._child_thread_id = build_collaborator_child_thread_id(
            parent_agent_session_id=parent_runtime_spec.agent_session_id,
            binding_id=binding_id,
        )

    def _build_busy_result(self) -> dict[str, Any]:
        # busy_rejected 不走异常，而是走显式 tool 结果，让父 graph 能继续推理、
        # 调整调度，或稍后重试。
        return {
            "messages": [
                type(
                    "Message",
                    (),
                    {"text": f"Subagent {self._child_agent_id} is busy (busy_rejected)."},
                )()
            ],
            "_tool_status": "error",
            "_tool_reason": "busy_rejected",
        }

    def invoke(self, state: dict[str, Any], config: dict[str, Any] | None = None):
        if not _try_acquire_collaborator_thread(self._child_thread_id):
            return self._build_busy_result()
        child_config = _build_child_runnable_config(
            config,
            thread_id=self._child_thread_id,
            child_thread_id=self._child_thread_id,
        )
        try:
            # 协作者模式优先接入持久 saver，这样重复调用时才能接回同一份 child memory。
            if self._session_manager is not None and hasattr(self._session_manager, "open_sqlite_saver"):
                with self._session_manager.open_sqlite_saver() as checkpointer:
                    child_runnable = build_child_agent_runnable(
                        child_agent_id=self._child_agent_id,
                        parent_runtime_spec=self._parent_runtime_spec,
                        tools=self._tools,
                        thread_id=self._child_thread_id,
                        checkpointer=checkpointer,
                    )
                    return child_runnable.invoke(state, config=child_config)
            child_runnable = build_child_agent_runnable(
                child_agent_id=self._child_agent_id,
                parent_runtime_spec=self._parent_runtime_spec,
                tools=self._tools,
                thread_id=self._child_thread_id,
                checkpointer=create_inmemory_checkpointer(),
            )
            return child_runnable.invoke(state, config=child_config)
        finally:
            _release_collaborator_thread(self._child_thread_id)

    async def ainvoke(self, state: dict[str, Any], config: dict[str, Any] | None = None):
        if not _try_acquire_collaborator_thread(self._child_thread_id):
            return self._build_busy_result()
        child_config = _build_child_runnable_config(
            config,
            thread_id=self._child_thread_id,
            child_thread_id=self._child_thread_id,
        )
        try:
            # 异步路径保持和同步路径同样的“稳定 thread + 持久 saver + busy reject”语义。
            if self._session_manager is not None and hasattr(self._session_manager, "open_async_sqlite_saver"):
                async with self._session_manager.open_async_sqlite_saver() as checkpointer:
                    child_runnable = build_child_agent_runnable(
                        child_agent_id=self._child_agent_id,
                        parent_runtime_spec=self._parent_runtime_spec,
                        tools=self._tools,
                        thread_id=self._child_thread_id,
                        checkpointer=checkpointer,
                    )
                    return await child_runnable.ainvoke(state, config=child_config)
            child_runnable = build_child_agent_runnable(
                child_agent_id=self._child_agent_id,
                parent_runtime_spec=self._parent_runtime_spec,
                tools=self._tools,
                thread_id=self._child_thread_id,
                checkpointer=create_inmemory_checkpointer(),
            )
            return await child_runnable.ainvoke(state, config=child_config)
        finally:
            _release_collaborator_thread(self._child_thread_id)


def build_child_agent_runnable(
    *,
    child_agent_id: int,
    parent_runtime_spec: SessionRuntimeSpec,
    tools: list[Any],
    thread_id: str | None = None,
    checkpointer=None,
):
    _get_required_runtime_entry(parent_runtime_spec.runtime_context_entries, "primary_key")
    child_base_dir = ensure_agent_base_dir(child_agent_id)
    assistant_id = build_agent_runtime_name(child_agent_id)
    model = create_model_for_agent(assistant_id)
    scope_context = build_scope_context(parent_runtime_spec.runtime_context_entries, allowed_keys=_ALLOWED_SCOPE_KEYS)
    skill_source_dirs = _build_child_skill_source_dirs(child_base_dir)
    agent, _backend = create_agent_with_config(
        model,
        assistant_id,
        tools,
        thread_id=thread_id,
        checkpointer=checkpointer,
        working_dir=parent_runtime_spec.working_dir,
        base_agent_dir=child_base_dir,
        prompt_overlay=None,
        scope_context=scope_context,
        skill_source_dirs=skill_source_dirs,
        # 子 agent 作为“被调用执行器”运行时，不再启动内部 HITL 审批机制；
        # 否则 `task -> child` 这条链路会停在子图里，父级拿不到完整结果。
        # 这里显式关掉审批机制，避免 `task` 内部再进入一层 HITL 阻塞。
        enable_interrupts=False,
        # 子 agent 运行时显式禁用 `subagents`，避免被委派出来的子代理
        # 再递归获得自己的 `task/subagent` 层。
        subagents=[],
        subagent_mode=None,
    )
    return agent


def create_runtime_agent_for_session(
    *,
    db: Session,
    model,
    agent_name: str,
    tools: list[Any],
    checkpointer,
    parent_runtime_spec: SessionRuntimeSpec,
    thread_id: str | None = None,
    session_manager=None,
):
    compiled_subagents = build_platform_subagents_for_agent_session(
        db=db,
        parent_runtime_spec=parent_runtime_spec,
        tools=tools,
        session_manager=session_manager,
    )
    return create_agent_with_config(
        model,
        agent_name,
        tools,
        thread_id=thread_id or parent_runtime_spec.thread_id,
        checkpointer=checkpointer,
        working_dir=parent_runtime_spec.working_dir,
        base_agent_dir=parent_runtime_spec.base_agent_dir,
        prompt_overlay=parent_runtime_spec.prompt_overlay,
        scope_context=build_scope_context(parent_runtime_spec.runtime_context_entries),
        skill_source_dirs=parent_runtime_spec.skill_source_dirs,
        # parent 仍然启动审批机制，保持原来的人工审批语义。
        enable_interrupts=True,
        subagents=compiled_subagents,
        # 把 session 级 mode 继续传进 vendor 层，让 task prompt / task tool 口径
        # 也跟随当前会话的双模式语义一起切换。
        subagent_mode=parent_runtime_spec.subagent_mode,
    )


def build_platform_subagents_for_agent_session(
    *,
    db: Session,
    parent_runtime_spec: SessionRuntimeSpec,
    tools: list[Any],
    session_manager=None,
) -> list[CompiledSubAgent] | None:
    if parent_runtime_spec.subagent_mode is None:
        # 无团队态保持 vendor 默认 self-subagent fallback。
        return None

    bindings = list_subagent_bindings_by_parent_agent_id(db, parent_runtime_spec.agent_id)
    if not bindings:
        # 返回 `None`，让父 Agent 保持默认“自调用子代理”语义。
        return None

    compiled_subagents: list[CompiledSubAgent] = []
    for binding in bindings:
        if get_agent(db, binding.child_agent_id) is None:
            raise RuntimeError(f"Child agent not found: {binding.child_agent_id}")
        # 这里是真正的三态落点：
        # - null：前面已经提前 return None
        # - collaborator：稳定 thread + 持久 memory + busy reject
        # - executor：按次创建临时 child runtime
        if parent_runtime_spec.subagent_mode == "collaborator":
            runnable = CollaboratorModeSubagentRunnable(
                child_agent_id=binding.child_agent_id,
                binding_id=binding.id,
                parent_runtime_spec=parent_runtime_spec,
                tools=tools,
                session_manager=session_manager,
            )
        else:
            # executor 路径继续保持按次创建临时 child runtime 的语义。
            runnable = ExecutorModeSubagentRunnable(
                child_agent_id=binding.child_agent_id,
                parent_runtime_spec=parent_runtime_spec,
                tools=tools,
            )
        compiled_subagents.append(
            CompiledSubAgent(
                name=binding.subagent_name,
                description=binding.description,
                runnable=runnable,
            )
        )
    return compiled_subagents
