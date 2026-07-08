"""Workspace 的请求/响应模型。

这里的主语是平台侧的工作空间主记录。

从当前调用链可以确认：
- workspace 是 workspace session、workspace_message、work knowledge 等数据的共同作用域锚点。
- ``working_dir`` 不是装饰性字段，而是 workspace session 运行时直接依赖的共享目录真相。
- 接口层要求 ``working_dir`` 显式给出且必须是绝对路径，不做静默推断。
"""

from pydantic import BaseModel


class WorkspaceCreate(BaseModel):
    """创建 workspace 的请求体。

    使用方：
    - ``POST /workspaces``

    创建时会要求显式提供 ``working_dir``，
    因为后续所有 workspace session 都会直接复用这个共享目录。
    """

    # 归属用户标识；当前业务允许为空。
    user_id: str | None = None
    # 工作空间名称；接口层当前要求全局唯一。
    name: str
    # 工作空间目标或背景说明，主要供前端和协作流程展示。
    goal: str | None = None
    # workspace 共享工作目录。
    # API 层会校验它非空、为绝对路径、且不能包含 ``..``。
    working_dir: str


class WorkspaceUpdate(BaseModel):
    """更新 workspace 的请求体。

    使用方：
    - ``PATCH /workspaces/{workspace_id}``

    三个字段都表示对 workspace 主记录本身的修改。
    其中 ``working_dir`` 一旦修改，会影响后续 workspace session 的运行时工作目录解析。
    """

    # 新的工作空间名称；若提供且发生变化，接口层会检查全局唯一。
    name: str | None = None
    # 新的目标或背景说明。
    goal: str | None = None
    # 新的共享工作目录；若提供，会走与创建时相同的路径校验。
    working_dir: str | None = None


class WorkspaceRead(BaseModel):
    """workspace 的读取模型。

    使用方：
    - ``GET /workspaces``
    - ``GET /workspaces/{workspace_id}``
    - workspace 创建/更新后的返回体

    这个响应回答的是“workspace 主记录现在长什么样”，
    不直接展开它绑定了哪些 Agent 或消息历史。
    """

    # Workspace 表主键。
    id: int
    # 归属用户标识；当前允许为空。
    user_id: str | None = None
    # 工作空间名称。
    name: str
    # 工作空间目标或背景说明。
    goal: str | None = None
    # workspace 共享工作目录；runtime 侧 resolve_workspace_working_dir() 会直接依赖它。
    working_dir: str
    # 创建时间，毫秒时间戳。
    created_at: int

    model_config = {"from_attributes": True}
