"""Agent 团队模板导入/导出接口。"""

from __future__ import annotations

from io import BytesIO
import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.agent_package import AgentPackageImportRead
from app.services.agent_package_export_service import export_agent_package
from app.services.agent_package_import_service import MAX_PACKAGE_BYTES, import_agent_package


router = APIRouter(prefix="/agent-packages", tags=["agent_packages"])
logger = logging.getLogger(__name__)
UPLOAD_READ_CHUNK_BYTES = 1024 * 1024


def _stream_zip(content: bytes, *, filename: str) -> StreamingResponse:
    encoded_filename = quote(filename)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Content-Length": str(len(content)),
        },
    )


async def _read_upload_bytes_with_limit(file: UploadFile, *, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total_bytes = 0
    while True:
        chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break
        total_bytes += len(chunk)
        if total_bytes > max_bytes:
            raise HTTPException(status_code=400, detail="模板包体积超出限制")
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/{agent_id:int}/export")
def export_agent_package_endpoint(agent_id: int, db: Session = Depends(get_db)):
    """导出单个 root Agent 团队模板。"""
    try:
        exported = export_agent_package(db, root_agent_id=agent_id)
    except RuntimeError as exc:
        message = str(exc)
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message) from exc
    return _stream_zip(exported.content, filename=exported.filename)


@router.post("/import", response_model=AgentPackageImportRead)
async def import_agent_package_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """导入单个 Agent 团队模板 ZIP。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="请选择要导入的 ZIP 文件")
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="团队模板必须是 ZIP 文件")

    package_bytes = await _read_upload_bytes_with_limit(file, max_bytes=MAX_PACKAGE_BYTES)
    if not package_bytes:
        raise HTTPException(status_code=400, detail="上传的 ZIP 文件为空")

    try:
        return import_agent_package(db, package_bytes=package_bytes)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("导入团队模板时发生未预期异常")
        raise HTTPException(status_code=500, detail="导入团队模板失败，请稍后重试") from exc
