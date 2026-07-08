import json
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import WorkKnowledge
from app.models.kb_config import KBConfig
from app.repositories.work_knowledge import (
    create_workspace_knowledge,
    delete_workspace_knowledge,
    get_workspace_knowledge,
    get_workspace_knowledge_by_port,
    list_workspace_knowledge,
    update_workspace_knowledge,
)
from app.repositories.workspace import get_workspace
from app.schemas.enterprise_knowledge import EnterpriseSearchRequest
from app.schemas.kb_config import KBConfigCreate, KBConfigRead, KBConfigUpdate
from app.schemas.work_knowledge import (
    KnowledgeFileRead,
    KnowledgeTreeRead,
    WorkKnowledgeCreate,
    WorkKnowledgeRead,
    WorkKnowledgeUpdate,
)
from app.services.enterprise_knowledge import (
    EnterpriseKnowledgeError,
    download_enterprise_document,
    list_enterprise_collections,
    list_enterprise_documents,
    list_enterprise_folders,
    rag_enterprise,
    search_enterprise,
    upload_enterprise_document,
)
from app.services.obsidian_local_rest import (
    list_obsidian_directory,
    probe_obsidian_knowledge,
    request_obsidian_text,
)
import app.services.enterprise_knowledge as ek_service


work_knowledge_router = APIRouter(prefix="/workspaces/{workspace_id}/knowledge", tags=["work_knowledge"])
knowledge_router = APIRouter(prefix="/knowledge", tags=["work_knowledge"])
kb_configs_router = APIRouter(prefix="/kb-configs", tags=["知识库配置"])
enterprise_knowledge_router = APIRouter(tags=["enterprise_knowledge"])


@work_knowledge_router.get("", response_model=list[WorkKnowledgeRead])
def read_workspace_knowledge(workspace_id: int, db: Session = Depends(get_db)):
    """列出某个 workspace 已挂载的知识入口。"""
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return list_workspace_knowledge(db, workspace_id)


