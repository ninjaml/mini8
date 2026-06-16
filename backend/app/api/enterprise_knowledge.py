from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from fastapi import Depends
from sqlalchemy.orm import Session

from app.api import kb_configs
from app.core.database import get_db
from app.schemas.enterprise_knowledge import EnterpriseSearchRequest
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
import app.services.enterprise_knowledge as ek_service

router = APIRouter(tags=["enterprise_knowledge"])


def _require_kb_config(db: Session = Depends(get_db)):
    """若知识库未配置，直接拒绝访问。"""
    if not kb_configs.is_kb_connected(db):
        raise HTTPException(status_code=503, detail="知识库未配置，请先在系统中配置 R2R 连接地址")


def _resolve_collection_ids(collection_ids: list[int] | None) -> list[str] | None:
    if collection_ids is None:
        return None
    return [str(cid) for cid in collection_ids]


@router.get("/enterprise/status")
def enterprise_status(db: Session = Depends(get_db)):
    # 先检查数据库里有没有配置
    configured = kb_configs.is_kb_connected(db)
    if not configured:
        return {"enabled": False}
    # 再真正发 HTTP 探测 R2R 是否可达
    # 确保内存中的 URL 与数据库同步（启动后首次调用时可能还没 set）
    url = kb_configs.get_r2r_base_url(db)
    if url and url != ek_service._R2R_BASE_URL:
        ek_service.set_r2r_base_url(url)
    return {"enabled": ek_service.check_r2r_reachable()}


@router.post("/enterprise/search")
def enterprise_search(payload: EnterpriseSearchRequest, db: Session = Depends(get_db)):
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


@router.post("/enterprise/rag")
def enterprise_rag(payload: EnterpriseSearchRequest, db: Session = Depends(get_db)):
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


@router.get("/enterprise/collections")
def enterprise_collections(primary_key: str = Query(...), db: Session = Depends(get_db)):
    _require_kb_config(db)
    try:
        return list_enterprise_collections(primary_key)
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/enterprise/collections/{collection_id}/folders")
def enterprise_folders(collection_id: int, primary_key: str = Query(...), db: Session = Depends(get_db)):
    _require_kb_config(db)
    try:
        return list_enterprise_folders(primary_key, collection_id)
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/enterprise/collections/{collection_id}/documents")
def enterprise_documents(
    collection_id: int,
    primary_key: str = Query(...),
    folder_id: int | None = Query(None),
    root_only: bool = Query(False),
    keyword: str | None = Query(None),
    mime_type: str | None = Query(None),
    db: Session = Depends(get_db),
):
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


@router.get("/enterprise/documents/{document_id}/download")
def enterprise_document_download(document_id: int, primary_key: str = Query(...), db: Session = Depends(get_db)):
    _require_kb_config(db)
    try:
        content, content_type = download_enterprise_document(primary_key, document_id)
        return StreamingResponse(BytesIO(content), media_type=content_type)
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/enterprise/collections/{collection_id}/documents")
async def enterprise_document_upload(
    collection_id: int,
    primary_key: str = Form(...),
    folder_id: int | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _require_kb_config(db)
    try:
        content = await file.read()
        result = upload_enterprise_document(
            primary_key=primary_key,
            collection_id=collection_id,
            file_name=file.filename or "untitled",
            file_content=content,
            content_type=file.content_type or "application/octet-stream",
            folder_id=folder_id,
        )
        return result
    except EnterpriseKnowledgeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
