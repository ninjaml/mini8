from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import ResourceKey
from app.repositories.resource_key import create_resource_key, delete_resource_keys_by_target, delete_resource_keys_by_targets
from app.repositories.work_item import delete_agent_work_bindings_by_item_ids
from app.repositories.workspace import (
    create_workspace,
    delete_workspace,
    delete_workspace_related_rows,
    get_workspace,
    get_workspace_by_name,
    list_workspace_item_ids,
    list_workspaces,
    update_workspace,
)
from app.schemas.workspace import WorkspaceCreate, WorkspaceDashboard, WorkspaceRead, WorkspaceUpdate
from app.services.dashboard import build_workspace_dashboard
from app.services.history_storage import delete_workspace_dir
from app.services.runtime_cleanup import delete_workspace_superagent_runtime_artifacts


"""
工作空间（Workspace）接口模块。

提供工作空间的增删改查、仪表盘数据获取，以及级联删除时
物理目录与运行时残留的统一清理。
"""

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceRead])
def read_workspaces(db: Session = Depends(get_db)):
    """获取所有工作空间列表。"""
    return list_workspaces(db)


@router.post("", response_model=WorkspaceRead)
def create_workspace_endpoint(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    """
    创建工作空间，名称全局唯一。
    创建成功后生成 resource key，供后续 Skill 定位空间。
    """
    if get_workspace_by_name(db, payload.name):
        raise HTTPException(status_code=409, detail="Workspace name already exists")
    workspace = create_workspace(
        db,
        user_id=payload.user_id,
        name=payload.name,
        goal=payload.goal,
        super_agent_nick_name=payload.super_agent_nick_name,
    )
    # 工作空间本身也要有资源锚点，后续空间级 Skill / 权限控制都靠它定位。
    create_resource_key(
        db,
        ResourceKey(
            key=str(uuid4()),
            resource_type="work_space",
            resource_identity=str(workspace.id),
        ),
    )
    return workspace


@router.get("/{workspace_id}", response_model=WorkspaceRead)
def read_workspace(workspace_id: int, db: Session = Depends(get_db)):
    """获取单个工作空间详情。"""
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


@router.get("/{workspace_id}/dashboard", response_model=WorkspaceDashboard)
def read_dashboard(workspace_id: int, db: Session = Depends(get_db)):
    """获取指定工作空间的仪表盘统计数据。"""
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return build_workspace_dashboard(db, workspace_id)


@router.patch("/{workspace_id}", response_model=WorkspaceRead)
def update_workspace_endpoint(
    workspace_id: int,
    payload: WorkspaceUpdate,
    db: Session = Depends(get_db),
):
    """更新工作空间名称和目标描述。

    若传入 name，则校验全局唯一性（排除自身）。
    """
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if payload.name is not None and payload.name != workspace.name:
        if get_workspace_by_name(db, payload.name):
            raise HTTPException(status_code=409, detail="Workspace name already exists")

    updated = update_workspace(
        db,
        workspace,
        name=payload.name,
        goal=payload.goal,
    )
    return updated


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace_endpoint(
    workspace_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    级联删除工作空间及其所有关联数据。

    清理顺序：
    1. 物理删除成果目录
    2. 删除 SuperAgent 运行时目录与 session
    3. 删除 agent-work 绑定
    4. 删除数据库级联行
    5. 删除 resource keys
    6. 删除工作空间本身
    """
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    item_ids = list_workspace_item_ids(db, workspace_id)
    session_manager = getattr(request.app.state, "runtime_session_manager", None)

    # 先删整空间成果目录，再删数据库映射，确保不会留下孤儿文件。
    delete_workspace_dir(workspace_id)
    await delete_workspace_superagent_runtime_artifacts(workspace_id, session_manager)
    delete_agent_work_bindings_by_item_ids(db, item_ids)
    delete_workspace_related_rows(db, workspace_id, item_ids)
    delete_resource_keys_by_target(db, "work_space", str(workspace_id))
    delete_resource_keys_by_targets(db, "work_item", [str(item_id) for item_id in item_ids])
    delete_workspace(db, workspace)