@work_knowledge_router.post("", response_model=WorkKnowledgeRead)
def create_workspace_knowledge_endpoint(workspace_id: int, payload: WorkKnowledgeCreate, db: Session = Depends(get_db)):
    """创建一条 workspace 知识挂载记录。

    当前只覆盖 Obsidian Local REST 挂载链路：
    - 先按端口/API key 探测目标服务可达
    - 再把端口、密钥、vault_name 等配置塞进 ``knowledge_json``
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    target_name = payload.name.strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="知识库名称不能为空。")
    for entry in list_workspace_knowledge(db, workspace_id):
        if entry.name.strip() == target_name:
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
    """更新单条知识挂载。

    当前真实行为不只是改 ``WorkKnowledge.name``，
    还会同步把 ``knowledge_json["vault_name"]`` 改成同一个名字。
    """
    knowledge = get_workspace_knowledge(db, knowledge_id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    target_name = payload.name.strip()
    if not target_name:
        raise HTTPException(status_code=400, detail="知识库名称不能为空。")
    workspace_entries = list_workspace_knowledge(db, knowledge.work_space_id)
    for entry in workspace_entries:
        if entry.id != knowledge.id and entry.name.strip() == target_name:
            raise HTTPException(status_code=400, detail="当前工作空间已存在同名知识库。")
    try:
        config = json.loads(knowledge.knowledge_json)
        if not isinstance(config, dict):
            raise ValueError
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail="知识库配置损坏，无法同步名称。") from exc

    config["vault_name"] = target_name
    return update_workspace_knowledge(
        db,
        knowledge,
        name=target_name,
        knowledge_json=json.dumps(config, ensure_ascii=False),
    )


@work_knowledge_router.delete("/{knowledge_id}", status_code=204)
def delete_workspace_knowledge_endpoint(workspace_id: int, knowledge_id: int, db: Session = Depends(get_db)):
    """从某个 workspace 中卸载一条知识挂载记录。"""
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    knowledge = get_workspace_knowledge(db, knowledge_id)
    if not knowledge or knowledge.work_space_id != workspace_id:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    delete_workspace_knowledge(db, knowledge)


@knowledge_router.get("/{knowledge_id}/tree", response_model=KnowledgeTreeRead)
def read_knowledge_tree(knowledge_id: int, path: str = Query("", description="目录路径"), db: Session = Depends(get_db)):
    """浏览知识挂载对应的目录树。"""
    knowledge = get_workspace_knowledge(db, knowledge_id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    entries = list_obsidian_directory(knowledge, path)
    return KnowledgeTreeRead(
        knowledge_id=knowledge.id,
        title=knowledge.name,
        current_path=path.strip("/"),
        entries=entries,
    )


@knowledge_router.get("/{knowledge_id}/file", response_model=KnowledgeFileRead)
def read_knowledge_file(knowledge_id: int, path: str = Query(..., description="文件路径"), db: Session = Depends(get_db)):
    """读取知识挂载中的单个文本文件内容。"""
    knowledge = get_workspace_knowledge(db, knowledge_id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    normalized_path = path.strip("/")
    if not normalized_path:
        raise HTTPException(status_code=400, detail="请选择要读取的文件。")
    content = request_obsidian_text(knowledge, normalized_path)
    return KnowledgeFileRead(
        knowledge_id=knowledge.id,
        title=knowledge.name,
        path=normalized_path,
        name=normalized_path.split("/")[-1],
        content=content,
    )


@kb_configs_router.get("", response_model=list[KBConfigRead])
def list_kb_configs(db: Session = Depends(get_db)):
    """列出知识引擎相关的全局配置记录。"""
    return db.query(KBConfig).all()


@kb_configs_router.get("/{config_key}", response_model=KBConfigRead)
def get_kb_config(config_key: str, db: Session = Depends(get_db)):
    """按 key 读取单条知识引擎配置。"""
    cfg = db.query(KBConfig).filter(KBConfig.key == config_key).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    return cfg


@kb_configs_router.post("", response_model=KBConfigRead)
def create_kb_config(payload: KBConfigCreate, db: Session = Depends(get_db)):
    """创建或覆盖知识引擎配置。

    若改的是 ``r2r_base_url``，会顺手把 enterprise service 的模块级 base url 一并更新。
    """
    existing = db.query(KBConfig).filter(KBConfig.key == payload.key).first()
    if existing:
        existing.value = payload.value
        existing.description = payload.description
        db.commit()
        db.refresh(existing)
        if payload.key == "r2r_base_url":
            ek_service.set_r2r_base_url(payload.value)
        return existing

    cfg = KBConfig(key=payload.key, value=payload.value, description=payload.description)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    if payload.key == "r2r_base_url":
        ek_service.set_r2r_base_url(payload.value)
    return cfg


@kb_configs_router.put("/{config_id}", response_model=KBConfigRead)
def update_kb_config(config_id: int, payload: KBConfigUpdate, db: Session = Depends(get_db)):
    """按主键更新知识引擎配置，并在需要时同步 enterprise service 缓存。"""
    cfg = db.query(KBConfig).filter(KBConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    cfg.value = payload.value
    if payload.description is not None:
        cfg.description = payload.description
    db.commit()
    db.refresh(cfg)
    if cfg.key == "r2r_base_url":
        ek_service.set_r2r_base_url(payload.value)
    return cfg


@kb_configs_router.delete("/{config_id}")
def delete_kb_config(config_id: int, db: Session = Depends(get_db)):
    """删除单条知识引擎配置记录。"""
    cfg = db.query(KBConfig).filter(KBConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(cfg)
    db.commit()
    return {"message": "已删除"}


def get_r2r_base_url(db: Session) -> str | None:
    cfg = db.query(KBConfig).filter(KBConfig.key == "r2r_base_url").first()
    if cfg and cfg.value:
        return cfg.value.strip()
    return None


def get_r2r_login_url(db: Session) -> str | None:
    cfg = db.query(KBConfig).filter(KBConfig.key == "r2r_login_url").first()
    if cfg and cfg.value:
        return cfg.value.strip()
    return None


def ensure_default_kb_config(db: Session):
    """确保 R2R 相关默认配置记录存在。

    这里只会补缺失项，不会覆盖已有数据库值。
    """
    from app.core.config import settings

    defaults = [
        ("r2r_base_url", settings.R2R_BASE_URL, "R2R 团队知识图谱引擎连接地址"),
        ("r2r_login_url", settings.R2R_LOGIN_URL, "R2R 团队知识图谱登录地址"),
    ]

    created = False
    for key, value, description in defaults:
        existing = db.query(KBConfig).filter(KBConfig.key == key).first()
        if existing:
            continue
        db.add(KBConfig(key=key, value=value, description=description))
        created = True

    if created:
        db.commit()


def is_kb_connected(db: Session) -> bool:
    cfg = db.query(KBConfig).filter(KBConfig.key == "r2r_base_url").first()
    return bool(cfg and cfg.value and cfg.value.strip())


def _require_kb_config(db: Session = Depends(get_db)):
    if not is_kb_connected(db):
        raise HTTPException(status_code=503, detail="知识库未配置，请先在系统中配置 R2R 连接地址")


def _resolve_collection_ids(collection_ids: list[int] | None) -> list[str] | None:
    if collection_ids is None:
        return None
    return [str(cid) for cid in collection_ids]


@enterprise_knowledge_router.get("/enterprise/status")
def enterprise_status(db: Session = Depends(get_db)):
    """返回企业知识引擎是否已配置且当前可连通。"""
    configured = is_kb_connected(db)
    if not configured:
        return {"enabled": False}
    url = get_r2r_base_url(db)
    if url and url != ek_service._R2R_BASE_URL:
        ek_service.set_r2r_base_url(url)
    return {"enabled": ek_service.check_r2r_reachable()}


@enterprise_knowledge_router.post("/enterprise/search")
def enterprise_search(payload: EnterpriseSearchRequest, db: Session = Depends(get_db)):
    """执行企业知识搜索。"""
    _require_kb_config(db)
    try:
        return search_enterprise(
            query=payload.query,
            primary_key=payload.primary_key,
            collection_ids=_resolve_collection_ids(payload.collection_ids),
            limit=payload.limit,
            use_hybrid_search=payload.use_hybrid_search,
            use_graph_search=payload.use_graph_search,
            graph_limits=payload.graph_limits,
        )
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@enterprise_knowledge_router.post("/enterprise/rag")
def enterprise_rag(payload: EnterpriseSearchRequest, db: Session = Depends(get_db)):
    """执行企业知识 RAG 问答。"""
    _require_kb_config(db)
    try:
        return rag_enterprise(
            query=payload.query,
            primary_key=payload.primary_key,
            collection_ids=_resolve_collection_ids(payload.collection_ids),
            limit=payload.limit,
            use_hybrid_search=payload.use_hybrid_search,
            use_graph_search=payload.use_graph_search,
            graph_limits=payload.graph_limits,
        )
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@enterprise_knowledge_router.get("/enterprise/collections")
def enterprise_collections(primary_key: str = Query(...), db: Session = Depends(get_db)):
    """列出当前用户可见的企业知识集合。"""
    _require_kb_config(db)
    try:
        return list_enterprise_collections(primary_key)
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@enterprise_knowledge_router.get("/enterprise/collections/{collection_id}/folders")
def enterprise_folders(collection_id: int, primary_key: str = Query(...), db: Session = Depends(get_db)):
    """列出集合下的文件夹树节点。"""
    _require_kb_config(db)
    try:
        return list_enterprise_folders(primary_key, collection_id)
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@enterprise_knowledge_router.get("/enterprise/collections/{collection_id}/documents")
def enterprise_documents(
    collection_id: int,
    primary_key: str = Query(...),
    folder_id: int | None = Query(None),
    root_only: bool = Query(False),
    keyword: str | None = Query(None),
    mime_type: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """列出集合中的文档，可按文件夹、关键字和 mime type 过滤。"""
    _require_kb_config(db)
    try:
        return list_enterprise_documents(
            primary_key=primary_key,
            collection_id=collection_id,
            folder_id=folder_id,
            root_only=root_only,
            keyword=keyword,
            mime_type=mime_type,
        )
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@enterprise_knowledge_router.get("/enterprise/documents/{document_id}/download")
def enterprise_document_download(document_id: int, primary_key: str = Query(...), db: Session = Depends(get_db)):
    """下载企业知识中的单个文档原始内容。"""
    _require_kb_config(db)
    try:
        content, content_type = download_enterprise_document(primary_key, document_id)
        return StreamingResponse(BytesIO(content), media_type=content_type)
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@enterprise_knowledge_router.post("/enterprise/collections/{collection_id}/documents")
async def enterprise_document_upload(
    collection_id: int,
    primary_key: str = Form(...),
    folder_id: int | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """向企业知识集合上传一个文档。"""
    _require_kb_config(db)
    try:
        content = await file.read()
        return upload_enterprise_document(
            primary_key=primary_key,
            collection_id=collection_id,
            file_name=file.filename or "untitled",
            file_content=content,
            content_type=file.content_type or "application/octet-stream",
            folder_id=folder_id,
        )
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
