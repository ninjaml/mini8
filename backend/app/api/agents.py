"""Agent 相关接口。

覆盖三类后端能力：
1. Agent 本体的增删改查。
2. Agent 与 workspace 的绑定、解绑，以及 workspace 视角下的配置更新。
3. 运行时相关的辅助设置，例如工作目录、本地路径打开、AgentSession 查询。
"""

import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Agent
from app.repositories.agent import (
    delete_agent,
    get_agent,
    get_agent_by_name,
    get_workspace_agent_by_name,
    list_agents,
    list_agents_by_workspace_id,
    update_agent,
)
from app.services.agent_service import bind_agent_into_workspace_session, create_agent_with_default_session
from app.repositories.agent_session import (
    delete_agent_sessions_by_agent_id,
    get_agent_session,
    list_agent_sessions,
    delete_workspace_agent_session,
    get_default_agent_session,
    get_workspace_agent_session,
    update_agent_session,
)
from app.repositories.agent_subagent_binding import list_subagent_bindings_by_parent_agent_id
from app.repositories.agent_workspace_binding import (
    delete_workspace_bindings_by_agent_id,
    delete_agent_workspace_binding,
    list_workspace_ids_by_agent_id,
)
from app.repositories.moss_config import get_moss_config, set_moss_config
from app.repositories.workspace import get_workspace
from app.schemas.agent import (
    AgentCreate,
    AgentTeamDetailRead,
    AgentSubagentBindingCreate,
    AgentSubagentBindingRead,
    AgentTeamSummaryRead,
    AgentDefaultSessionPersonaUpdate,
    AgentRead,
    AgentUpdate,
    PersonaCatalogRead,
    WorkspaceAgentCreate,
    WorkspaceAgentUpdate,
    build_agent_read,
)
from app.services.agent_team_service import get_agent_team_detail, list_agent_team_summaries, list_persona_catalog
from app.services.persona_service import persona_exists
from app.services.agent_lifecycle_service import delete_agent_with_relations
from app.services.agent_subagent_service import (
    create_agent_subagent_binding,
    delete_agent_subagent_binding,
    list_agent_subagent_bindings,
)
from app.schemas.agent_session import AgentSessionRead, AgentSessionUpdate
from app.services.runtime_cleanup import delete_agent_runtime_artifacts, delete_agent_runtime_sessions, delete_workspace_runtime_session


router = APIRouter(prefix="/agents", tags=["agents"])
workspace_agents_router = APIRouter(prefix="/workspaces/{workspace_id}/agents", tags=["workspace_agents"])
agent_settings_router = APIRouter(prefix="/agents", tags=["agent_settings"])
agent_sessions_router = APIRouter(prefix="/agent-sessions", tags=["agent_sessions"])


def _serialize_agent(db: Session, agent) -> AgentRead:
    """把 Agent 本体和它的默认 session 拼成前端需要的完整结构。"""
    default_session = get_default_agent_session(db, agent.id)
    workspace_ids = list_workspace_ids_by_agent_id(db, agent.id)
    return build_agent_read(
        agent=agent,
        persona_name=default_session.persona_name if default_session is not None else None,
        workspace_ids=workspace_ids,
        default_session=default_session,
    )


def _serialize_workspace_agent(db: Session, agent, workspace_id: int | None = None) -> AgentRead:
    """按 workspace 视角序列化 Agent，优先附带该 workspace 下的 session 信息。"""
    workspace_ids = list_workspace_ids_by_agent_id(db, agent.id)
    workspace_session = None
    persona_name = None
    if workspace_id is not None and workspace_id in workspace_ids:
        workspace_session = get_workspace_agent_session(db, agent.id, workspace_id)
        persona_name = workspace_session.persona_name if workspace_session is not None else None
    return build_agent_read(
        agent=agent,
        persona_name=persona_name,
        workspace_ids=workspace_ids,
        workspace_session=workspace_session,
    )


