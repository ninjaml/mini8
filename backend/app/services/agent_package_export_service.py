"""Agent 团队模板导出服务。"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import json
import zipfile

from sqlalchemy.orm import Session

from app.repositories.agent import get_agent
from app.repositories.agent_subagent_binding import list_subagent_bindings_by_parent_agent_id
from app.schemas.agent_package import (
    AgentPackageAgentManifest,
    AgentPackageBindingManifest,
    AgentPackageManifest,
)
from app.services.session_runtime_service import resolve_agent_base_dir


REQUIRED_RUNTIME_FILES = ("identity.md", "agent.md", "tools.md", "model_config.json")


@dataclass(frozen=True)
class AgentPackageExportResult:
    """导出后的 ZIP 二进制结果。"""

    filename: str
    content: bytes


@dataclass(frozen=True)
class _PackagedAgent:
    key: str
    name: str
    runtime_dir: Path


def _assert_required_runtime_files(runtime_dir: Path, *, agent_name: str) -> None:
    for filename in REQUIRED_RUNTIME_FILES:
        file_path = runtime_dir / filename
        if not file_path.is_file():
            raise RuntimeError(f"Agent `{agent_name}` 缺少必要运行时文件: {filename}")


def _write_runtime_tree(archive: zipfile.ZipFile, *, package_key: str, runtime_dir: Path, agent_name: str) -> None:
    _assert_required_runtime_files(runtime_dir, agent_name=agent_name)

    for filename in REQUIRED_RUNTIME_FILES:
        archive.write(runtime_dir / filename, f"agents/{package_key}/{filename}")

    skills_dir = runtime_dir / "skills"
    if not skills_dir.exists():
        return

    for path in skills_dir.rglob("*"):
        if path.is_dir():
            continue
        relative_path = path.relative_to(runtime_dir)
        archive.write(path, (Path("agents") / package_key / relative_path).as_posix())


def export_agent_package(db: Session, *, root_agent_id: int) -> AgentPackageExportResult:
    """导出一个 root Agent 及其直连 child roster。"""

    root_agent = get_agent(db, root_agent_id)
    if root_agent is None:
        raise RuntimeError("Root agent not found")

    bindings = list_subagent_bindings_by_parent_agent_id(db, root_agent_id)
    packaged_agents: list[_PackagedAgent] = [
        _PackagedAgent(
            key="root",
            name=root_agent.name,
            runtime_dir=resolve_agent_base_dir(root_agent.id),
        )
    ]
    manifest_bindings: list[AgentPackageBindingManifest] = []

    for index, binding in enumerate(bindings, start=1):
        child_agent = get_agent(db, binding.child_agent_id)
        if child_agent is None:
            raise RuntimeError(f"Child agent not found: {binding.child_agent_id}")
        child_key = f"child-{index}"
        packaged_agents.append(
            _PackagedAgent(
                key=child_key,
                name=child_agent.name,
                runtime_dir=resolve_agent_base_dir(child_agent.id),
            )
        )
        manifest_bindings.append(
            AgentPackageBindingManifest(
                child_key=child_key,
                subagent_name=binding.subagent_name,
                description=binding.description,
            )
        )

    manifest = AgentPackageManifest(
        root_agent_key="root",
        agents=[AgentPackageAgentManifest(key=entry.key, name=entry.name) for entry in packaged_agents],
        bindings=manifest_bindings,
    )

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "manifest.json",
            json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2),
        )
        for packaged_agent in packaged_agents:
            _write_runtime_tree(
                archive,
                package_key=packaged_agent.key,
                runtime_dir=packaged_agent.runtime_dir,
                agent_name=packaged_agent.name,
            )

    return AgentPackageExportResult(
        filename=f"agent-team-{root_agent_id}.zip",
        content=zip_buffer.getvalue(),
    )
