"""运行时规格解析服务。

这是普通业务 Agent 接入 deepagents runtime 的核心适配层。

它负责把几层平台真相折叠成一个 ``SessionRuntimeSpec``：
- Agent 主记录
- AgentSession 稳定会话记录
- Workspace 共享目录（仅 workspace session）
- persona 文件资源

下游使用方包括：
- runtime 建连入口
- workspace headless 执行
- cron 中普通 AgentSession 的 headless 执行
"""

from collections.abc import Mapping
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Agent, Workspace
from app.repositories.agent import get_agent
from app.repositories.agent_session import get_agent_session, get_agent_session_by_thread_id
from app.repositories.workspace import get_workspace
from app.services.persona_service import get_persona_resource_bundle
from app.domain.session_runtime import SessionRuntimeSpec
from deepagents_webapi.config import settings as runtime_settings


ENABLE_WORKSPACE_MESSAGE_CONTEXT = False


def build_agent_runtime_name(agent_id: int) -> str:
    """生成普通 Agent 在 runtime 层使用的 agent_name。"""
    return f"agent-{agent_id}"


def resolve_agent_base_dir(agent_id: int) -> Path:
    """解析普通 Agent 的 runtime 基础目录。

    这条规则与 ``build_agent_runtime_name()`` 绑定：
    ``agent_id -> agent-{id} -> settings.RUNTIME_AGENTS_DIR / agent-{id}``
    """
    return settings.RUNTIME_AGENTS_DIR / build_agent_runtime_name(agent_id)


def build_agent_default_thread_id(agent_id: int) -> str:
    """为 default session 生成稳定 thread_id。

    这里使用 uuid5 保证：
    - 同一个 agent_id 始终得到同一个 default thread_id
    - 不同 agent_id 之间不会随机漂移
    """
    return str(uuid5(NAMESPACE_URL, f"CamphorEOS:agent:{agent_id}"))


def build_agent_workspace_thread_id(agent_id: int, workspace_id: int) -> str:
    """为 workspace session 生成稳定 thread_id。

    粒度是 ``agent_id + workspace_id``，
    因此同一个 Agent 在不同 workspace 下会有不同 thread_id。
    """
    return str(uuid5(NAMESPACE_URL, f"CamphorEOS:agent:{agent_id}:workspace:{workspace_id}"))


def _ensure_directory(path: str) -> str:
    """确保目录存在，并返回字符串形式路径。"""
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return str(target)


def resolve_agent_default_working_dir(agent: Agent) -> str:
    """解析普通 Agent 的 default session 工作目录。

    优先使用 ``agent.default_working_dir``；
    未显式设置时回退到平台约定的 ``settings.AGENTS_WORK_DIR / {agent.id}``。
    """
    working_dir = agent.default_working_dir or str(settings.AGENTS_WORK_DIR / str(agent.id))
    return _ensure_directory(working_dir)


def resolve_workspace_working_dir(workspace: Workspace) -> str:
    """解析 workspace session 的共享工作目录。

    这里的规则比 default session 更严格：
    workspace session 不做静默推断，必须显式依赖 ``workspace.working_dir``。
    """
    if workspace.working_dir is None or not str(workspace.working_dir).strip():
        raise RuntimeError("workspace.working_dir is required for workspace session runtime")
    return _ensure_directory(str(workspace.working_dir).strip())


def build_session_runtime_spec(db: Session, *, agent_session_id: int, primary_key: str | None) -> SessionRuntimeSpec:
    """按 AgentSession 真相构建运行时规格。

    这是本模块真正的核心函数，其他入口最终都会汇到这里。

    规则总结：
    - default session 使用 Agent 自己的默认工作目录
    - workspace session 使用对应 workspace 的共享工作目录
    - persona 若存在，会追加 prompt_overlay 与 persona skills
    - 若开启 ``ENABLE_WORKSPACE_MESSAGE_CONTEXT``，workspace session 还会额外注入群聊上下文
    """
    if primary_key is None or not str(primary_key).strip():
        raise RuntimeError("primary_key is required for ordinary agent runtime")

    # primary_key 当前会进入 runtime scope，并用于企业知识等需要用户身份的调用链。
    resolved_primary_key = str(primary_key).strip()
    agent_session = get_agent_session(db, agent_session_id)
    if agent_session is None:
        raise RuntimeError("AgentSession not found")
    agent = get_agent(db, agent_session.agent_id)
    if agent is None:
        raise RuntimeError("Agent not found")

    base_agent_dir = resolve_agent_base_dir(agent.id)
    prompt_overlay = None
    skill_source_dirs: list[Path] = [base_agent_dir / "skills"]
    # runtime_context_entries 是最终注入给 deepagents runtime 的结构化上下文条目；
    # scope 则是更紧凑的作用域摘要。
    runtime_context_entries: list[tuple[str, object]] = [
        ("current_agent_name", agent_session.display_name),
        ("agent_session_id", agent_session.id),
        ("primary_key", resolved_primary_key),
    ]
    scope: dict[str, object] | None = {
        "current_agent_name": agent_session.display_name,
        "agent_session_id": agent_session.id,
        "primary_key": resolved_primary_key,
    }

    if agent_session.session_type == "workspace":
        workspace = get_workspace(db, agent_session.workspace_id)
        if workspace is None:
            raise RuntimeError("Workspace not found")
        scope = {
            "current_agent_name": agent_session.display_name,
            "agent_session_id": agent_session.id,
            "primary_key": resolved_primary_key,
            "workspace_id": workspace.id,
        }
        runtime_context_entries.append(("workspace_id", workspace.id))
        if ENABLE_WORKSPACE_MESSAGE_CONTEXT:
            from app.services.workspace_message_context_resolver import build_workspace_message_context

            workspace_message_context = build_workspace_message_context(
                db,
                workspace.id,
                current_agent_session_id=agent_session.id,
            )
            if workspace_message_context:
                runtime_context_entries.append(("workspace_message_context", workspace_message_context))
        working_dir = resolve_workspace_working_dir(workspace)
    else:
        working_dir = resolve_agent_default_working_dir(agent)

    if agent_session.persona_name is not None:
        # persona 的真相完全来自文件系统路径资源；
        # 这里不会查数据库中的 persona 记录。
        persona_bundle = get_persona_resource_bundle(agent_session.persona_name)
        prompt_overlay = persona_bundle["prompt_path"].read_text(encoding="utf-8")
        if persona_bundle["skills_dir"].exists():
            skill_source_dirs.append(persona_bundle["skills_dir"])

    project_skills_dir = runtime_settings.get_project_skills_dir()
    if project_skills_dir is not None:
        skill_source_dirs.append(project_skills_dir)

    return SessionRuntimeSpec(
        agent_session_id=agent_session.id,
        agent_id=agent.id,
        thread_id=agent_session.thread_id,
        display_name=agent_session.display_name,
        working_dir=working_dir,
        base_agent_dir=base_agent_dir,
        persona_name=agent_session.persona_name,
        prompt_overlay=prompt_overlay,
        skill_source_dirs=skill_source_dirs,
        scope=scope,
        runtime_context_entries=runtime_context_entries,
        # 把 session 级子 Agent 工作模式显式折叠进 runtime spec，
        # 后面的 subagent runtime 装配才知道当前该走 null / executor / collaborator 哪条线。
        subagent_mode=agent_session.subagent_mode,
    )


