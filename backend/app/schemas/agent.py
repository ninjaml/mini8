"""Agent 域对外暴露的 Pydantic 模式定义。

这个文件主要服务两类调用方：
1. ``app.api.agents`` 中的 REST 接口请求/响应体。
2. ``app.services.agent_team_service`` 组装团队视图时使用的只读 view model。

这里刻意把几层身份分开表达：
- ``Agent``: 业务主记录。
- ``AgentSession``: 某个 Agent 在默认场景或 workspace 场景下的稳定运行时会话。
- ``runtime_agent_name`` / ``thread_id``: 真正进入 deepagents 运行时后的标识。
"""

from pydantic import BaseModel, ConfigDict, Field


from app.models import Agent, AgentSession


def build_agent_read(*, agent: Agent, persona_name: str | None, workspace_ids: list[int], default_session: AgentSession | None = None, workspace_session: AgentSession | None = None) -> "AgentRead":
    """组装 Agent 基础读取模型。

    使用方：
    - ``GET /agents``
    - ``GET /agents/{agent_id}``
    - workspace 视角下的 Agent 列表与绑定接口

    语义说明：
    - ``default_session`` 和 ``workspace_session`` 二选一地提供扩展信息。
    - 返回体中的 ``persona_name`` 由调用方决定取默认 session 还是 workspace session。
    """
    default_session_id = default_session.id if default_session is not None else None
    workspace_session_id = workspace_session.id if workspace_session is not None else None
    # `subagent_mode` 的真相在 AgentSession 上，但很多页面拿的是 Agent 读取模型；
    # 所以这里把 default / workspace 两个视角下的 mode 一并抬出来，避免前端为了
    # 一个显示字段再额外打独立 session 查询。
    default_session_subagent_mode = default_session.subagent_mode if default_session is not None else None
    workspace_session_subagent_mode = workspace_session.subagent_mode if workspace_session is not None else None
    return AgentRead(
        id=agent.id,
        user_id=agent.user_id,
        name=agent.name,
        type=agent.type,
        agent_json=agent.agent_json,
        default_working_dir=agent.default_working_dir,
        created_at=agent.created_at,
        persona_name=persona_name,
        default_session_id=default_session_id,
        default_session_subagent_mode=default_session_subagent_mode,
        workspace_session_id=workspace_session_id,
        workspace_session_subagent_mode=workspace_session_subagent_mode,
        workspace_ids=workspace_ids,
    )


def build_agent_team_workspace_read(*, workspace_id: int, workspace_name: str, workspace_session: AgentSession | None) -> "AgentTeamWorkspaceRead":
    """组装 Agent 在单个 workspace 下的绑定摘要。

    使用方：
    - ``agent_team_service._build_workspace_bindings()``
    - 最终进入 ``GET /agents/team/{agent_id}`` 的详情响应
    """
    workspace_session_id = workspace_session.id if workspace_session is not None else None
    return AgentTeamWorkspaceRead(
        workspace_id=workspace_id,
        workspace_name=workspace_name,
        workspace_session_id=workspace_session_id,
        # 团队详情页里的每条 workspace 绑定，也需要回答“这个 workspace session
        # 当前按哪种子 Agent 工作模式运行”。
        workspace_session_subagent_mode=workspace_session.subagent_mode if workspace_session is not None else None,
    )


def build_agent_team_summary_read(
    *,
    agent: Agent,
    default_session: AgentSession | None,
    persona_name: str | None,
    effective_default_working_dir: str,
    skill_count: int,
    subagent_count: int,
    workspace_names: list[str],
) -> "AgentTeamSummaryRead":
    """组装团队列表中的单行摘要。

    使用方：
    - ``agent_team_service.list_agent_team_summaries()``
    - ``GET /agents/team``

    这里是面向团队总览页的 view model，不追求把 Agent 的全部字段原样透出。
    """
    default_session_id = default_session.id if default_session is not None else None
    return AgentTeamSummaryRead(
        id=agent.id,
        name=agent.name,
        created_at=agent.created_at,
        default_session_id=default_session_id,
        persona_name=persona_name,
        default_working_dir=agent.default_working_dir,
        effective_default_working_dir=effective_default_working_dir,
        skill_count=skill_count,
        subagent_count=subagent_count,
        workspace_count=len(workspace_names),
        workspace_names=workspace_names,
    )


def build_agent_subagent_binding_read(
    *,
    binding_id: int,
    parent_agent_id: int,
    child_agent_id: int,
    child_agent_name: str | None,
    subagent_name: str,
    description: str,
    created_at: int,
) -> "AgentSubagentBindingRead":
    """组装 Agent 子代理绑定的读取模型。"""
    return AgentSubagentBindingRead(
        id=binding_id,
        parent_agent_id=parent_agent_id,
        child_agent_id=child_agent_id,
        child_agent_name=child_agent_name,
        subagent_name=subagent_name,
        description=description,
        created_at=created_at,
    )


