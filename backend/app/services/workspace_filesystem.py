from __future__ import annotations

import shutil
from pathlib import Path

from app.core.config import settings


def delete_workspace_filesystem_dir(workspace_id: int) -> None:
    """删除平台自管的 workspace 文件系统目录。

    这里删除的是 `data/workspaces/{workspace_id}` 这类平台目录，
    不是 `workspace.working_dir` 指向的共享工作目录。

    调用链：
    - 仅在删除 workspace 主记录时调用

    分层边界：
    - 这里只清理平台自己生成/维护的目录
    - 用户自己配置的共享工作目录属于业务真相，不在这里做递归删除
    """
    workspace_dir = settings.DATA_DIR / "workspaces" / str(workspace_id)
    if not workspace_dir.exists():
        return
    shutil.rmtree(workspace_dir, ignore_errors=True)
