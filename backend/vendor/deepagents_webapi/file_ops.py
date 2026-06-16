"""Helpers for tracking file operations and computing diffs for CLI display."""

from __future__ import annotations

import difflib
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from deepagents_webapi.config import settings

if TYPE_CHECKING:
    from deepagents.backends.protocol import BACKEND_TYPES

FileOpStatus = Literal["pending", "success", "error"]

# Common encodings to try (in order of likelihood)
encodings = [
    'utf-8',          # Most common
    'gbk',            # Chinese Windows
    'gb2312',         # Chinese simplified
    'big5',           # Traditional Chinese
    'shift_jis',      # Japanese
    'euc-kr',         # Korean
    'iso-8859-1',     # Latin-1
    'cp1252',         # Windows Latin-1
    'utf-16',         # UTF-16 with BOM
    'utf-16le',       # UTF-16 Little Endian
    'utf-16be',       # UTF-16 Big Endian
    'ascii',          # ASCII
]

def _safe_read(path: Path, secure: bool = False) -> str | None:
    """Read file content, returning None on failure."""
    if not path.exists():
        return None
    
    if secure:
        # Secure reading with O_NOFOLLOW
        import os
        for encoding in encodings:
            try:
                fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
                with os.fdopen(fd, "r", encoding=encoding) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue
            except (OSError, PermissionError, FileNotFoundError):
                return None
        
        # Last resort with errors='replace'
        try:
            fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            with os.fdopen(fd, "r", encoding='utf-8', errors='replace') as f:
                return f.read()
        except (OSError, PermissionError, FileNotFoundError):
            return None
    else:
        # Normal reading without O_NOFOLLOW
        for encoding in encodings:
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
            except (OSError, PermissionError, FileNotFoundError):
                return None
        
        # Last resort with errors='replace'
        try:
            return path.read_text(encoding='utf-8', errors='replace')
        except (OSError, PermissionError, FileNotFoundError):
            return None

def _decode_content(content_bytes: bytes) -> str: 
    # 编码尝试
    for encoding in encodings:
        try:
            return content_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    
    # 最后尝试使用 errors='replace'
    try:
        return content_bytes.decode('utf-8', errors='replace')
    except:
        return content_bytes.decode('utf-8', errors='ignore')

def _count_lines(text: str) -> int:
    """Count lines in text, treating empty strings as zero lines."""
    if not text:
        return 0
    return len(text.splitlines())

def compute_unified_diff(
    before: str,
    after: str,
    display_path: str,
    *,
    max_lines: int | None = 800,
    context_lines: int = 3,
) -> str | None:
    """Compute a unified diff between before and after content.

    Args:
        before: Original content
        after: New content
        display_path: Path for display in diff headers
        max_lines: Maximum number of diff lines (None for unlimited)
        context_lines: Number of context lines around changes (default 3)

    Returns:
        Unified diff string or None if no changes
    """
    before_lines = before.splitlines()
    after_lines = after.splitlines()
    diff_lines = list(
        difflib.unified_diff(
            before_lines,
            after_lines,
            fromfile=f"{display_path} (before)",
            tofile=f"{display_path} (after)",
            lineterm="",
            n=context_lines,
        )
    )
    if not diff_lines:
        return None
    if max_lines is not None and len(diff_lines) > max_lines:
        truncated = diff_lines[: max_lines - 1]
        truncated.append("...")
        return "\n".join(truncated)
    return "\n".join(diff_lines)


@dataclass
class FileOpMetrics:
    """Line and byte level metrics for a file operation."""

    lines_read: int = 0
    start_line: int | None = None
    end_line: int | None = None
    lines_written: int = 0
    lines_added: int = 0
    lines_removed: int = 0
    bytes_written: int = 0


@dataclass
class FileOperationRecord:
    """Track a single filesystem tool call."""

    tool_name: str
    display_path: str
    physical_path: Path | None
    tool_call_id: str | None
    args: dict[str, Any] = field(default_factory=dict)
    status: FileOpStatus = "pending"
    error: str | None = None
    metrics: FileOpMetrics = field(default_factory=FileOpMetrics)
    diff: str | None = None
    before_content: str | None = None
    after_content: str | None = None
    read_output: str | None = None
    hitl_approved: bool = False


def resolve_physical_path(path_str: str | None, assistant_id: str | None) -> Path | None:
    """Convert a virtual/relative path to a physical filesystem path."""
    if not path_str:
        return None
    try:
        if assistant_id and path_str.startswith("/memories/"):
            agent_dir = settings.get_agent_dir(assistant_id)
            suffix = path_str.removeprefix("/memories/").lstrip("/")
            return (agent_dir / suffix).resolve()
        path = Path(path_str)
        if path.is_absolute():
            return path
        return (Path.cwd() / path).resolve()
    except (OSError, ValueError):
        return None


def format_display_path(path_str: str | None) -> str:
    """Format a path for display."""
    if not path_str:
        return "(unknown)"
    try:
        path = Path(path_str)
        if path.is_absolute():
            return path.name or str(path)
        return str(path)
    except (OSError, ValueError):
        return str(path_str)



