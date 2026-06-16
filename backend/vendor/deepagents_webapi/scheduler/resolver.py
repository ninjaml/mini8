"""Resolve agent_name, working_dir and thread_id from kind + target_id."""

import re
import uuid
from pathlib import Path
from typing import Optional, Tuple

from app.core.config import settings
from app.core.database import SessionLocal
from app.repositories.system_setting import get_system_setting
from app.repositories.workspace import get_workspace
from app.repositories.workspace_agent import get_workspace_agent

from deepagents_webapi.scheduler.models import AgentKind


def resolve_cron_agent(
    kind: AgentKind, target_id: Optional[int]
) -> Tuple[str, str]:
    """Derive agent_name and working_dir from kind + target_id.

    Logic mirrors backend/app/api/runtime_bridge.py.

    Args:
        kind: The agent kind (moss / workspace_superagent / workagent).
        target_id: workspace_id for superagent, agent_id for workagent, None for moss.

    Returns:
        Tuple of (agent_name, working_dir).

    Raises:
        ValueError: If target_id is missing or referenced object does not exist.
    """
    db = SessionLocal()
    try:
        if kind == AgentKind.MOSS:
            agent_name = "moss"
            moss_custom = get_system_setting(db, "moss_working_dir")
            if moss_custom and moss_custom.value:
                work_dir = Path(moss_custom.value)
            else:
                work_dir = settings.MOSS_WORK_DIR
            work_dir.mkdir(parents=True, exist_ok=True)
            return agent_name, str(work_dir)

        if kind == AgentKind.SUPERAGENT:
            if target_id is None:
                raise ValueError("target_id (workspace_id) is required for superagent")
            workspace = get_workspace(db, target_id)
            if workspace is None:
                raise ValueError(f"Workspace {target_id} not found")
            agent_name = f"workspace-{target_id}-superagent"
            if workspace.super_agent_working_dir:
                work_dir = Path(workspace.super_agent_working_dir)
            else:
                work_dir = settings.SUPERAGENT_WORKSPACES_DIR / str(target_id)
            work_dir.mkdir(parents=True, exist_ok=True)
            return agent_name, str(work_dir)

        if kind == AgentKind.WORKAGENT:
            if target_id is None:
                raise ValueError("target_id (agent_id) is required for workagent")
            agent = get_workspace_agent(db, target_id)
            if agent is None:
                raise ValueError(f"WorkAgent {target_id} not found")
            agent_name = f"workagent-{target_id}"
            if agent.working_dir:
                work_dir = Path(agent.working_dir)
            else:
                work_dir = settings.WORKAGENT_WORK_DIR / str(target_id)
            work_dir.mkdir(parents=True, exist_ok=True)
            return agent_name, str(work_dir)

        raise ValueError(f"Unsupported kind: {kind}")
    finally:
        db.close()


def generate_cron_thread_id(
    kind: AgentKind, target_id: Optional[int], job_name: str
) -> str:
    """Generate a stable, unique thread_id for a cron job.

    Format: cron-{kind}-{target_id}-{slug}-{uuid4_hex[:8]}
    Ensures no collision with WebSocket session thread_ids.

    Args:
        kind: The agent kind.
        target_id: Optional target identifier.
        job_name: Human-readable job name (slugified).

    Returns:
        A unique thread_id string.
    """
    slug = re.sub(r"[^a-zA-Z0-9_-]", "-", job_name)[:20]
    suffix = uuid.uuid4().hex[:8]
    if target_id is not None:
        return f"cron-{kind}-{target_id}-{slug}-{suffix}"
    return f"cron-{kind}-{slug}-{suffix}"