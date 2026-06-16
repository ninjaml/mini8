import os
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

from deepagents_webapi.api.models import (
    FileTreeRequest, FileTreeResponse,
    FileReadRequest, FileReadResponse,
    FileMkdirRequest, FileDeleteRequest,
)
from deepagents_webapi.config import settings

router = APIRouter()


def _build_tree(dir_path: Path, depth: int, current_depth: int = 0) -> list[dict]:
    """递归构建目录树"""
    if current_depth >= depth:
        return []
    items = []
    try:
        entries = sorted(dir_path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        for entry in entries:
            if entry.name.startswith('.'):
                continue
            item = {
                "name": entry.name,
                "path": str(entry),
                "is_dir": entry.is_dir(),
            }
            if entry.is_dir():
                item["children"] = _build_tree(entry, depth, current_depth + 1)
            else:
                try:
                    item["size"] = entry.stat().st_size
                except OSError:
                    item["size"] = 0
            items.append(item)
    except PermissionError:
        pass
    return items


@router.post("/api/files/tree", response_model=FileTreeResponse)
async def get_file_tree(request: FileTreeRequest):
    """获取指定根目录的文件树"""
    root = Path(request.root).resolve()
    if not root.exists() or not root.is_dir():
        raise HTTPException(status_code=404, detail="根目录不存在")
    tree = _build_tree(root, request.depth)
    return FileTreeResponse(root=str(root), tree=tree)


@router.post("/api/files/read", response_model=FileReadResponse)
async def read_file_content(request: FileReadRequest):
    """读取文件内容（文本文件）"""
    file_path = Path(request.path).resolve()
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="不是文件")
    # 限制文件大小 (2MB)
    size = file_path.stat().st_size
    if size > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件过大，不支持预览")
    try:
        raw = file_path.read_bytes()
        # 尝试多种编码：UTF-8 优先，回退到 GBK（Windows 中文）、Latin-1（兜底）
        content = None
        for enc in ("utf-8", "utf-8-sig", "gbk", "gb2312", "latin-1"):
            try:
                content = raw.decode(enc)
                break
            except (UnicodeDecodeError, LookupError):
                continue
        if content is None:
            raise HTTPException(status_code=400, detail="非文本文件，无法预览")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取失败: {str(e)}")
    return FileReadResponse(
        path=str(file_path),
        name=file_path.name,
        content=content,
        size=size,
        extension=file_path.suffix.lstrip(".")
    )


@router.post("/api/files/upload")
async def upload_file(dir: str = Form(...), file: UploadFile = File(...)):
    """上传文件到指定目录"""
    target_dir = Path(dir).resolve()
    if not target_dir.exists():
        target_dir.mkdir(parents=True, exist_ok=True)
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="目标路径不是目录")
    dest = target_dir / file.filename
    try:
        content = await file.read()
        dest.write_bytes(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")
    return {"success": True, "path": str(dest), "size": len(content)}


@router.post("/api/files/mkdir")
async def create_directory(request: FileMkdirRequest):
    """创建目录"""
    dir_path = Path(request.path).resolve()
    if dir_path.exists():
        raise HTTPException(status_code=400, detail="目录已存在")
    try:
        dir_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")
    return {"success": True, "path": str(dir_path)}


@router.post("/api/files/delete")
async def delete_file_or_dir(request: FileDeleteRequest):
    """删除文件或目录"""
    target = Path(request.path).resolve()
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"路径不存在: {target}")
    try:
        if target.is_dir():
            shutil.rmtree(str(target))
        else:
            os.remove(str(target))
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"权限不足，无法删除: {target.name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")
    return {"success": True, "path": str(target)}


@router.get("/api/skills/dir")
async def get_skills_dir(agent_name: str):
    """获取指定 agent 的 skills 目录路径"""
    if not agent_name:
        raise HTTPException(status_code=400, detail="agent_name is required")
    skills_dir = settings.ensure_user_skills_dir(agent_name)
    return {"path": str(skills_dir)}


@router.get("/api/files/download")
async def download_file(path: str):
    """下载文件"""
    file_path = Path(path).resolve()
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="application/octet-stream"
    )
