"""运行时桥接接口。

负责把前端的“打开会话、上传文件、查看技能”请求翻译为 deepagents 运行时可消费的上下文。
"""

from pathlib import Path
from collections.abc import Iterable
from uuid import NAMESPACE_URL, uuid5

import re
import json
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from shutil import copyfileobj

from app.core.config import settings
from app.core.database import get_db
from app.repositories.agent_session import get_agent_session
from app.repositories.moss_config import get_moss_config
from app.services.agent_service import ensure_agent_base_dir
from app.services.runtime_skill_service import build_runtime_skill_catalog
from app.services.session_runtime_service import build_agent_runtime_name, build_session_runtime_spec
from deepagents_webapi.session.env_manager import EnvManager


router = APIRouter(prefix="/runtime/context", tags=["runtime"])

MOSS_RUNTIME_CONTEXT_START = "<!-- CamphorEOS_RUNTIME_CONTEXT_START -->"
MOSS_RUNTIME_CONTEXT_END = "<!-- CamphorEOS_RUNTIME_CONTEXT_END -->"


class RuntimeContextRequest(BaseModel):
    """创建/复用 runtime session 时的请求体。

    语义分流：
    - ``kind == "moss"``: 走 MOSS 运行时
    - ``kind is None``: 走普通 Agent 运行时，此时 ``agent_session_id`` 与 ``primary_key`` 都重要
    """
    kind: str | None = None
    agent_session_id: int | None = None
    primary_key: str | None = None


class RuntimeContextResponse(BaseModel):
    """前端建连 deepagents runtime 前需要拿到的最小上下文。"""
    agent_session_id: int | None = None
    thread_id: str
    agent_name: str
    display_name: str
    working_dir: str


def _require_primary_key_for_agent_runtime(kind: str | None, primary_key: str | None) -> str | None:
    """校验普通 Agent 运行时所需的 primary_key，MOSS 例外。"""
    if kind == "moss":
        return primary_key
    if primary_key is None or not str(primary_key).strip():
        raise HTTPException(status_code=400, detail="primary_key is required")
    return str(primary_key).strip()


def _validate_runtime_kind(kind: str | None) -> None:
    """目前仅支持普通 Agent 与 MOSS 两类运行时。"""
    if kind in (None, "moss"):
        return
    raise HTTPException(status_code=400, detail="Unsupported runtime context kind")


def _read_prompt_template(template_dir: Path, file_name: str) -> str:
    """读取模板目录中的提示词文件。"""
    template_path = template_dir / file_name
    if not template_path.exists():
        raise FileNotFoundError(f"Prompt template not found: {template_path}")
    return template_path.read_text(encoding="utf-8").strip()


def _copy_missing_tree(source_dir: Path, target_dir: Path) -> None:
    """仅补齐缺失文件，避免覆盖运行时目录里的用户修改。"""
    if not source_dir.exists():
        raise FileNotFoundError(f"Skill template directory not found: {source_dir}")

    for source_path in source_dir.rglob("*"):
        relative_path = source_path.relative_to(source_dir)
        target_path = target_dir / relative_path
        if source_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if not target_path.exists():
            shutil.copy2(source_path, target_path)


MANAGED_SKILLS_MANIFEST = ".camphor_managed_skills.json"


def _load_managed_skill_names(target_dir: Path) -> list[str]:
    """读取由系统托管的技能目录清单。"""
    manifest_path = target_dir / MANAGED_SKILLS_MANIFEST
    if not manifest_path.exists():
        return []
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    names = payload.get("managed_skill_dirs", [])
    return [name for name in names if isinstance(name, str) and name.strip()]