def build_agent_team_detail_read(
    *,
    agent: Agent,
    default_session: AgentSession,
    effective_default_working_dir: str,
    persona_name: str | None,
    runtime_agent_name: str,
    model_provider: str | None,
    model_name: str | None,
    base_url: str | None,
    base_resources: "AgentBaseResourceRead",
    workspace_bindings: list["AgentTeamWorkspaceRead"],
) -> "AgentTeamDetailRead":
    """组装团队详情页的完整只读结构。

    使用方：
    - ``agent_team_service.get_agent_team_detail()``
    - ``GET /agents/team/{agent_id}``

    这个结构比 ``AgentRead`` 更接近“运营/运维视图”：
    既展示 Agent 主记录，也展示默认 session、运行时目录、模型配置和资源文件。
    """
    return AgentTeamDetailRead(
        id=agent.id,
        name=agent.name,
        created_at=agent.created_at,
        default_working_dir=agent.default_working_dir,
        effective_default_working_dir=effective_default_working_dir,
        default_session_id=default_session.id,
        default_session_thread_id=default_session.thread_id,
        default_session_display_name=default_session.display_name,
        # 团队详情页直接展示 default session 当前 mode，前端无需再拼装第二条查询。
        default_session_subagent_mode=default_session.subagent_mode,
        persona_name=persona_name,
        runtime_agent_name=runtime_agent_name,
        model_provider=model_provider,
        model_name=model_name,
        base_url=base_url,
        base_resources=base_resources,
        workspace_bindings=workspace_bindings,
    )


class AgentCreate(BaseModel):
    """创建 Agent 的请求体。

    使用方：
    - ``POST /agents``

    创建成功后，后端还会同步创建该 Agent 的默认 ``AgentSession``。
    """
    model_config = ConfigDict(extra="forbid")

    user_id: str | None = None
    name: str
    type: str | None = None
    agent_json: str | None = None
    default_working_dir: str | None = None


class AgentUpdate(BaseModel):
    """更新 Agent 主记录的请求体。

    使用方：
    - ``PATCH /agents/{agent_id}``

    这里只描述 Agent 本体字段，不负责 workspace 私有的 persona 之类配置。
    """
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    type: str | None = None
    agent_json: str | None = None
    default_working_dir: str | None = None


class AgentDefaultSessionPersonaUpdate(BaseModel):
    """更新默认 session 人设的请求体。

    使用方：
    - ``PUT /agents/{agent_id}/persona``

    注意修改目标不是 Agent 主记录，而是该 Agent 的默认 ``AgentSession``。
    """
    model_config = ConfigDict(extra="forbid")

    persona_name: str | None = None


class WorkspaceAgentCreate(BaseModel):
    """把已有 Agent 加入某个 workspace 的请求体。

    使用方：
    - ``POST /workspaces/{workspace_id}/agents``

    这里只需要 ``agent_id``，因为 Agent 本体已经存在。
    """
    model_config = ConfigDict(extra="forbid")

    agent_id: int


class WorkspaceAgentUpdate(BaseModel):
    """更新 workspace 视角下 Agent 配置的请求体。

    使用方：
    - ``PATCH /workspaces/{workspace_id}/agents/{agent_id}``

    字段会分流到两处：
    - Agent 主记录：``name/type/agent_json/default_working_dir``
    - workspace 对应的 ``AgentSession``：``persona_name`` 和展示名
    """
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    type: str | None = None
    agent_json: str | None = None
    default_working_dir: str | None = None
    persona_name: str | None = None


class AgentRead(BaseModel):
    """Agent 基础读取模型。

    使用方：
    - ``GET /agents``
    - ``GET /agents/{agent_id}``
    - ``GET /workspaces/{workspace_id}/agents``
    - 各种绑定/解绑/更新接口的返回体

    字段语义：
    - ``default_session_id``: 该 Agent 的默认会话主键。
    - ``workspace_session_id``: 当前 workspace 视角下的会话主键；只有按 workspace 序列化时才有意义。
    - ``workspace_ids``: 这个 Agent 当前已加入的 workspace 列表。
    - ``persona_name``: 由序列化上下文决定，可能来自默认 session，也可能来自当前 workspace session。
    """

    id: int
    user_id: str | None = None
    name: str
    type: str | None = None
    agent_json: str | None = None
    default_working_dir: str | None = None
    created_at: int
    persona_name: str | None = None
    default_session_id: int | None = None
    # default session 视角下的子 Agent 工作模式。
    default_session_subagent_mode: str | None = None
    workspace_session_id: int | None = None
    # 当前 workspace 视角下的子 Agent 工作模式；只有按 workspace 序列化时有意义。
    workspace_session_subagent_mode: str | None = None
    workspace_ids: list[int] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AgentTeamWorkspaceRead(BaseModel):
    """团队详情页里的一条 workspace 绑定信息。

    使用方：
    - ``AgentTeamDetailRead.workspace_bindings``

    它不是 workspace 实体的完整快照，只回答一个问题：
    这个 Agent 当前绑定了哪些 workspace，以及对应的 workspace session 是谁。
    """

    workspace_id: int
    workspace_name: str
    workspace_session_id: int | None = None
    # 该 workspace session 当前的子 Agent 工作模式。
    workspace_session_subagent_mode: str | None = None


