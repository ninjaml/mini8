from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.workspace import (
    create_workspace,
    delete_workspace,
    delete_workspace_related_rows,
    get_workspace,
    get_workspace_by_name,
    list_workspaces,
    update_workspace,
)
from app.schemas.workspace import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate
from app.services.workspace_filesystem import delete_workspace_filesystem_dir
from app.services.runtime_cleanup import delete_workspace_runtime_sessions


"""
工作空间（Workspace）接口模块。

提供工作空间的增删改查，以及删除时
物理目录、运行时残留和 workspace 自有数据的统一清理。
"""

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _validate_workspace_working_dir(path: str) -> str:
    """校验 workspace 共享工作目录输入。

    这里只做字符串与路径形态校验，不负责创建目录；
    真正是否存在、是否可写，由后续运行时按需要处理。
    """
    normalized = str(path).strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Workspace working_dir is required")
    candidate = Path(normalized)
    if not candidate.is_absolute():
        raise HTTPException(status_code=400, detail="工作目录必须是绝对路径")
    if ".." in candidate.parts:
        raise HTTPException(status_code=400, detail="工作目录路径不能包含 '..'")
    return normalized


@router.post("/pick-working-dir")
def pick_working_dir():
    """弹出本地目录选择框，返回用户选中的绝对路径。"""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:  # pragma: no cover - 受运行环境影响
        raise HTTPException(status_code=500, detail=f"当前环境不支持目录选择: {exc}") from exc

    root = None
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(title="选择工作目录")
        if not selected:
            return {"path": None}
        normalized = _validate_workspace_working_dir(selected)
        return {"path": normalized}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"选择目录失败: {exc}") from exc
    finally:
        if root is not None:
            try:
                root.destroy()
            except Exception:
                pass


@router.get("", response_model=list[WorkspaceRead])
def read_workspaces(db: Session = Depends(get_db)):
    """获取所有工作空间列表。"""
    return list_workspaces(db)


@router.post("", response_model=WorkspaceRead)
def create_workspace_endpoint(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    """
    创建工作空间，名称全局唯一，并要求显式提供共享工作目录。

    这里创建的是 workspace 主记录本身；
    不会顺带创建 agent 绑定、session 或工作目录脚手架。
    """
    if get_workspace_by_name(db, payload.name):
        raise HTTPException(status_code=409, detail="Workspace name already exists")
    working_dir = _validate_workspace_working_dir(payload.working_dir)
    workspace = create_workspace(
        db,
        user_id=payload.user_id,
        name=payload.name,
        goal=payload.goal,
        working_dir=working_dir,
    )
    return workspace


@router.get("/{workspace_id}", response_model=WorkspaceRead)
def read_workspace(workspace_id: int, db: Session = Depends(get_db)):
    """获取单个工作空间详情。"""
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


@router.patch("/{workspace_id}", response_model=WorkspaceRead)
def update_workspace_endpoint(
    workspace_id: int,
    payload: WorkspaceUpdate,
    db: Session = Depends(get_db),
):
    """更新工作空间名称、目标描述与共享目录。

    ``working_dir`` 一旦改掉，会影响后续所有 workspace session
    对共享工作目录的解析结果。
    """
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    if payload.name is not None and payload.name != workspace.name:
        if get_workspace_by_name(db, payload.name):
            raise HTTPException(status_code=409, detail="Workspace name already exists")

    working_dir = _validate_workspace_working_dir(payload.working_dir) if payload.working_dir is not None else None
    updated = update_workspace(
        db,
        workspace,
        name=payload.name,
        goal=payload.goal,
        working_dir=working_dir,
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
    1. 物理删除平台自管的 workspace 本地目录
    2. 删除该 workspace 下各个 workspace session 的运行时残留
    3. 删除 workspace 自有数据（如 workspace_message、绑定关系、workspace session）
    4. 删除工作空间本身

    注意第 1 步删的不是 ``workspace.working_dir``，
    用户自己指定的共享工作目录不会在这里递归删除。
    """
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    session_manager = getattr(request.app.state, "runtime_session_manager", None)

    delete_workspace_filesystem_dir(workspace_id)
    await delete_workspace_runtime_sessions(db, workspace_id, session_manager)
    delete_workspace_related_rows(db, workspace_id)
    delete_workspace(db, workspace)


