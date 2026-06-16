import os
import platform as plat
import string
from pathlib import Path

from fastapi import APIRouter, HTTPException

from deepagents_webapi.api.models import (
    FilesystemRoot, FilesystemRootsResponse,
    ListDirectoryRequest, DirectoryItem, ListDirectoryResponse,
    ValidatePathRequest, ValidatePathResponse,
)

router = APIRouter()


@router.get("/api/filesystem/roots", response_model=FilesystemRootsResponse)
async def get_filesystem_roots():
    """获取文件系统根目录列表（Windows: 盘符, Linux/Mac: /）"""
    system = plat.system().lower()
    
    if system == "windows":
        # Windows: 获取所有可用盘符（排除 C 盘）
        drives = []
        for letter in string.ascii_uppercase:
            if letter == 'C':  # 排除 C 盘
                continue
            drive = f"{letter}:\\"
            if Path(drive).exists():
                drives.append(FilesystemRoot(
                    name=f"{letter}:",
                    path=drive
                ))
        return FilesystemRootsResponse(platform="windows", roots=drives)
    else:
        # Linux/Mac: 根目录是 /
        return FilesystemRootsResponse(
            platform="linux" if system == "linux" else "darwin",
            roots=[FilesystemRoot(name="/", path="/")]
        )


@router.post("/api/filesystem/list", response_model=ListDirectoryResponse)
async def list_directory_endpoint(request: ListDirectoryRequest):
    """列出指定目录的子目录"""
    try:
        # 标准化路径
        if not request.path:
            raise HTTPException(status_code=400, detail="Path is required")
        
        current_path = Path(request.path).resolve()
        
        # 检查路径是否存在
        if not current_path.exists():
            raise HTTPException(status_code=404, detail="Path not found")
        
        if not current_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a directory")
        
        # 获取父目录
        parent_path = None
        if current_path.parent != current_path:  # 不是根目录
            parent_path = str(current_path.parent)
        
        # 列出子目录（只要目录，不要文件）
        directories = []
        try:
            for item in current_path.iterdir():
                if item.is_dir():
                    # 检查是否可访问
                    accessible = os.access(str(item), os.R_OK)
                    directories.append(DirectoryItem(
                        name=item.name,
                        path=str(item),
                        accessible=accessible
                    ))
        except PermissionError:
            pass  # 当前目录无权限，返回空列表
        
        # 排序（不可访问的放后面，然后按名称排序）
        directories.sort(key=lambda x: (not x.accessible, x.name.lower()))
        
        return ListDirectoryResponse(
            current_path=str(current_path),
            parent_path=parent_path,
            normalized_path=str(current_path),
            directories=directories
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/filesystem/validate", response_model=ValidatePathResponse)
async def validate_path_endpoint(request: ValidatePathRequest):
    """验证路径是否有效"""
    try:
        if not request.path:
            return ValidatePathResponse(
                valid=False,
                exists=False,
                is_directory=False,
                accessible=False,
                normalized_path=None
            )
        
        path = Path(request.path).resolve()
        exists = path.exists()
        is_directory = path.is_dir() if exists else False
        accessible = os.access(str(path), os.R_OK) if exists else False
        
        return ValidatePathResponse(
            valid=exists and is_directory,
            exists=exists,
            is_directory=is_directory,
            accessible=accessible,
            normalized_path=str(path) if exists else None
        )
    
    except Exception as e:
        return ValidatePathResponse(
            valid=False,
            exists=False,
            is_directory=False,
            accessible=False,
            normalized_path=None
        )