def _normalize_required_primary_key(primary_key: object | None) -> str:
    """把外部传入的 primary_key 归一化为非空字符串。"""
    if primary_key is None:
        raise RuntimeError("primary_key is required for ordinary agent runtime")
    if not isinstance(primary_key, str):
        primary_key = str(primary_key)
    normalized = primary_key.strip()
    if not normalized:
        raise RuntimeError("primary_key is required for ordinary agent runtime")
    return normalized


def resolve_runtime_spec_by_thread_id(*, thread_id: str, primary_key: str | None, db: Session | None = None) -> SessionRuntimeSpec:
    """按 thread_id 反查 AgentSession，并构建运行时规格。

    这是 runtime 建连场景最自然的入口，因为 deepagents runtime 往往先拿到 thread_id。
    """
    if db is None:
        with SessionLocal() as session:
            agent_session = get_agent_session_by_thread_id(session, thread_id)
            if agent_session is None:
                raise RuntimeError("AgentSession not found for thread")
            return build_session_runtime_spec(
                session,
                agent_session_id=agent_session.id,
                primary_key=primary_key,
            )
    agent_session = get_agent_session_by_thread_id(db, thread_id)
    if agent_session is None:
        raise RuntimeError("AgentSession not found for thread")
    return build_session_runtime_spec(
        db,
        agent_session_id=agent_session.id,
        primary_key=primary_key,
    )


def resolve_runtime_spec_by_agent_session_id(
    *,
    agent_session_id: int,
    primary_key: str | None,
    db: Session | None = None,
) -> SessionRuntimeSpec:
    """按 agent_session_id 直接构建运行时规格。

    这是 workspace headless 执行、cron 普通 Agent 执行更常用的入口。
    """
    if db is None:
        with SessionLocal() as session:
            agent_session = get_agent_session(session, agent_session_id)
            if agent_session is None:
                raise RuntimeError("AgentSession not found")
            return build_session_runtime_spec(
                session,
                agent_session_id=agent_session.id,
                primary_key=primary_key,
            )
    agent_session = get_agent_session(db, agent_session_id)
    if agent_session is None:
        raise RuntimeError("AgentSession not found")
    return build_session_runtime_spec(
        db,
        agent_session_id=agent_session.id,
        primary_key=primary_key,
    )


def resolve_primary_key_by_agent_session_id(
    *,
    agent_session_id: int,
    db: Session | None = None,
) -> str | None:
    """从 AgentSession 反查所属 Agent，再返回其 primary_key。

    当前 ``primary_key`` 的真实来源是 ``Agent.user_id``。
    这层服务只是把这条关系显式封装出来，供 headless 执行链复用。
    """
    if db is None:
        with SessionLocal() as session:
            agent_session = get_agent_session(session, agent_session_id)
            if agent_session is None:
                raise RuntimeError("AgentSession not found")
            agent = get_agent(session, agent_session.agent_id)
            if agent is None:
                raise RuntimeError("Agent not found")
            return agent.user_id
    agent_session = get_agent_session(db, agent_session_id)
    if agent_session is None:
        raise RuntimeError("AgentSession not found")
    agent = get_agent(db, agent_session.agent_id)
    if agent is None:
        raise RuntimeError("Agent not found")
    return agent.user_id


def resolve_runtime_spec_for_connection(
    *,
    thread_id: str,
    init_data: Mapping[str, object] | None,
    db: Session | None = None,
) -> SessionRuntimeSpec:
    """面向 runtime 连接入口的包装器。

    这里的职责很窄：只负责从 ``init_data`` 中拿到 ``primary_key``，
    然后转交给 ``resolve_runtime_spec_by_thread_id()``。
    """
    primary_key = _normalize_required_primary_key(
        init_data.get("primary_key") if init_data is not None else None
    )
    return resolve_runtime_spec_by_thread_id(
        thread_id=thread_id,
        primary_key=primary_key,
        db=db,
    )





