from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SessionRuntimeSpec:
    agent_session_id: int
    agent_id: int
    thread_id: str
    display_name: str
    working_dir: str
    base_agent_dir: Path
    persona_name: str | None
    prompt_overlay: str | None
    skill_source_dirs: list[Path]
    scope: dict[str, Any] | None
    runtime_context_entries: list[tuple[str, Any]]
    # 当前 parent session 的子 Agent 工作模式真相：
    # 它回答的是“这一场会话里的 child 统一按什么语义运行”，
    # 而不是某个 child binding 自己携带的模式。
    subagent_mode: str | None = None
