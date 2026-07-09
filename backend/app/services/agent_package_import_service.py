"""Agent 团队模板导入服务。"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
import json
import shutil
import zipfile
from uuid import uuid4

from sqlalchemy.orm import Session

from app.repositories.agent import delete_agent_no_commit, get_agent_by_name
from app.repositories.agent_session import delete_agent_sessions_by_agent_id_no_commit
from app.repositories.agent_subagent_binding import (
    delete_subagent_bindings_by_child_agent_id,
    delete_subagent_bindings_by_parent_agent_id,
)
from app.schemas.agent_package import (
    AgentPackageImportAgentRead,
    AgentPackageImportRead,
    AgentPackageManifest,
)
from app.services.agent_service import create_agent_with_default_session
from app.services.agent_subagent_service import create_agent_subagent_binding
from app.services.session_runtime_service import resolve_agent_base_dir


REQUIRED_RUNTIME_FILES = ("identity.md", "agent.md", "tools.md", "model_config.json")
MAX_PACKAGE_BYTES = 50 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 5000
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024


@dataclass(frozen=True)
class _PackagedAgentPayload:
    key: str
    name: str
    required_files: dict[str, bytes]
    skill_files: list[tuple[PurePosixPath, bytes]]


def _validate_relative_archive_path(path: PurePosixPath) -> PurePosixPath:
    if path.is_absolute() or ".." in path.parts:
        raise RuntimeError(f"模板包包含非法路径: {path.as_posix()}")
    return path


def _read_manifest(archive: zipfile.ZipFile) -> AgentPackageManifest:
    try:
        raw_bytes = archive.read("manifest.json")
    except KeyError as exc:
        raise RuntimeError("模板包缺少 manifest.json") from exc

    try:
        payload = json.loads(raw_bytes.decode("utf-8"))
        return AgentPackageManifest.model_validate(payload)
    except Exception as exc:
        raise RuntimeError(f"模板包 manifest 无效: {exc}") from exc


def _validate_archive_limits(archive: zipfile.ZipFile) -> None:
    entries = archive.infolist()
    if len(entries) > MAX_ARCHIVE_ENTRIES:
        raise RuntimeError("模板包文件数量超出限制")

    total_uncompressed_bytes = 0
    for info in entries:
        total_uncompressed_bytes += max(0, info.file_size)
        if total_uncompressed_bytes > MAX_UNCOMPRESSED_BYTES:
            raise RuntimeError("模板包解压后内容体量超出限制")


def _load_packaged_agent_payloads(
    archive: zipfile.ZipFile,
    manifest: AgentPackageManifest,
) -> list[_PackagedAgentPayload]:
    payloads: list[_PackagedAgentPayload] = []

    for agent_meta in manifest.agents:
        base_prefix = PurePosixPath("agents") / agent_meta.key
        required_files: dict[str, bytes] = {}
        for filename in REQUIRED_RUNTIME_FILES:
            archive_path = base_prefix / filename
            try:
                required_files[filename] = archive.read(archive_path.as_posix())
            except KeyError as exc:
                raise RuntimeError(f"模板包中的 Agent `{agent_meta.name}` 缺少必要运行时文件: {filename}") from exc

        skill_files: list[tuple[PurePosixPath, bytes]] = []
        skills_prefix = (base_prefix / "skills").as_posix().rstrip("/") + "/"
        for name in archive.namelist():
            if not name.startswith(skills_prefix) or name.endswith("/"):
                continue
            relative_path = PurePosixPath(name).relative_to(base_prefix)
            normalized_relative_path = _validate_relative_archive_path(relative_path)
            skill_files.append((normalized_relative_path, archive.read(name)))

        payloads.append(
            _PackagedAgentPayload(
                key=agent_meta.key,
                name=agent_meta.name,
                required_files=required_files,
                skill_files=skill_files,
            )
        )

    return payloads


def _allocate_import_name(db: Session, *, desired_name: str, reserved_names: set[str]) -> str:
    if desired_name not in reserved_names and get_agent_by_name(db, desired_name) is None:
        reserved_names.add(desired_name)
        return desired_name

    suffix_index = 1
    while True:
        candidate = f"{desired_name}-导入" if suffix_index == 1 else f"{desired_name}-导入{suffix_index}"
        if candidate not in reserved_names and get_agent_by_name(db, candidate) is None:
            reserved_names.add(candidate)
            return candidate
        suffix_index += 1


def _materialize_runtime_payload(agent_id: int, payload: _PackagedAgentPayload) -> None:
    runtime_dir = resolve_agent_base_dir(agent_id)
    staging_dir = runtime_dir.parent / f"{runtime_dir.name}.staging-{uuid4().hex}"
    backup_dir = runtime_dir.parent / f"{runtime_dir.name}.backup-{uuid4().hex}"
    shutil.rmtree(staging_dir, ignore_errors=True)
    shutil.rmtree(backup_dir, ignore_errors=True)
    try:
        staging_dir.mkdir(parents=True, exist_ok=True)

        for filename, content in payload.required_files.items():
            target_path = staging_dir / filename
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(content)

        for relative_path, content in payload.skill_files:
            target_path = staging_dir / Path(relative_path.as_posix())
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(content)

        if runtime_dir.exists():
            runtime_dir.replace(backup_dir)
        staging_dir.replace(runtime_dir)
        shutil.rmtree(backup_dir, ignore_errors=True)
    except Exception:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        if backup_dir.exists() and not runtime_dir.exists():
            backup_dir.replace(runtime_dir)
        raise


def _cleanup_created_agents(db: Session, created_agent_ids: list[int]) -> None:
    if not created_agent_ids:
        return
    try:
        for agent_id in reversed(created_agent_ids):
            delete_subagent_bindings_by_parent_agent_id(db, agent_id, commit=False)
            delete_subagent_bindings_by_child_agent_id(db, agent_id, commit=False)
            delete_agent_sessions_by_agent_id_no_commit(db, agent_id)
            delete_agent_no_commit(db, agent_id)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        for agent_id in created_agent_ids:
            runtime_dir = resolve_agent_base_dir(agent_id)
            if runtime_dir.exists():
                shutil.rmtree(runtime_dir, ignore_errors=True)


def import_agent_package(db: Session, *, package_bytes: bytes) -> AgentPackageImportRead:
    """导入一个团队模板 ZIP，并创建新的全局 Agent 团队。"""

    if len(package_bytes) > MAX_PACKAGE_BYTES:
        raise RuntimeError("模板包体积超出限制")

    try:
        with zipfile.ZipFile(BytesIO(package_bytes)) as archive:
            _validate_archive_limits(archive)
            manifest = _read_manifest(archive)
            payloads = _load_packaged_agent_payloads(archive, manifest)
    except zipfile.BadZipFile as exc:
        raise RuntimeError("上传的文件不是有效的 ZIP 模板包") from exc
    except zipfile.LargeZipFile as exc:
        raise RuntimeError("ZIP 模板包格式不受支持") from exc

    reserved_names: set[str] = set()
    created_agent_ids: list[int] = []
    created_agents: list[AgentPackageImportAgentRead] = []
    imported_agent_ids_by_key: dict[str, int] = {}
    imported_agent_names_by_key: dict[str, str] = {}

    try:
        for payload in payloads:
            created_name = _allocate_import_name(db, desired_name=payload.name, reserved_names=reserved_names)
            agent, _default_session = create_agent_with_default_session(
                db,
                user_id=None,
                name=created_name,
                type=None,
                agent_json=None,
                default_working_dir=None,
                display_name=created_name,
            )
            created_agent_ids.append(agent.id)
            _materialize_runtime_payload(agent.id, payload)

            imported_agent_ids_by_key[payload.key] = agent.id
            imported_agent_names_by_key[payload.key] = agent.name
            created_agents.append(
                AgentPackageImportAgentRead(
                    source_key=payload.key,
                    source_name=payload.name,
                    created_agent_id=agent.id,
                    created_name=agent.name,
                    role="root" if payload.key == manifest.root_agent_key else "child",
                )
            )

        root_agent_id = imported_agent_ids_by_key[manifest.root_agent_key]
        for binding in manifest.bindings:
            create_agent_subagent_binding(
                db,
                parent_agent_id=root_agent_id,
                child_agent_id=imported_agent_ids_by_key[binding.child_key],
                subagent_name=binding.subagent_name,
                description=binding.description,
            )

        return AgentPackageImportRead(
            root_agent_id=root_agent_id,
            root_agent_name=imported_agent_names_by_key[manifest.root_agent_key],
            created_agents=created_agents,
            created_binding_count=len(manifest.bindings),
        )
    except ValueError as exc:
        _cleanup_created_agents(db, created_agent_ids)
        raise RuntimeError(str(exc)) from exc
    except Exception:
        _cleanup_created_agents(db, created_agent_ids)
        raise
