import json
import shutil

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import WorkspaceAgent
from app.repositories.workspace import get_workspace
from app.repositories.workspace_agent import (
    create_workspace_agent,
    delete_workspace_agent,
    get_agent_work_item_ids,
    get_workspace_agent,
    get_workspace_agent_by_name,
    list_workspace_agents,
    update_workspace_agent,
)
from app.schemas.workspace_agent import WorkspaceAgentCreate, WorkspaceAgentRead, WorkspaceAgentUpdate


"""
工作空间智能体（Workspace Agent）接口模块。

管理各工作空间下的 Agent 列表，包括增删改查与绑定事项 ID 的序列化。
"""

router = APIRouter(prefix="/workspaces/{workspace_id}/agents", tags=["workspace_agents"])


def _serialize_agent(db: Session, agent: WorkspaceAgent) -> WorkspaceAgentRead:
    """
    序列化 WorkspaceAgent 为响应模型，并注入绑定的工作事项 ID 列表。
    """
    data = WorkspaceAgentRead.model_validate(agent)
    data.work_item_ids = get_agent_work_item_ids(db, agent.id)
    return data


@router.get("", response_model=list[WorkspaceAgentRead])
def read_workspace_agents(workspace_id: int, db: Session = Depends(get_db)):
    """获取指定工作空间下的所有 Agent。"""
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return [_serialize_agent(db, agent) for agent in list_workspace_agents(db, workspace_id)]


@router.post("", response_model=WorkspaceAgentRead)
def create_workspace_agent_endpoint(workspace_id: int, payload: WorkspaceAgentCreate, db: Session = Depends(get_db)):
    """在工作空间下创建新 Agent。

    同一工作空间内不允许存在同名 Agent。
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    if get_workspace_agent_by_name(db, workspace_id, payload.name):
        raise HTTPException(status_code=400, detail="该工作空间已存在同名 Agent")
    agent = WorkspaceAgent(
        user_id=payload.user_id,
        work_space_id=workspace_id,
        name=payload.name,
        type=payload.type,
        agent_json=payload.agent_json or json.dumps({}),
    )
    return _serialize_agent(db, create_workspace_agent(db, agent))


@router.patch("/{agent_id}", response_model=WorkspaceAgentRead)
def update_workspace_agent_endpoint(workspace_id: int, agent_id: int, payload: WorkspaceAgentUpdate, db: Session = Depends(get_db)):
    """更新 Agent 字段（支持部分更新），需校验所属空间。

    若修改名称，新名称不能与同一工作空间内的其他 Agent 重复。
    """
    agent = get_workspace_agent(db, agent_id)
    if not agent or agent.work_space_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if payload.name is not None:
        existing = get_workspace_agent_by_name(db, workspace_id, payload.name)
        if existing and existing.id != agent_id:
            raise HTTPException(status_code=400, detail="该工作空间已存在同名 Agent")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    return _serialize_agent(db, update_workspace_agent(db, agent))


@router.delete("/{agent_id}")
def delete_workspace_agent_endpoint(workspace_id: int, agent_id: int, db: Session = Depends(get_db)):
    """删除指定 Agent，需校验所属空间。

    删除时会同步清理：
    1. agent_work 关联表中的绑定记录
    2. 运行时目录 data/runtime/agents/workagent-{agent_id}
    3. 工作目录 ~/.CamphorEOS/workagents/{agent_id}
    """
    agent = get_workspace_agent(db, agent_id)
    if not agent or agent.work_space_id != workspace_id:
        raise HTTPException(status_code=404, detail="Agent not found")

    # 清理运行时目录
    runtime_dir = settings.RUNTIME_AGENTS_DIR / f"workagent-{agent_id}"
    if runtime_dir.exists():
        shutil.rmtree(runtime_dir)

    # 清理工作目录（仅清理默认路径；若用户自定义了 working_dir，不自动清理，避免误删）
    work_dir = settings.WORKAGENT_WORK_DIR / str(agent_id)
    if work_dir.exists():
        shutil.rmtree(work_dir)

    delete_workspace_agent(db, agent)
    return {"status": "deleted"}
