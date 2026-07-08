"""定时任务运行目标解析。"""

import re
import uuid
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.repositories.agent import get_agent
from app.repositories.agent_session import get_agent_session
from app.repositories.moss_config import get_moss_config
from app.repositories.workspace import get_workspace
from app.services.session_runtime_service import (
    build_agent_runtime_name,
    resolve_agent_default_working_dir,
    resolve_workspace_working_dir,
)
from deepagents_webapi.api.cron_models import AgentKind


def resolve_cron_agent(
    kind: AgentKind,
    agent_session_id: Optional[int] = None,
    db: Session | None = None,
) -> Tuple[str, str, Optional[int]]:
    """
    按 cron 作用域解析真实执行目标。

    返回值依次为：``agent_name``、``working_dir``、``agent_session_id``。
    """
    owns_db = db is None
    if db is None:
        db = SessionLocal()
    try:
        if kind == AgentKind.MOSS:
            agent_name = "moss"
            # MOSS 优先读取自定义工作目录，没有则退回全局配置。
            moss_custom = get_moss_config(db, "moss_working_dir")
            if moss_custom and moss_custom.value:
                work_dir = Path(moss_custom.value)
            else:
                work_dir = settings.MOSS_WORK_DIR
            work_dir.mkdir(parents=True, exist_ok=True)
            return agent_name, str(work_dir), None

        if kind == AgentKind.AGENT_SESSION:
            if agent_session_id is None:
                raise ValueError("agent_session_id is required for agent_session")
            agent_session = get_agent_session(db, agent_session_id)
            if agent_session is None:
                raise ValueError("AgentSession not found")

            agent = get_agent(db, agent_session.agent_id)
            if agent is None:
                raise ValueError("Agent not found")

            if agent_session.session_type == "workspace":
                # workspace 会话使用所属工作区目录。
                workspace = get_workspace(db, agent_session.workspace_id)
                if workspace is None:
                    raise ValueError("Workspace not found")
                working_dir = resolve_workspace_working_dir(workspace)
            else:
                # default 会话退回 agent 默认工作目录。
                working_dir = resolve_agent_default_working_dir(agent)

            # 普通 Agent 任务运行时使用统一的 runtime agent 名称。
            return build_agent_runtime_name(agent.id), working_dir, agent_session_id

        raise ValueError(f"Unsupported kind: {kind}")
    finally:
        if owns_db:
            db.close()


def generate_cron_thread_id(
    kind: AgentKind,
    job_name: str,
    agent_session_id: Optional[int] = None,
) -> str:
    """
    为一条 cron 任务生成唯一的 thread_id。

    任务创建时分配一个唯一 thread_id，后续该任务持续复用这个值。
    格式大致为：``cron-{kind}-{session_or_slug}-{uuid_suffix}``。
    """
    slug = re.sub(r"[^a-zA-Z0-9_-]", "-", job_name)[:20]
    suffix = uuid.uuid4().hex[:8]
    kind_value = kind.value
    if agent_session_id is not None:
        return f"cron-{kind_value}-{agent_session_id}-{slug}-{suffix}"
    return f"cron-{kind_value}-{slug}-{suffix}"
