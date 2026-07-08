import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories.agent import get_agent, list_agents
from app.repositories.agent_subagent_binding import list_subagent_bindings_by_parent_agent_id
from app.repositories.agent_session import get_default_agent_session, get_workspace_agent_session
from app.repositories.agent_workspace_binding import list_workspace_ids_by_agent_id
from app.repositories.workspace import get_workspace
from app.schemas.agent import (
    AgentBaseResourceRead,
    AgentPromptResourceRead,
    AgentSkillResourceRead,
    AgentTeamDetailRead,
    AgentTeamSummaryRead,
    AgentTeamWorkspaceRead,
    PersonaCatalogRead,
    build_agent_team_detail_read,
    build_agent_team_summary_read,
    build_agent_team_workspace_read,
)
from app.services.agent_service import ensure_agent_base_dir
from app.services.persona_service import get_persona_resource_bundle
from app.services.session_runtime_service import (
    build_agent_runtime_name,
    resolve_agent_default_working_dir,
)


def _list_skill_names(skills_dir: Path) -> set[str]:
    """列出一个 skills 目录下被当前系统识别的技能名集合。

    识别标准很具体：
    - 子项必须是目录
    - 目录下必须存在 ``SKILL.md``
    """
    if not skills_dir.exists():
        return set()

    names: set[str] = set()
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir():
            continue
        if (entry / "SKILL.md").exists():
            names.add(entry.name)
    return names


def _read_optional_text(path: Path) -> str:
    """读取可选文本文件；不存在时返回空串。"""
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8").strip()


def _read_model_config(runtime_dir: Path) -> tuple[str | None, str | None, str | None]:
    """从 runtime 目录的 ``model_config.json`` 中摘出展示层需要的少量字段。

    当前只读取：
    - provider
    - model_name
    - base_url

    这里是团队视图摘要用途，不尝试暴露整个模型配置文件。
    """
    config_path = runtime_dir / "model_config.json"
    if not config_path.exists():
        return None, None, None
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, None, None
    return payload.get("provider"), payload.get("model_name"), payload.get("base_url")


def _build_prompt_resources(template_dir: Path) -> list[AgentPromptResourceRead]:
    """把基础模板目录中的三份核心 prompt 资源组装成只读视图。"""
    items = [
        ("identity", "identity.md", template_dir / "identity.md"),
        ("agent", "agent.md", template_dir / "agent.md"),
        ("tools", "tools.md", template_dir / "tools.md"),
    ]
    resources: list[AgentPromptResourceRead] = []
    for key, label, path in items:
        resources.append(
            AgentPromptResourceRead(
                key=key,
                label=label,
                path=str(path),
                content=_read_optional_text(path),
            )
        )
    return resources


def _build_runtime_skill_resources(
    skills_dir: Path,
    *,
    allowed_names: set[str] | None = None,
) -> list[AgentSkillResourceRead]:
    """把某个技能目录扫描成技能资源列表。

    ``allowed_names`` 当前主要作为保留参数；
    本文件内现有调用并不会裁剪 runtime skills，只会全量列出。
    """
    resources: list[AgentSkillResourceRead] = []
    if not skills_dir.exists():
        return resources

    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir():
            continue
        if allowed_names is not None and entry.name not in allowed_names:
            continue
        skill_md = entry / "SKILL.md"
        if not skill_md.exists():
            continue
        resources.append(
            AgentSkillResourceRead(
                name=entry.name,
                path=str(skill_md),
                description="",
                content=_read_optional_text(skill_md),
            )
        )
    return resources


def _build_workspace_bindings(db: Session, agent_id: int) -> list[AgentTeamWorkspaceRead]:
    """组装某个 Agent 的 workspace 绑定摘要列表。

    这里读取的是两层真相：
    - ``agent_workspace_binding``：这个 Agent 属于哪些 workspace
    - ``agent_session``：它在这些 workspace 下各自对应哪个稳定 session
    """
    bindings: list[AgentTeamWorkspaceRead] = []
    for workspace_id in list_workspace_ids_by_agent_id(db, agent_id):
        workspace = get_workspace(db, workspace_id)
        workspace_session = get_workspace_agent_session(db, agent_id, workspace_id)
        bindings.append(
            build_agent_team_workspace_read(
                workspace_id=workspace_id,
                workspace_name=workspace.name if workspace is not None else f"workspace-{workspace_id}",
                workspace_session=workspace_session,
            )
        )
    return bindings