def _save_managed_skill_names(target_dir: Path, names: list[str]) -> None:
    """保存由系统托管的技能目录清单。"""
    manifest_path = target_dir / MANAGED_SKILLS_MANIFEST
    manifest_path.write_text(
        json.dumps({"managed_skill_dirs": sorted(set(names))}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _rebuild_managed_skills_tree(source_dirs: list[Path], target_dir: Path) -> None:
    """重建系统托管的技能目录，并清掉上一次托管残留。"""
    previous_managed_names = _load_managed_skill_names(target_dir)
    for skill_name in previous_managed_names:
        managed_path = target_dir / skill_name
        if managed_path.exists() and managed_path.is_dir():
            shutil.rmtree(managed_path, ignore_errors=True)

    current_managed_names: list[str] = []
    for template_dir in source_dirs:
        if not template_dir.exists():
            raise FileNotFoundError(f"Skill template directory not found: {template_dir}")
        for source_path in template_dir.iterdir():
            if not source_path.is_dir():
                continue
            current_managed_names.append(source_path.name)
        _copy_missing_tree(template_dir, target_dir)

    _save_managed_skill_names(target_dir, current_managed_names)


def _upsert_moss_runtime_context(agent_path: Path, base_content: str, runtime_context: str | None) -> None:
    """把 MOSS 的运行时上下文块插入或更新到 `agent.md`。"""
    if agent_path.exists():
        content = agent_path.read_text(encoding="utf-8")
    else:
        content = base_content

    if not runtime_context:
        if not agent_path.exists():
            agent_path.write_text(content, encoding="utf-8")
        return

    runtime_block = (
        f"{MOSS_RUNTIME_CONTEXT_START}\n"
        f"## CamphorEOS Runtime Context\n\n"
        f"{runtime_context.strip()}\n"
        f"{MOSS_RUNTIME_CONTEXT_END}"
    )
    start_index = content.find(MOSS_RUNTIME_CONTEXT_START)
    end_index = content.find(MOSS_RUNTIME_CONTEXT_END)

    if start_index != -1 and end_index != -1 and end_index > start_index:
        end_index += len(MOSS_RUNTIME_CONTEXT_END)
        content = f"{content[:start_index].rstrip()}\n\n{runtime_block}\n{content[end_index:].lstrip()}"
    else:
        content = f"{content.rstrip()}\n\n{runtime_block}\n"

    agent_path.write_text(content, encoding="utf-8")


def _ensure_moss_scaffold(
    moss_dir: Path,
    identity_template: str,
    agent_template: str,
    tools_template: str,
    skill_template_dir: Path | Iterable[Path],
    runtime_context: str | None = None,
) -> None:
    """确保 MOSS 运行时目录、模板文件和技能树完整可用。"""
    import json

    moss_dir.mkdir(parents=True, exist_ok=True)
    skills_dir = moss_dir / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)
    skill_template_dirs = [skill_template_dir] if isinstance(skill_template_dir, Path) else list(skill_template_dir)
    _rebuild_managed_skills_tree(skill_template_dirs, skills_dir)

    identity_path = moss_dir / "identity.md"
    if not identity_path.exists():
        identity_path.write_text(identity_template, encoding="utf-8")

    agent_path = moss_dir / "agent.md"
    _upsert_moss_runtime_context(agent_path, agent_template, runtime_context)

    tools_path = moss_dir / "tools.md"
    if not tools_path.exists():
        tools_path.write_text(tools_template, encoding="utf-8")

    model_config_path = moss_dir / "model_config.json"
    if not model_config_path.exists():
        default_model_config = EnvManager().get_default_model_config()
        model_config_path.write_text(
            json.dumps(default_model_config, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


@router.post("/session", response_model=RuntimeContextResponse)
async def create_runtime_context_session(
    payload: RuntimeContextRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """创建或复用运行时 session，并返回前端需要的上下文信息。

    真实职责不是新建数据库里的 AgentSession，
    而是确保 vendor runtime 侧存在一个可用的 thread session。
    """
    session_manager = getattr(request.app.state, "runtime_session_manager", None)
    if session_manager is None:
        raise HTTPException(status_code=503, detail="Runtime session manager not initialized")

    _validate_runtime_kind(payload.kind)
    resolved_primary_key = _require_primary_key_for_agent_runtime(payload.kind, payload.primary_key)

    if payload.kind == "moss":
        # MOSS 不依赖 agent_session_id；其 thread_id 也是全局稳定单例。
        agent_name = "moss"
        display_name = "MOSS"
        agent_dir = settings.RUNTIME_MOSS_DIR
        moss_custom = get_moss_config(db, "moss_working_dir")
        if moss_custom and moss_custom.value:
            moss_work_dir = Path(moss_custom.value)
        else:
            moss_work_dir = settings.MOSS_WORK_DIR
        moss_work_dir.mkdir(parents=True, exist_ok=True)
        working_dir = str(moss_work_dir)
        thread_id = str(uuid5(NAMESPACE_URL, "CamphorEOS:moss"))
        _ensure_moss_scaffold(
            moss_dir=agent_dir,
            identity_template=_read_prompt_template(settings.MOSS_AGENT_TEMPLATE_DIR, "default_identity.md"),
            agent_template=_read_prompt_template(settings.MOSS_AGENT_TEMPLATE_DIR, "default_agent.md"),
            tools_template=_read_prompt_template(settings.MOSS_AGENT_TEMPLATE_DIR, "default_tools.md"),
            skill_template_dir=[
                settings.MOSS_SKILL_TEMPLATE_DIR,
            ],
            runtime_context=(f"- current_user_id: {resolved_primary_key or 'unknown'}\n"),
        )
    else:
        # 普通 Agent 路径严格依赖现有 AgentSession 真相，再折叠成 runtime spec。
        if payload.agent_session_id is None:
            raise HTTPException(status_code=400, detail="agent_session_id is required")
        spec = build_session_runtime_spec(
            db,
            agent_session_id=payload.agent_session_id,
            primary_key=resolved_primary_key,
        )
        agent_name = build_agent_runtime_name(spec.agent_id)
        agent_dir = spec.base_agent_dir
        ensure_agent_base_dir(spec.agent_id)
        thread_id = spec.thread_id
        working_dir = spec.working_dir
        display_name = spec.display_name

    if not await session_manager.session_exists(thread_id):
        await session_manager.create_session(
            thread_id=thread_id,
            agent_name=agent_name,
            working_dir=working_dir,
            name=display_name,
            history_turn_limit=20,
        )
    else:
        await session_manager.update_session_metadata(
            thread_id,
            agent_name=agent_name,
            name=display_name,
            working_dir=working_dir,
            history_turn_limit=20,
        )

    return RuntimeContextResponse(
        agent_session_id=spec.agent_session_id if 'spec' in locals() else None,
        thread_id=thread_id,
        agent_name=agent_name,
        display_name=display_name,
        working_dir=working_dir,
    )

def _resolve_working_dir(
    *,
    kind: str | None,
    agent_session_id: int | None,
    primary_key: str | None,
    db: Session,
) -> str:
    """根据运行时类型解析当前上传/执行应落到的工作目录。

    这里与 ``/session`` 保持同一套分流规则，
    保证“建连看到的 working_dir”和“上传文件落点”一致。
    """
    _validate_runtime_kind(kind)
    resolved_primary_key = _require_primary_key_for_agent_runtime(kind, primary_key)
    if kind == "moss":
        moss_custom = get_moss_config(db, "moss_working_dir")
        if moss_custom and moss_custom.value:
            moss_work_dir = Path(moss_custom.value)
        else:
            moss_work_dir = settings.MOSS_WORK_DIR
        moss_work_dir.mkdir(parents=True, exist_ok=True)
        return str(moss_work_dir)

    if agent_session_id is None:
        raise HTTPException(status_code=400, detail="agent_session_id is required")
    spec = build_session_runtime_spec(
        db,
        agent_session_id=agent_session_id,
        primary_key=resolved_primary_key,
    )
    return spec.working_dir


@router.post("/upload")
async def upload_to_working_dir(
    kind: str | None = File(None),
    agent_session_id: int | None = File(None),
    primary_key: str | None = File(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """把上传文件写入运行时工作目录下的 ``uploads/`` 子目录。

    前端上传入口会附带和 runtime 建连相同的一组上下文字段，
    因此文件总是落到当前运行态真正会看到的 working_dir 下。
    """
    print(
        "[runtime_bridge.upload] received",
        {
            "kind": kind,
            "agent_session_id": agent_session_id,
            "primary_key": "[set]" if primary_key else None,
            "file": getattr(file, "filename", None),
        },
        flush=True,
    )
    working_dir = Path(
        _resolve_working_dir(
            kind=kind,
            agent_session_id=agent_session_id,
            primary_key=primary_key,
            db=db,
        )
    )
    print("[runtime_bridge.upload] resolved working_dir", str(working_dir), flush=True)
    uploads_dir = working_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    safe_name = file.filename or "unnamed"
    target_path = uploads_dir / safe_name

    with target_path.open("wb") as buffer:
        copyfileobj(file.file, buffer)

    print("[runtime_bridge.upload] saved path", str(target_path), flush=True)

    return {"path": str(target_path.resolve())}

@router.get("/skills")
async def get_runtime_skills(
    kind: str | None = Query(None),
    agent_session_id: int | None = Query(None),
    primary_key: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """列出当前运行时可见的技能目录清单。

    - MOSS: 直接读取 ``RUNTIME_MOSS_DIR/skills``
    - 普通 Agent: 按 ``SessionRuntimeSpec.skill_source_dirs`` 聚合
    """
    _validate_runtime_kind(kind)
    resolved_primary_key = _require_primary_key_for_agent_runtime(kind, primary_key)
    if kind == "moss":
        source_dirs = [settings.RUNTIME_MOSS_DIR / "skills"]
    else:
        if agent_session_id is None:
            raise HTTPException(status_code=400, detail="agent_session_id is required")
        spec = build_session_runtime_spec(
            db,
            agent_session_id=agent_session_id,
            primary_key=resolved_primary_key,
        )
        source_dirs = spec.skill_source_dirs

    return {"skills": build_runtime_skill_catalog(source_dirs)}









