"""AgentSession 的请求/响应模型。

这层 schema 对应的是平台数据库里的稳定会话记录，
不是 deepagents runtime 内部保存的事件流或 checkpoint。

从当前调用链可以确认：
- 每个 Agent 会创建一个 default session。
- 每个 Agent 在每个 workspace 下最多有一个 workspace session。
- runtime 侧主要靠 ``thread_id`` 反查并恢复到某个 AgentSession。
- ``persona_name`` 和 ``display_name`` 都是 session 级配置，而不是 Agent 主表字段。
"""

from pydantic import BaseModel


class AgentSessionUpdate(BaseModel):
    """更新 AgentSession 的请求体。

    当前只开放 ``subagent_mode``，因为这次双模式实现里真正允许用户显式切换的
    只有会话级子 Agent 工作模式。
    """

    subagent_mode: str | None = None


class AgentSessionCreate(BaseModel):
    """创建 AgentSession 的请求体。

    目前仓库内没有公开 API 直接消费这个 schema；
    当前 AgentSession 主要由 service/repository 内部创建。

    它更像是给后续接口或内部装配预留的输入结构。
    """
    # 归属的 Agent 主记录 ID。
    agent_id: int
    # 会话类型；当前代码路径只实际使用 ``default`` 和 ``workspace``。
    session_type: str
    # 当 session_type=workspace 时表示所属 workspace；default session 固定为 None。
    workspace_id: int | None = None
    # 运行时稳定 thread 标识。
    # session_runtime_service 会用它反查 AgentSession 并恢复运行时规格。
    thread_id: str
    # 该会话挂载的人设名称；运行时会按它加载 persona prompt 与 skills。
    persona_name: str | None = None
    # 该会话对外展示名称；会进入前端展示，也会进入 runtime scope 里的 current_agent_name。
    display_name: str


class AgentSessionRead(BaseModel):
    """AgentSession 的读取模型。

    使用方：
    - ``GET /agent-sessions/{session_id}``
    - ``GET /agent-sessions/by-agent/{agent_id}``

    这个响应的主语是“稳定会话记录”本身，
    用来回答某个 Agent 当前拥有哪些 default/workspace 会话，
    以及这些会话各自绑定了哪个 runtime thread。
    """
    # AgentSession 表主键。
    id: int
    # 所属 Agent 主记录 ID。
    agent_id: int
    # 会话类型；当前为 ``default`` 或 ``workspace``。
    session_type: str
    # workspace 会话所属的 workspace；default session 为 None。
    workspace_id: int | None = None
    # 运行时稳定 thread_id。
    # workspace_message、runtime_cleanup、session_runtime_service、cron 作用域解析都会用到这条线索。
    thread_id: str
    # 会话级 persona 名称；default session 和 workspace session 可以各自不同。
    persona_name: str | None = None
    # 会话展示名；默认跟随 Agent 名称初始化，后续可在 default/workspace 维度分别修改。
    display_name: str
    # 当前会话里的子 Agent 工作模式；无显式 child roster 时为 null。
    subagent_mode: str | None = None
    # 创建时间，毫秒时间戳。
    created_at: int
    # 更新时间，毫秒时间戳；session 真相（如 persona / display_name / subagent_mode）
    # 发生变更时，由 repository 层统一刷新。
    updated_at: int

    model_config = {"from_attributes": True}