class WorkingDirPayload(BaseModel):
    """更新工作目录时使用的统一请求体。

    ``kind`` 决定 ``ref_id`` 的解释方式：
    - ``moss``: 忽略 ``ref_id``
    - ``agent``: ``ref_id`` 表示 Agent 主记录 ID
    """
    kind: str
    ref_id: int | None = None
    dir: str | None = None


class OpenLocalPathPayload(BaseModel):
    """请求桌面端打开本地路径的请求体。"""
    path: str


def _validate_working_dir(path: str | None) -> None:
    """校验并预创建工作目录，避免把明显非法的路径写入数据库。"""
    if path is None or path.strip() == "":
        return
    p = Path(path)
    if not p.is_absolute():
        raise HTTPException(status_code=400, detail="工作目录必须是绝对路径")
    if ".." in p.parts:
        raise HTTPException(status_code=400, detail="工作目录路径不能包含 '..'")
    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法创建目录: {e}")


def _resolve_core_agent(db: Session, ref_id: int) -> Agent:
    """按主键读取 Agent 主记录。"""
    agent = db.get(Agent, ref_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("", response_model=list[AgentRead])
def read_agents(db: Session = Depends(get_db)):
    """读取全部 Agent 列表。

    返回的是“全局 Agent 视角”：
    - 会附带 default session 信息
    - 不会附带某个 workspace 专属 session 信息
    """
    return [_serialize_agent(db, agent) for agent in list_agents(db)]


@router.get("/team", response_model=list[AgentTeamSummaryRead])
def read_agent_team(db: Session = Depends(get_db)):
    """读取 Agent 团队概览，用于团队/协作类页面。"""
    return list_agent_team_summaries(db)


@router.get("/team/{agent_id}", response_model=AgentTeamDetailRead)
def read_agent_team_detail(agent_id: int, db: Session = Depends(get_db)):
    """读取单个 Agent 的团队详情。

    真实组装逻辑在 ``agent_team_service``；
    路由层这里只负责把 service 返回的 ``None`` 统一映射为 404。
    """
    detail = get_agent_team_detail(db, agent_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return detail


@router.get("/personas", response_model=list[PersonaCatalogRead])
def read_persona_catalog():
    """列出当前后端可用的人设目录。"""
    return list_persona_catalog()


@router.get("/{agent_id:int}", response_model=AgentRead)
def read_agent(agent_id: int, db: Session = Depends(get_db)):
    """按全局视角读取单个 Agent。"""
    agent = get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _serialize_agent(db, agent)


@router.post("", response_model=AgentRead)
def create_agent_endpoint(payload: AgentCreate, db: Session = Depends(get_db)):
    """创建 Agent，并同步创建 default session 与基础 runtime 目录。"""
    if get_agent_by_name(db, payload.name):
        raise HTTPException(status_code=400, detail="Agent name already exists")

    agent, _default_session = create_agent_with_default_session(
        db,
        user_id=payload.user_id,
        name=payload.name,
        type=payload.type,
        agent_json=payload.agent_json,
        default_working_dir=payload.default_working_dir,
        display_name=payload.name,
    )
    return _serialize_agent(db, agent)


@router.patch("/{agent_id:int}", response_model=AgentRead)
def update_agent_endpoint(agent_id: int, payload: AgentUpdate, db: Session = Depends(get_db)):
    """更新 Agent 主记录。

    注意这里改的是“全局 Agent 主记录”：
    - name/type/agent_json/default_working_dir 都写回 ``agent`` 表
    - 若改了 name，会顺手同步 default session 的 ``display_name``
    - 不会改任何 workspace 专属 session 的 persona / display_name
    """
    agent = get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")

    if payload.name is not None:
        existing = get_agent_by_name(db, payload.name)
        if existing is not None and existing.id != agent_id:
            raise HTTPException(status_code=400, detail="Agent name already exists")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(agent, field, value)
    updated = update_agent(db, agent)

    default_session = get_default_agent_session(db, updated.id)
    if default_session is not None:
        if payload.name is not None:
            default_session.display_name = payload.name
        update_agent_session(db, default_session)

    return _serialize_agent(db, updated)


@router.delete("/{agent_id:int}")
async def delete_agent_endpoint(agent_id: int, request: Request, db: Session = Depends(get_db)):
    """彻底删除一个 Agent。

    当前删除顺序是：
    1. 在同一数据库事务里删除 subagent 绑定、AgentSession、workspace 绑定、Agent 主记录
    2. 数据库提交成功后，再异步清理 vendor runtime sessions 与本地 runtime scaffold
    """
    agent = get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    session_manager = getattr(request.app.state, "runtime_session_manager", None)
    try:
        await delete_agent_with_relations(
            db=db,
            agent_id=agent.id,
            session_manager=session_manager,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "deleted"}


@router.get("/{agent_id:int}/subagents", response_model=list[AgentSubagentBindingRead])
def read_agent_subagents(agent_id: int, db: Session = Depends(get_db)):
    agent = get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return list_agent_subagent_bindings(db, parent_agent_id=agent_id)


@router.post("/{agent_id:int}/subagents", response_model=AgentSubagentBindingRead)
def create_agent_subagent_endpoint(agent_id: int, payload: AgentSubagentBindingCreate, db: Session = Depends(get_db)):
    try:
        return create_agent_subagent_binding(
            db,
            parent_agent_id=agent_id,
            child_agent_id=payload.child_agent_id,
            subagent_name=payload.subagent_name,
            description=payload.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{agent_id:int}/subagents/{binding_id:int}")
async def delete_agent_subagent_endpoint(
    agent_id: int,
    binding_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        # 删单个 binding 不只是删数据库关系；协作者模式下，这条 binding 对应的
        # child checkpoint / memory 也要一起清，所以这里需要把 runtime_session_manager
        # 从应用级 state 里取出来继续往 service 层传。
        session_manager = getattr(request.app.state, "runtime_session_manager", None)
        await delete_agent_subagent_binding(
            db,
            parent_agent_id=agent_id,
            binding_id=binding_id,
            session_manager=session_manager,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}


@router.put("/{agent_id:int}/persona", response_model=AgentRead)
def update_agent_persona_endpoint(agent_id: int, payload: AgentDefaultSessionPersonaUpdate, db: Session = Depends(get_db)):
    """更新 Agent 默认 session 绑定的人设。

    这里只影响 default session；
    workspace 内单独覆盖的人设不走这条接口。
    """
    agent = get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not persona_exists(payload.persona_name):
        raise HTTPException(status_code=400, detail="Persona not found")
    default_session = get_default_agent_session(db, agent.id)
    if default_session is None:
        raise HTTPException(status_code=404, detail="Default AgentSession not found")
    default_session.persona_name = payload.persona_name
    update_agent_session(db, default_session)
    return _serialize_agent(db, agent)


@router.put("/{agent_id:int}/workspaces/{workspace_id:int}", response_model=AgentRead)
def bind_agent_workspace_endpoint(agent_id: int, workspace_id: int, db: Session = Depends(get_db)):
    """把一个已存在的 Agent 绑定进工作空间。

    这一步只建立 workspace 绑定关系，并创建该 Agent 在该 workspace 下的稳定 workspace session。
    不会改动 Agent 的 default session，也不会在这里决定 persona。
    """
    agent = get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if get_workspace(db, workspace_id) is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    bind_agent_into_workspace_session(
        db,
        agent_id=agent_id,
        workspace_id=workspace_id,
    )
    return _serialize_workspace_agent(db, agent, workspace_id)


@router.delete("/{agent_id:int}/workspaces/{workspace_id:int}", response_model=AgentRead)
async def unbind_agent_workspace_endpoint(agent_id: int, workspace_id: int, request: Request, db: Session = Depends(get_db)):
    """解除 Agent 与工作空间的绑定。

    这一步会删除对应的 workspace session 与运行时残留，但不会删除 Agent 本体及其 default session。
    """
    agent = get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    session_manager = getattr(request.app.state, "runtime_session_manager", None)
    await delete_workspace_runtime_session(db, agent_id, workspace_id, session_manager)
    delete_agent_workspace_binding(db, agent_id, workspace_id)
    delete_workspace_agent_session(db, agent_id, workspace_id)
    return _serialize_agent(db, agent)


@workspace_agents_router.get("", response_model=list[AgentRead])
def read_workspace_agents(workspace_id: int, db: Session = Depends(get_db)):
    """列出某个 workspace 当前绑定的全部 Agent。

    返回的是“workspace 视角”：
    - ``workspace_session_id`` 有意义
    - ``persona_name`` 优先来自该 workspace session
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return [_serialize_workspace_agent(db, agent, workspace_id) for agent in list_agents_by_workspace_id(db, workspace_id)]


@workspace_agents_router.post("", response_model=AgentRead)
def create_workspace_agent_endpoint(workspace_id: int, payload: WorkspaceAgentCreate, db: Session = Depends(get_db)):
    """把已有 Agent 加入指定 workspace。

    这不是“新建 Agent 本体”，而是复用已有 Agent，补一层 workspace 成员关系。
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    agent = get_agent(db, payload.agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if workspace_id in list_workspace_ids_by_agent_id(db, agent.id):
        raise HTTPException(status_code=400, detail="Agent already joined this workspace")

    bind_agent_into_workspace_session(
        db,
        agent_id=agent.id,
        workspace_id=workspace_id,
    )
    return _serialize_workspace_agent(db, agent, workspace_id)


@workspace_agents_router.patch("/{agent_id:int}", response_model=AgentRead)
def update_workspace_agent_endpoint(workspace_id: int, agent_id: int, payload: WorkspaceAgentUpdate, db: Session = Depends(get_db)):
    """更新 workspace 成员配置。

    其中 Agent 本体字段会直接写回主记录；
    persona 和展示名则落在该 workspace 对应的 session 上。

    也就是说，这条接口同时可能碰两层数据：
    - ``agent`` 表：例如 name/type/agent_json/default_working_dir
    - 该 workspace 的 ``agent_session``：例如 persona_name / display_name
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    agent = get_agent(db, agent_id)
    if agent is None or workspace_id not in list_workspace_ids_by_agent_id(db, agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    if payload.name is not None:
        existing = get_workspace_agent_by_name(db, workspace_id, payload.name)
        if existing is not None and existing.id != agent_id:
            raise HTTPException(status_code=400, detail="该工作空间已存在同名 Agent")

    if payload.persona_name is not None and not persona_exists(payload.persona_name):
        raise HTTPException(status_code=400, detail="Persona not found")

    updates = payload.model_dump(exclude_unset=True, exclude={"persona_name"})
    for field, value in updates.items():
        setattr(agent, field, value)
    agent = update_agent(db, agent)
    workspace_session = get_workspace_agent_session(db, agent.id, workspace_id)
    if workspace_session is not None:
        if payload.name is not None:
            workspace_session.display_name = payload.name
        if "persona_name" in payload.model_dump(exclude_unset=True):
            workspace_session.persona_name = payload.persona_name
        update_agent_session(db, workspace_session)
    return _serialize_workspace_agent(db, agent, workspace_id)


@workspace_agents_router.delete("/{agent_id:int}")
async def delete_workspace_agent_endpoint(workspace_id: int, agent_id: int, request: Request, db: Session = Depends(get_db)):
    """把 Agent 从 workspace 中移除，并回收该 workspace 专属 session。

    这里只做“成员解绑”，不会删除 Agent 本体。
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    agent = get_agent(db, agent_id)
    if agent is None or workspace_id not in list_workspace_ids_by_agent_id(db, agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")

    session_manager = getattr(request.app.state, "runtime_session_manager", None)
    await delete_workspace_runtime_session(db, agent_id, workspace_id, session_manager)
    delete_agent_workspace_binding(db, agent_id, workspace_id)
    delete_workspace_agent_session(db, agent_id, workspace_id)
    return {"status": "unbound"}


@agent_settings_router.patch("/working-dir")
def update_working_dir(payload: WorkingDirPayload, db: Session = Depends(get_db)):
    """更新 MOSS 或普通 Agent 的默认工作目录。

    落点区别：
    - ``kind == "moss"``: 写入 moss_config
    - ``kind == "agent"``: 写入 Agent 主记录的 ``default_working_dir``
    """
    _validate_working_dir(payload.dir)

    if payload.kind == "moss":
        set_moss_config(db, "moss_working_dir", payload.dir)
        return {"kind": "moss", "ref_id": None, "dir": payload.dir}

    if payload.kind != "agent":
        raise HTTPException(status_code=400, detail="Unsupported agent kind")
    if payload.ref_id is None:
        raise HTTPException(status_code=400, detail="ref_id is required")

    agent = _resolve_core_agent(db, payload.ref_id)
    agent.default_working_dir = payload.dir
    db.commit()
    return {"kind": "agent", "ref_id": payload.ref_id, "dir": payload.dir}


@agent_settings_router.get("/working-dir")
def get_working_dir(kind: str, ref_id: int | None = None, db: Session = Depends(get_db)):
    """读取 MOSS 或普通 Agent 的默认工作目录。"""
    if kind == "moss":
        item = get_moss_config(db, "moss_working_dir")
        return {"kind": "moss", "ref_id": None, "dir": item.value if item else None}

    if kind != "agent":
        raise HTTPException(status_code=400, detail="Unsupported agent kind")
    if ref_id is None:
        raise HTTPException(status_code=400, detail="ref_id required")

    agent = _resolve_core_agent(db, ref_id)
    return {"kind": "agent", "ref_id": ref_id, "dir": agent.default_working_dir}


@agent_settings_router.post("/open-local-path")
def open_local_path(payload: OpenLocalPathPayload):
    """让桌面端直接在系统文件管理器中打开一个本地路径。

    当前主要服务前端里的“打开工作目录/本地目录”按钮。
    """
    raw_path = (payload.path or "").strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail="path is required")

    target = Path(raw_path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="本地路径不存在")

    try:
        if os.name == "nt":
            subprocess.Popen(["explorer.exe", str(target)])
        else:
            os.startfile(str(target))  # type: ignore[attr-defined]
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"打开本地路径失败: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"打开本地路径失败: {exc}") from exc

    return {"status": "opened", "path": str(target)}


@agent_sessions_router.get("/{session_id}", response_model=AgentSessionRead)
def read_agent_session(session_id: int, db: Session = Depends(get_db)):
    """按 ID 读取单个 AgentSession。

    这里显式返回 ``AgentSessionRead``，让前端能稳定读到 ``subagent_mode``。
    """
    session = get_agent_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="AgentSession not found")
    return session


@agent_sessions_router.patch("/{session_id}", response_model=AgentSessionRead)
def patch_agent_session(session_id: int, payload: AgentSessionUpdate, db: Session = Depends(get_db)):
    """更新单个 AgentSession 的子 Agent 工作模式。"""
    session = get_agent_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="AgentSession not found")

    subagent_mode = payload.subagent_mode
    if subagent_mode not in {None, "executor", "collaborator"}:
        raise HTTPException(status_code=400, detail="Invalid subagent_mode")

    has_bindings = bool(list_subagent_bindings_by_parent_agent_id(db, session.agent_id))
    # 三态约束：
    # - 没有显式 child bindings 时，只允许 `null`
    # - 只要还存在 child bindings，就不允许手动改回 `null`
    if not has_bindings and subagent_mode in {"executor", "collaborator"}:
        raise HTTPException(status_code=400, detail="Cannot set subagent_mode without subagent bindings")
    if has_bindings and subagent_mode is None:
        raise HTTPException(status_code=400, detail="Cannot set subagent_mode to null while bindings exist")

    session.subagent_mode = subagent_mode
    return update_agent_session(db, session)


@agent_sessions_router.get("/by-agent/{agent_id}", response_model=list[AgentSessionRead])
def read_agent_sessions(agent_id: int, db: Session = Depends(get_db)):
    """读取某个 Agent 名下的全部 session。

    返回里会同时包含 default session 与各个 workspace session，
    并统一暴露 ``subagent_mode`` 给团队详情页 / 会话页使用。
    """
    if get_agent(db, agent_id) is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return list_agent_sessions(db, agent_id)