def _build_base_resources(agent_id: int) -> AgentBaseResourceRead:
    """组装团队详情页里的“基础资源总览”。

    真实对比的是两棵目录：
    - ``settings.AGENT_BASE_DIR``：平台基础模板
    - ``runtime_agents/agent-{id}``：该 Agent 的 runtime 副本

    计数规则：
    - ``base_skill_count``：基础模板技能数
    - ``private_skill_count``：runtime 独有技能数
    - ``total_skill_count``：按技能名去重后的并集数量
    """
    runtime_dir = ensure_agent_base_dir(agent_id)
    template_dir = settings.AGENT_BASE_DIR
    template_skills_dir = template_dir / "skills"
    runtime_skills_dir = runtime_dir / "skills"

    base_skill_names = _list_skill_names(template_skills_dir)
    runtime_skill_names = _list_skill_names(runtime_skills_dir)
    private_skill_names = runtime_skill_names - base_skill_names

    return AgentBaseResourceRead(
        base_template_dir=str(template_dir),
        base_runtime_dir=str(runtime_dir),
        identity_path=str(template_dir / "identity.md"),
        agent_path=str(template_dir / "agent.md"),
        tools_path=str(template_dir / "tools.md"),
        base_skills_dir=str(template_skills_dir),
        runtime_skills_dir=str(runtime_skills_dir),
        base_skill_count=len(base_skill_names),
        private_skill_count=len(private_skill_names),
        total_skill_count=len(base_skill_names | runtime_skill_names),
        prompt_resources=_build_prompt_resources(template_dir),
        runtime_skills=_build_runtime_skill_resources(runtime_skills_dir),
    )


def list_agent_team_summaries(db: Session) -> list[AgentTeamSummaryRead]:
    """生成 Agent 团队概览页列表。

    每一项都会把三个维度的信息折进摘要里：
    - Agent 主记录
    - default session 的 persona / 工作目录语义
    - runtime 资源规模（技能数、workspace 数）
    """
    payload: list[AgentTeamSummaryRead] = []
    for agent in list_agents(db):
        default_session = get_default_agent_session(db, agent.id)
        workspace_bindings = _build_workspace_bindings(db, agent.id)
        base_resources = _build_base_resources(agent.id)
        payload.append(
            build_agent_team_summary_read(
                agent=agent,
                default_session=default_session,
                persona_name=default_session.persona_name if default_session is not None else None,
                effective_default_working_dir=resolve_agent_default_working_dir(agent),
                skill_count=base_resources.total_skill_count,
                subagent_count=len(list_subagent_bindings_by_parent_agent_id(db, agent.id)),
                workspace_names=[binding.workspace_name for binding in workspace_bindings],
            )
        )
    return payload


def get_agent_team_detail(db: Session, agent_id: int) -> AgentTeamDetailRead | None:
    """生成单个 Agent 的团队详情页数据。

    当前实现有一个值得注意的语义：
    - 若 Agent 不存在，返回 None
    - 若 Agent 存在但 default session 缺失，也返回 None

    也就是说，这里把“对象不存在”和“运行时基础数据不完整”都折成了空结果，
    上层 API 目前会统一表现成 404。
    """
    agent = get_agent(db, agent_id)
    if agent is None:
        return None

    default_session = get_default_agent_session(db, agent.id)
    if default_session is None:
        return None

    runtime_dir = ensure_agent_base_dir(agent.id)
    model_provider, model_name, base_url = _read_model_config(runtime_dir)

    return build_agent_team_detail_read(
        agent=agent,
        default_session=default_session,
        effective_default_working_dir=resolve_agent_default_working_dir(agent),
        persona_name=default_session.persona_name,
        runtime_agent_name=build_agent_runtime_name(agent.id),
        model_provider=model_provider,
        model_name=model_name,
        base_url=base_url,
        base_resources=_build_base_resources(agent.id),
        workspace_bindings=_build_workspace_bindings(db, agent.id),
    )


def list_persona_catalog() -> list[PersonaCatalogRead]:
    """扫描 persona 目录，生成前端可读的人设目录清单。

    这里的人设真相仍然完全来自文件系统：
    - 目录名就是 persona 名
    - ``prompt.md`` 是最小必备资源
    - ``readme.md`` 与 ``skills`` 都是附加展示信息
    """
    payload: list[PersonaCatalogRead] = []
    if not settings.PERSONA_DIR.exists():
        return payload

    for entry in sorted(settings.PERSONA_DIR.iterdir()):
        if not entry.is_dir():
            continue
        bundle = get_persona_resource_bundle(entry.name)
        prompt_path = bundle["prompt_path"]
        if not prompt_path.exists():
            continue
        readme_path = entry / "readme.md"
        skills = _build_runtime_skill_resources(bundle["skills_dir"])
        payload.append(
            PersonaCatalogRead(
                name=entry.name,
                persona_dir=str(bundle["persona_dir"]),
                prompt_path=str(prompt_path),
                skills_dir=str(bundle["skills_dir"]),
                readme_path=str(readme_path) if readme_path.exists() else None,
                readme=_read_optional_text(readme_path),
                prompt=_read_optional_text(prompt_path),
                skills=skills,
            )
        )
    return payload
