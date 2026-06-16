from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Workspace, WorkspaceAgent
from app.repositories.system_setting import get_system_setting, set_system_setting

router = APIRouter(prefix="/agents", tags=["agent_settings"])


class WorkingDirPayload(BaseModel):
    kind: str
    ref_id: int | None = None
    dir: str | None = None


def _validate_working_dir(path: str | None) -> None:
    """校验用户输入的工作目录路径是否合法。"""
    if path is None or path.strip() == "":
        return
    p = Path(path)
    # 1. 必须是绝对路径
    if not p.is_absolute():
        raise HTTPException(status_code=400, detail="工作目录必须是绝对路径")
    # 2. 不能包含 .. 跳转
    if ".." in p.parts:
        raise HTTPException(status_code=400, detail="工作目录路径不能包含 '..'")
    # 3. 尝试 mkdir，失败则返回 400（说明无权限或父目录不存在）
    try:
        p.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法创建目录: {e}")


@router.patch("/working-dir")
def update_working_dir(payload: WorkingDirPayload, db: Session = Depends(get_db)):
    _validate_working_dir(payload.dir)

    if payload.kind == "moss":
        set_system_setting(db, "moss_working_dir", payload.dir)
        return {"kind": "moss", "ref_id": None, "dir": payload.dir}

    elif payload.kind == "superagent":
        if payload.ref_id is None:
            raise HTTPException(status_code=400, detail="ref_id (workspace_id) is required for superagent")
        ws = db.get(Workspace, payload.ref_id)
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")
        ws.super_agent_working_dir = payload.dir
        db.commit()
        return {"kind": "superagent", "ref_id": payload.ref_id, "dir": payload.dir}

    elif payload.kind == "workagent":
        if payload.ref_id is None:
            raise HTTPException(status_code=400, detail="ref_id (agent_id) is required for workagent")
        agent = db.get(WorkspaceAgent, payload.ref_id)
        if not agent:
            raise HTTPException(status_code=404, detail="WorkAgent not found")
        agent.working_dir = payload.dir
        db.commit()
        return {"kind": "workagent", "ref_id": payload.ref_id, "dir": payload.dir}

    else:
        raise HTTPException(status_code=400, detail="Unsupported agent kind")


@router.get("/working-dir")
def get_working_dir(kind: str, ref_id: int | None = None, db: Session = Depends(get_db)):
    if kind == "moss":
        item = get_system_setting(db, "moss_working_dir")
        return {"kind": "moss", "ref_id": None, "dir": item.value if item else None}

    elif kind == "superagent":
        if ref_id is None:
            raise HTTPException(status_code=400, detail="ref_id required")
        ws = db.get(Workspace, ref_id)
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found")
        return {"kind": "superagent", "ref_id": ref_id, "dir": ws.super_agent_working_dir}

    elif kind == "workagent":
        if ref_id is None:
            raise HTTPException(status_code=400, detail="ref_id required")
        agent = db.get(WorkspaceAgent, ref_id)
        if not agent:
            raise HTTPException(status_code=404, detail="WorkAgent not found")
        return {"kind": "workagent", "ref_id": ref_id, "dir": agent.working_dir}

    else:
        raise HTTPException(status_code=400, detail="Unsupported agent kind")