class FileOpTracker:
    """Collect file operation metrics during a CLI interaction."""

    def __init__(self, *, assistant_id: str | None, backend: BACKEND_TYPES | None = None) -> None:
        """Initialize the tracker."""
        self.assistant_id = assistant_id
        self.backend = backend
        self.active: dict[str | None, FileOperationRecord] = {}
        self.completed: list[FileOperationRecord] = []

    def start_operation(
        self, tool_name: str, args: dict[str, Any], tool_call_id: str | None
    ) -> None:
        if tool_name not in {"read_file", "write_file", "edit_file"}:
            return
        path_str = str(args.get("file_path") or args.get("path") or "")
        display_path = format_display_path(path_str)
        record = FileOperationRecord(
            tool_name=tool_name,
            display_path=display_path,
            physical_path=resolve_physical_path(path_str, self.assistant_id),
            tool_call_id=tool_call_id,
            args=args,
        )
        if tool_name in {"write_file", "edit_file"}:
            if self.backend and path_str:
                try:
                    responses = self.backend.download_files([path_str])
                    if (
                        responses
                        and responses[0].content is not None
                        and responses[0].error is None
                    ):
                        record.before_content = _decode_content(responses[0].content)
                    else:
                        record.before_content = ""
                except Exception:
                    record.before_content = ""
            elif record.physical_path:
                record.before_content = _safe_read(record.physical_path, secure=True) or ""
        self.active[tool_call_id] = record

    def update_args(self, tool_call_id: str, args: dict[str, Any]) -> None:
        """Update arguments for an active operation and retry capturing before_content."""
        record = self.active.get(tool_call_id)
        if not record:
            return

        record.args.update(args)

        # If we haven't captured before_content yet, try again now that we might have the path
        if record.before_content is None and record.tool_name in {"write_file", "edit_file"}:
            path_str = str(record.args.get("file_path") or record.args.get("path") or "")
            if path_str:
                record.display_path = format_display_path(path_str)
                record.physical_path = resolve_physical_path(path_str, self.assistant_id)
                if self.backend:
                    try:
                        responses = self.backend.download_files([path_str])
                        if (
                            responses
                            and responses[0].content is not None
                            and responses[0].error is None
                        ):
                            record.before_content = _decode_content(responses[0].content)
                        else:
                            record.before_content = ""
                    except Exception:
                        record.before_content = ""
                elif record.physical_path:
                    record.before_content = _safe_read(record.physical_path, secure=True) or ""

    def complete_with_message(self, tool_message: Any) -> FileOperationRecord | None:
        tool_call_id = getattr(tool_message, "tool_call_id", None)
        record = self.active.get(tool_call_id)
        if record is None:
            return None

        content = tool_message.content
        if isinstance(content, list):
            # Some tool messages may return list segments; join them for analysis.
            joined = []
            for item in content:
                if isinstance(item, str):
                    joined.append(item)
                else:
                    joined.append(str(item))
            content_text = "\n".join(joined)
        else:
            content_text = str(content) if content is not None else ""

        if getattr(
            tool_message, "status", "success"
        ) != "success" or content_text.lower().startswith("error"):
            record.status = "error"
            record.error = content_text
            self._finalize(record)
            return record

        record.status = "success"

        if record.tool_name == "read_file":
            record.read_output = content_text
            lines = _count_lines(content_text)
            record.metrics.lines_read = lines
            offset = record.args.get("offset")
            limit = record.args.get("limit")
            if isinstance(offset, int):
                record.metrics.start_line = offset + 1
                if lines:
                    record.metrics.end_line = offset + lines
            elif lines:
                record.metrics.start_line = 1
                record.metrics.end_line = lines
            if isinstance(limit, int) and lines > limit:
                record.metrics.end_line = (record.metrics.start_line or 1) + limit - 1
        else:
            # For write/edit operations, read back from backend (or local filesystem)
            self._populate_after_content(record)
            if record.after_content is None:
                record.status = "error"
                record.error = "Could not read updated file content."
                self._finalize(record)
                return record
            record.metrics.lines_written = _count_lines(record.after_content)
            before_lines = _count_lines(record.before_content or "")
            diff = compute_unified_diff(
                record.before_content or "",
                record.after_content,
                record.display_path,
                max_lines=100,
            )
            record.diff = diff
            if diff:
                additions = sum(
                    1
                    for line in diff.splitlines()
                    if line.startswith("+") and not line.startswith("+++")
                )
                deletions = sum(
                    1
                    for line in diff.splitlines()
                    if line.startswith("-") and not line.startswith("---")
                )
                record.metrics.lines_added = additions
                record.metrics.lines_removed = deletions
            elif record.tool_name == "write_file" and (record.before_content or "") == "":
                record.metrics.lines_added = record.metrics.lines_written
            record.metrics.bytes_written = len(record.after_content.encode("utf-8"))
            if record.diff is None and (record.before_content or "") != record.after_content:
                record.diff = compute_unified_diff(
                    record.before_content or "",
                    record.after_content,
                    record.display_path,
                    max_lines=100,
                )
            if record.diff is None and before_lines != record.metrics.lines_written:
                record.metrics.lines_added = max(record.metrics.lines_written - before_lines, 0)

        self._finalize(record)
        return record

    def _populate_after_content(self, record: FileOperationRecord) -> None:
        # Use backend if available (works for any BackendProtocol implementation)
        if self.backend:
            try:
                file_path = record.args.get("file_path") or record.args.get("path")
                if file_path:
                    responses = self.backend.download_files([file_path])
                    if (
                        responses
                        and responses[0].content is not None
                        and responses[0].error is None
                    ):
                        record.after_content = _decode_content(responses[0].content)
                    else:
                        record.after_content = None
                else:
                    record.after_content = None
            except Exception:
                record.after_content = None
        else:
            # Fallback: direct filesystem read when no backend provided
            if record.physical_path is None:
                record.after_content = None
                return
            record.after_content = _safe_read(record.physical_path, secure=True)

    def _finalize(self, record: FileOperationRecord) -> None:
        self.completed.append(record)
        self.active.pop(record.tool_call_id, None)
