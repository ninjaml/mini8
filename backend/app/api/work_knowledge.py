import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import WorkKnowledge
from app.repositories.work_knowledge import (
    create_workspace_knowledge,
    delete_workspace_knowledge,
    get_workspace_knowledge,
    get_workspace_knowledge_by_port,
    list_workspace_knowledge,
    update_workspace_knowledge,
)
from app.repositories.workspace import get_workspace
from app.schemas.work_knowledge import (
    KnowledgeFileRead,
    KnowledgeTreeRead,
    WorkKnowledgeCreate,
    WorkKnowledgeRead,
    WorkKnowledgeUpdate,
)
from app.services.obsidian_local_rest import (
    list_obsidian_directory,
    probe_obsidian_knowledge,
    request_obsidian_text,
)


"""
知识库（Work Knowledge）接口模块。

管理 Obsidian 知识库的挂载、浏览、读取，以及 vault 目录树的展示。
"""

router = APIRouter(prefix="/workspaces/{workspace_id}/knowledge", tags=["work_knowledge"])
knowledge_router = APIRouter(prefix="/knowledge", tags=["work_knowledge"])


@router.get("", response_model=list[WorkKnowledgeRead])
def read_workspace_knowledge(workspace_id: int, db: Session = Depends(get_db)):
    """获取指定工作空间下的所有知识库列表。"""
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return list_workspace_knowledge(db, workspace_id)


@router.post("", response_model=WorkKnowledgeRead)
def create_workspace_knowledge_endpoint(workspace_id: int, payload: WorkKnowledgeCreate, db: Session = Depends(get_db)):
    """
    在工作空间下创建新的 Obsidian 知识库挂载。

    约束：
    - 知识库名称非空且在空间内唯一。
    - 同一空间不允许重复挂载同一端口。
    - 创建前会先探测端口是否可达。
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    target_name = payload.name.strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="知识库名称不能为空。")
    for entry in list_workspace_knowledge(db, workspace_id):
        if (entry.name or "").strip() == target_name:
            raise HTTPException(status_code=400, detail="当前工作空间已存在同名知识库。")
    if get_workspace_knowledge_by_port(db, workspace_id, payload.port):
        raise HTTPException(status_code=400, detail="当前工作空间已挂载这个端口对应的知识库。")
    probe_obsidian_knowledge(payload.port, payload.api_key)
    knowledge = WorkKnowledge(
        work_space_id=workspace_id,
        name=target_name,
        type="obsidian",
        knowledge_json=json.dumps(
            {
                "port": payload.port,
                "api_key": payload.api_key,
                "vault_name": target_name,
                "omnisearch_port": payload.omnisearch_port,
            },
            ensure_ascii=False,
        ),
    )
    return create_workspace_knowledge(db, knowledge)


@knowledge_router.patch("/{knowledge_id}", response_model=WorkKnowledgeRead)
def update_knowledge_endpoint(knowledge_id: int, payload: WorkKnowledgeUpdate, db: Session = Depends(get_db)):
    """更新知识库名称，需保持同空间唯一性。"""
    knowledge = get_workspace_knowledge(db, knowledge_id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    target_name = payload.name.strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="知识库名称不能为空。")
    workspace_entries = list_workspace_knowledge(db, knowledge.work_space_id or 0)
    for entry in workspace_entries:
        if entry.id != knowledge.id and (entry.name or "").strip() == target_name:
            raise HTTPException(status_code=400, detail="当前工作空间已存在同名知识库。")
    return update_workspace_knowledge(db, knowledge, name=target_name)


@router.delete("/{knowledge_id}", status_code=204)
def delete_workspace_knowledge_endpoint(workspace_id: int, knowledge_id: int, db: Session = Depends(get_db)):
    """删除指定工作空间下的知识库挂载。"""
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    knowledge = get_workspace_knowledge(db, knowledge_id)
    if not knowledge or knowledge.work_space_id != workspace_id:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    delete_workspace_knowledge(db, knowledge)


@knowledge_router.get("/{knowledge_id}/tree", response_model=KnowledgeTreeRead)
def read_knowledge_tree(
    knowledge_id: int,
    path: str = Query("", description="目录路径"),
    db: Session = Depends(get_db),
):
    """
    获取 Obsidian vault 中指定目录的树形列表。

    参数:
        path: vault 内的目录路径，空串表示根目录。
    """
    knowledge = get_workspace_knowledge(db, knowledge_id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    entries = list_obsidian_directory(knowledge, path)
    return KnowledgeTreeRead(
        knowledge_id=knowledge.id,
        title=knowledge.name or "知识库",
        current_path=path.strip("/"),
        entries=entries,
    )


@knowledge_router.get("/{knowledge_id}/file", response_model=KnowledgeFileRead)
def read_knowledge_file(
    knowledge_id: int,
    path: str = Query(..., description="文件路径"),
    db: Session = Depends(get_db),
):
    """
    读取 Obsidian vault 中指定文件的文本内容。

    参数:
        path: vault 内文件路径（必填）。
    """
    knowledge = get_workspace_knowledge(db, knowledge_id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    normalized_path = path.strip("/")
    if not normalized_path:
        raise HTTPException(status_code=400, detail="请选择要读取的文件。")
    content = request_obsidian_text(knowledge, normalized_path)
    return KnowledgeFileRead(
        knowledge_id=knowledge.id,
        title=knowledge.name or "知识库",
        path=normalized_path,
        name=normalized_path.split("/")[-1],
        content=content,
    )
