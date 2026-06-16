from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re
import shutil
import zipfile

from fastapi import UploadFile

from app.core.config import settings


"""
工作事项成果（History）文件存储服务。

负责历史成果目录的创建、上传文件保存、压缩下载、文本预览、
空目录清理以及工作空间级物理删除。所有路径操作都围绕
settings.DATA_DIR / workspaces /<workspace_id>/items/<item_id>/histories/<history_id> 进行。
"""


# 支持文本预览的文件后缀白名单，按字母序便于二分查找（虽然这里直接遍历）。
TEXT_PREVIEW_SUFFIXES = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".yaml",
    ".yml",
    ".csv",
    ".html",
    ".css",
}


def ensure_history_dir(workspace_id: int, item_id: int, history_id: int) -> Path:
    """
    确保唯一的历史成果目录存在，不存在则自动创建。

    参数:
        workspace_id: 所属工作空间 ID。
        item_id: 所属工作事项 ID。
        history_id: 历史记录 ID。

    返回:
        创建（或已存在）的历史目录 Path 对象。
    """
    # 每次成果提交都落到唯一历史目录，后续下载、预览、删除都围绕这里进行。
    history_dir = (
        settings.DATA_DIR
        / "workspaces"
        / str(workspace_id)
        / "items"
        / str(item_id)
        / "histories"
        / str(history_id)
    )
    history_dir.mkdir(parents=True, exist_ok=True)
    return history_dir


def to_storage_path(path: Path) -> str:
    """把 Path 转为正斜杠格式的存储字符串，便于跨平台兼容。"""
    return path.as_posix()


def from_storage_path(path_str: str | None) -> Path | None:
    """把存储字符串还原为 Path；空值返回 None。"""
    if not path_str:
        return None
    return Path(path_str)


def resolve_history_file(history_dir_path: str | None, file_name: str) -> Path:
    """
    在历史目录中定位并校验单个文件。

    参数:
        history_dir_path: 历史目录的存储路径字符串。
        file_name: 目标文件名（不含目录穿越）。

    返回:
        校验通过的 Path 对象。

    异常:
        FileNotFoundError: 目录不存在、文件名非法、路径穿越、或文件不存在。
    """
    history_dir = from_storage_path(history_dir_path)
    if history_dir is None or not history_dir.exists():
        raise FileNotFoundError("History directory not found")

    # 防止路径穿越攻击：检查文件名中是否包含路径分隔符
    if "/" in file_name or "\\" in file_name or ".." in file_name:
        raise FileNotFoundError("Invalid file name")

    file_path = history_dir / file_name
    # 确保解析后的路径仍在 history_dir 内
    try:
        resolved_file_path = file_path.resolve()
        resolved_history_dir = history_dir.resolve()
        resolved_file_path.relative_to(resolved_history_dir)
    except (ValueError, OSError):
        raise FileNotFoundError("Invalid file path")

    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError("History file not found")
    return file_path


def sanitize_filename(name: str) -> str:
    """
    把上传文件名收敛到安全字符集，避免路径穿透和奇怪字符导致的兼容性问题。

    保留：字母、数字、下划线、点、连字符、括号以及常见中文字符。
    """
    cleaned = re.sub(r"[^\w\-.()\u4e00-\u9fff]+", "_", name).strip("._")
    return cleaned or "file"


async def save_uploads(history_dir: Path, files: list[UploadFile]) -> list[dict]:
    """
    把前端上传的文件保存到指定历史目录，自动处理重名。

    参数:
        history_dir: 目标目录。
        files: FastAPI UploadFile 列表。

    返回:
        已保存文件列表，每项包含 name 和 size。
    """
    saved_files: list[dict] = []
    used_names: set[str] = set()

    for upload in files:
        original_name = upload.filename or "file"
        safe_name = sanitize_filename(original_name)
        base = Path(safe_name).stem
        suffix = Path(safe_name).suffix
        candidate = safe_name
        counter = 1
        # 若同名文件已在本次上传或目录中已存在，则追加递增编号。
        while candidate in used_names or (history_dir / candidate).exists():
            candidate = f"{base}_{counter}{suffix}"
            counter += 1

        content = await upload.read()
        file_path = history_dir / candidate
        file_path.write_bytes(content)
        used_names.add(candidate)
        saved_files.append({"name": candidate, "size": len(content)})

    return saved_files


def list_history_files(history_dir_path: str | None) -> list[dict]:
    """列出历史目录下的所有文件（按文件名字母序排序），返回 name 与 size。"""
    history_dir = from_storage_path(history_dir_path)
    if history_dir is None or not history_dir.exists():
        return []

    files: list[dict] = []
    for entry in sorted(history_dir.iterdir(), key=lambda item: item.name.lower()):
        if entry.is_file():
            files.append({"name": entry.name, "size": entry.stat().st_size})
    return files


def read_preview_text(history_dir_path: str | None, limit: int = 2000) -> str | None:
    """
    在历史目录中查找第一个可预览的文本文件并返回前 limit 个字符。

    参数:
        history_dir_path: 历史目录路径。
        limit: 最大读取字符数，默认 2000。

    返回:
        预览文本；无可预览文件时返回 None。
    """
    history_dir = from_storage_path(history_dir_path)
    if history_dir is None or not history_dir.exists():
        return None

    for entry in sorted(history_dir.iterdir(), key=lambda item: item.name.lower()):
        if not entry.is_file() or entry.suffix.lower() not in TEXT_PREVIEW_SUFFIXES:
            continue
        try:
            content = entry.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        return content[:limit]
    return None


def build_history_zip(history_dir_path: str | None) -> BytesIO:
    """
    把历史目录下的所有文件打包为 ZIP，返回内存中的 BytesIO。

    异常:
        FileNotFoundError: 目录不存在。
    """
    history_dir = from_storage_path(history_dir_path)
    if history_dir is None or not history_dir.exists():
        raise FileNotFoundError("History directory not found")

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for entry in sorted(history_dir.iterdir(), key=lambda item: item.name.lower()):
            if entry.is_file():
                archive.write(entry, arcname=entry.name)
    buffer.seek(0)
    return buffer


def delete_history_dir(history_dir_path: str | None) -> None:
    """物理删除历史成果目录（若存在）；忽略错误，避免残留。"""
    history_dir = from_storage_path(history_dir_path)
    if history_dir is None or not history_dir.exists():
        return
    shutil.rmtree(history_dir, ignore_errors=True)


def prune_empty_item_dirs(workspace_id: int, item_id: int) -> None:
    """
    删除成果后向上清理空目录，只在当前事项目录树内收口，不越过 items 根目录。
    """
    items_root = settings.DATA_DIR / "workspaces" / str(workspace_id) / "items"
    item_dir = items_root / str(item_id)
    if not item_dir.exists():
        return

    current = item_dir / "histories"
    if not current.exists():
        current = item_dir

    while current.exists() and current != items_root:
        try:
            next(current.iterdir())
            break
        except StopIteration:
            current.rmdir()
            current = current.parent


def delete_history_dir_and_prune(history_dir_path: str | None, workspace_id: int, item_id: int) -> None:
    """
    删除成果的标准入口：先删实际文件，再清理可能留下的空父目录。
    """
    delete_history_dir(history_dir_path)
    prune_empty_item_dirs(workspace_id, item_id)


def delete_workspace_dir(workspace_id: int) -> None:
    """物理删除整个工作空间的本地存储目录（含所有事项与成果）。"""
    workspace_dir = settings.DATA_DIR / "workspaces" / str(workspace_id)
    if not workspace_dir.exists():
        return
    shutil.rmtree(workspace_dir, ignore_errors=True)
