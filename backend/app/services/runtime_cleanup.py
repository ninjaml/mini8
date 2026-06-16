import shutil
from uuid import NAMESPACE_URL, uuid5

from deepagents_webapi.session.session_manager import AsyncSessionManager

from app.core.config import settings


"""
运行时清理服务。

当工作空间被删除或需要重置时，负责物理删除其对应的 SuperAgent
运行时目录、工作目录以及 session 元数据，防止残留数据占用磁盘或干扰后续运行。
"""


def build_workspace_superagent_name(workspace_id: int) -> str:
    """构造工作空间 SuperAgent 的运行时目录/名称标识。"""
    return f"workspace-{workspace_id}-superagent"


def build_workspace_superagent_thread_id(workspace_id: int) -> str:
    """
    基于 UUID5 生成稳定的工作空间 SuperAgent thread_id。
    同一 workspace_id 永远得到相同 thread_id，便于幂等删除与重建。
    """
    return str(uuid5(NAMESPACE_URL, f"CamphorEOS:workspace_superagent:{workspace_id}"))


async def delete_workspace_superagent_runtime_artifacts(
    workspace_id: int,
    session_manager: AsyncSessionManager | None,
) -> None:
    """
    删除工作空间对应的 SuperAgent 运行时目录与 session 元数据。

    参数:
        workspace_id: 目标工作空间 ID。
        session_manager: 异步 session 管理器；为 None 时跳过 session 清理。
    """
    runtime_agent_dir = settings.RUNTIME_AGENTS_DIR / build_workspace_superagent_name(workspace_id)
    if runtime_agent_dir.exists():
        shutil.rmtree(runtime_agent_dir, ignore_errors=True)

    work_dir = settings.SUPERAGENT_WORKSPACES_DIR / str(workspace_id)
    if work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)

    if session_manager is not None:
        await session_manager.delete_session(build_workspace_superagent_thread_id(workspace_id))