class AgentTeamSummaryRead(BaseModel):
    """团队页列表摘要。

    使用方：
    - ``GET /agents/team``

    这是典型的列表项 view model，强调可扫描性：
    会带上技能数、workspace 数、有效工作目录等摘要字段。
    """

    id: int
    name: str
    created_at: int
    default_session_id: int | None = None
    persona_name: str | None = None
    default_working_dir: str | None = None
    effective_default_working_dir: str
    skill_count: int = 0
    subagent_count: int = 0
    workspace_count: int = 0
    workspace_names: list[str] = Field(default_factory=list)


class AgentPromptResourceRead(BaseModel):
    """单个基础提示词资源的读取模型。

    使用方：
    - ``agent_team_service._build_prompt_resources()``
    - ``AgentBaseResourceRead.prompt_resources``

    对应 Agent 基础模板目录中的 ``identity.md / agent.md / tools.md``。
    """
    key: str
    label: str
    path: str
    content: str


class AgentSkillResourceRead(BaseModel):
    """单个技能资源的读取模型。

    使用方：
    - persona 目录扫描
    - Agent runtime 技能目录扫描

    当前 ``description`` 还是预留位，调用方暂时主要消费 ``name/path/content``。
    """
    name: str
    path: str
    description: str = ""
    content: str


class AgentBaseResourceRead(BaseModel):
    """Agent 基础资源总览。

    使用方：
    - ``agent_team_service._build_base_resources()``
    - ``AgentTeamDetailRead.base_resources``

    这个模型描述的是“默认模板 + runtime 副本”的文件系统视图，
    便于前端展示 Agent 继承了哪些基础资源、又额外拥有了哪些私有技能。
    """
    base_template_dir: str
    base_runtime_dir: str
    identity_path: str
    agent_path: str
    tools_path: str
    base_skills_dir: str
    runtime_skills_dir: str
    base_skill_count: int = 0
    private_skill_count: int = 0
    total_skill_count: int = 0
    prompt_resources: list[AgentPromptResourceRead] = Field(default_factory=list)
    runtime_skills: list[AgentSkillResourceRead] = Field(default_factory=list)


class AgentTeamDetailRead(BaseModel):
    """团队详情页完整响应。

    使用方：
    - ``GET /agents/team/{agent_id}``

    它综合了四层信息：
    - Agent 主记录
    - 默认 AgentSession
    - runtime 模型与目录信息
    - workspace 绑定与资源文件概览
    """

    id: int
    name: str
    created_at: int
    default_working_dir: str | None = None
    effective_default_working_dir: str
    default_session_id: int
    default_session_thread_id: str
    default_session_display_name: str
    # 团队详情页默认展示的是 default session 的 mode。
    default_session_subagent_mode: str | None = None
    persona_name: str | None = None
    runtime_agent_name: str
    model_provider: str | None = None
    model_name: str | None = None
    base_url: str | None = None
    base_resources: AgentBaseResourceRead
    workspace_bindings: list[AgentTeamWorkspaceRead] = Field(default_factory=list)


class AgentSubagentBindingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    child_agent_id: int
    subagent_name: str
    description: str


class AgentSubagentBindingRead(BaseModel):
    id: int
    parent_agent_id: int
    child_agent_id: int
    child_agent_name: str | None = None
    subagent_name: str
    description: str
    created_at: int

    model_config = ConfigDict(from_attributes=True)


class PersonaCatalogRead(BaseModel):
    """单个人设目录的只读描述。

    使用方：
    - ``GET /agents/personas``

    返回的是后端扫描到的人设资源快照，不是数据库实体。
    ``skills`` 对应这个 persona 自带的技能目录内容。
    """
    name: str
    persona_dir: str
    prompt_path: str
    skills_dir: str
    readme_path: str | None = None
    readme: str = ""
    prompt: str = ""
    skills: list[AgentSkillResourceRead] = Field(default_factory=list)
