from pathlib import Path
from collections.abc import Iterable
from uuid import NAMESPACE_URL, uuid5

import re

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from shutil import copyfileobj

from app.core.config import settings
from app.core.database import get_db
from app.repositories.system_setting import get_system_setting
from app.repositories.workspace import get_workspace
from app.repositories.workspace_agent import get_workspace_agent


"""
运行时桥接接口模块。

把前端页面上下文（MOSS / workspace_superagent / workagent）映射为 deepagents 运行时可识别的
session，负责 prompt 模板补全、skill 模板同步、运行时上下文注入，以及 session 创建/更新。
"""

router = APIRouter(prefix="/runtime/context", tags=["runtime"])

# 用于在 agent.md 中标记系统运行时上下文区块的 HTML 注释锚点
RUNTIME_CONTEXT_START = "<!-- CamphorEOS_RUNTIME_CONTEXT_START -->"
RUNTIME_CONTEXT_END = "<!-- CamphorEOS_RUNTIME_CONTEXT_END -->"


class RuntimeContextRequest(BaseModel):
    """创建/更新运行时上下文的请求体。"""
    kind: str                       # 上下文类型：moss / workspace_superagent / workagent
    workspace_id: int | None = None
    agent_id: int | None = None
    current_item_id: int | None = None
    user_id: str | None = None


class RuntimeContextResponse(BaseModel):
    """创建/更新后的运行时上下文响应。"""
    thread_id: str
    agent_name: str
    display_name: str
    working_dir: str


def _read_prompt_template(template_dir: Path, file_name: str) -> str:
    """读取 prompt 模板文件内容；不存在时抛出 FileNotFoundError。"""
    template_path = template_dir / file_name
    if not template_path.exists():
        raise FileNotFoundError(f"Prompt template not found: {template_path}")
    return template_path.read_text(encoding="utf-8").strip()


def _copy_missing_tree(source_dir: Path, target_dir: Path) -> None:
    """
    把源目录树中缺失的文件复制到目标目录，已有文件不覆盖。
    用于向运行时 agent 目录同步最新 skill 模板。
    """
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
            target_path.write_text(source_path.read_text(encoding="utf-8"), encoding="utf-8")


def _upsert_runtime_context(agent_path: Path, base_content: str, runtime_context: str | None) -> None:
    """
    只更新系统生成的运行上下文块，避免覆盖人工维护的 agent.md 内容。

    参数:
        agent_path: agent.md 文件路径。
        base_content: agent.md 基础模板内容。
        runtime_context: 要注入的运行时上下文 Markdown 字符串；None 时不注入。
    """
    if agent_path.exists():
        content = agent_path.read_text(encoding="utf-8")
    else:
        content = base_content

    if not runtime_context:
        if not agent_path.exists():
            agent_path.write_text(content, encoding="utf-8")
        return

    runtime_block = (
        f"{RUNTIME_CONTEXT_START}\n"
        f"## mini8 Runtime Context\n\n"
        f"{runtime_context.strip()}\n"
        f"{RUNTIME_CONTEXT_END}"
    )
    start_index = content.find(RUNTIME_CONTEXT_START)
    end_index = content.find(RUNTIME_CONTEXT_END)

    if start_index != -1 and end_index != -1 and end_index > start_index:
        end_index += len(RUNTIME_CONTEXT_END)
        content = f"{content[:start_index].rstrip()}\n\n{runtime_block}\n{content[end_index:].lstrip()}"
    else:
        content = f"{content.rstrip()}\n\n{runtime_block}\n"

    agent_path.write_text(content, encoding="utf-8")


def _ensure_agent_scaffold(
    agent_dir: Path,
    identity_template: str,
    agent_template: str,
    tools_template: str,
    skill_template_dir: Path | Iterable[Path],
    runtime_context: str | None = None,
) -> None:
    """
    给运行时 agent 目录补齐最小模板，避免 deepagents_webapi 找不到基础文件。

    参数:
        agent_dir: agent 运行时根目录。
        identity_template: identity.md 模板内容。
        agent_template: agent.md 模板内容。
        tools_template: tools.md 模板内容。
        skill_template_dir: skill 模板目录（可多个）。
        runtime_context: 可选运行时上下文。
    """
    import json

    agent_dir.mkdir(parents=True, exist_ok=True)
    skills_dir = agent_dir / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)
    skill_template_dirs = [skill_template_dir] if isinstance(skill_template_dir, Path) else list(skill_template_dir)
    for template_dir in skill_template_dirs:
        _copy_missing_tree(template_dir, skills_dir)

    identity_path = agent_dir / "identity.md"
    if not identity_path.exists():
        identity_path.write_text(identity_template, encoding="utf-8")

    agent_path = agent_dir / "agent.md"
    _upsert_runtime_context(agent_path, agent_template, runtime_context)

    tools_path = agent_dir / "tools.md"
    if not tools_path.exists():
        tools_path.write_text(tools_template, encoding="utf-8")

    # 自动生成默认的 model_config.json（如果不存在）
    model_config_path = agent_dir / "model_config.json"
    if not model_config_path.exists():
        default_model_config = {
            "provider": None,
            "model_name": None,
            "base_url": None
        }
        model_config_path.write_text(
            json.dumps(default_model_config, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )


@router.post("/session", response_model=RuntimeContextResponse)
async def create_runtime_context_session(
    payload: RuntimeContextRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    把前端页面上下文映射成一个稳定的 runtime session。

    参数:
        payload: 包含 kind 及可选 workspace_id / agent_id / current_item_id。
        request: FastAPI 请求对象，用于取 session_manager。
        db: 数据库会话。

    返回:
        RuntimeContextResponse: 包含 thread_id、agent_name、display_name、working_dir。
    """
    session_manager = getattr(request.app.state, "runtime_session_manager", None)
    if session_manager is None:
        raise HTTPException(status_code=503, detail="Runtime session manager not initialized")

    if payload.kind == "moss":
        agent_name = "moss"
        display_name = "MOSS"
        agent_dir = settings.RUNTIME_MOSS_DIR
        moss_custom = get_system_setting(db, "moss_working_dir")
        if moss_custom and moss_custom.value:
            moss_work_dir = Path(moss_custom.value)
        else:
            moss_work_dir = settings.MOSS_WORK_DIR
        moss_work_dir.mkdir(parents=True, exist_ok=True)
        working_dir = str(moss_work_dir)
        thread_id = str(uuid5(NAMESPACE_URL, "CamphorEOS:moss"))
        _ensure_agent_scaffold(
            agent_dir=agent_dir,
            identity_template=_read_prompt_template(settings.MOSS_PROMPT_TEMPLATE_DIR, "default_identity.md"),
            agent_template=_read_prompt_template(settings.MOSS_PROMPT_TEMPLATE_DIR, "default_agent.md"),
            tools_template=_read_prompt_template(settings.MOSS_PROMPT_TEMPLATE_DIR, "default_tools.md"),
            skill_template_dir=[
                settings.MOSS_SKILL_TEMPLATE_DIR,
                settings.OBSIDIAN_TOOLS_SKILL_TEMPLATE_DIR,
            ],
            runtime_context=(
                "- role: MOSS\n"
                f"- current_user_id: {payload.user_id or 'unknown'}\n"
                f"- primary_key: {payload.user_id or 'unknown'}\n"
                "- bound_platform_workspace: none\n"
                f"- local_runtime_working_dir: {working_dir}\n"
                "- platform_workspace_rule: MOSS 没有默认绑定的 mini8 平台工作空间；"
                "管理具体工作空间前，必须通过 API/skill 查询、由用户明确指定或从当前对话中可靠定位 workspace_id。\n"
                "- boundary: local_runtime_working_dir 只是 deepagents 的本地运行目录，"
                "不是 mini8 平台工作空间，不能从本地目录推断平台业务状态。"
            ),
        )
    elif payload.kind == "workspace_superagent":
        if payload.workspace_id is None:
            raise HTTPException(status_code=400, detail="workspace_id is required for workspace_superagent")

        workspace = get_workspace(db, payload.workspace_id)
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")

        display_name = workspace.super_agent_nick_name or "项目经理"
        agent_name = f"workspace-{workspace.id}-superagent"
        agent_dir = settings.RUNTIME_AGENTS_DIR / agent_name
        if workspace.super_agent_working_dir:
            workspace_dir = Path(workspace.super_agent_working_dir)
        else:
            workspace_dir = settings.SUPERAGENT_WORKSPACES_DIR / str(workspace.id)
        workspace_dir.mkdir(parents=True, exist_ok=True)
        working_dir = str(workspace_dir)
        thread_id = str(uuid5(NAMESPACE_URL, f"CamphorEOS:workspace_superagent:{workspace.id}"))
        _ensure_agent_scaffold(
            agent_dir=agent_dir,
            identity_template=_read_prompt_template(settings.SUPERAGENT_PROMPT_TEMPLATE_DIR, "default_identity.md"),
            agent_template=_read_prompt_template(settings.SUPERAGENT_PROMPT_TEMPLATE_DIR, "default_agent.md"),
            tools_template=_read_prompt_template(settings.SUPERAGENT_PROMPT_TEMPLATE_DIR, "default_tools.md"),
            skill_template_dir=[
                settings.SUPERAGENT_SKILL_TEMPLATE_DIR,
                settings.OBSIDIAN_TOOLS_SKILL_TEMPLATE_DIR,
            ],
            runtime_context=(
                "- role: SuperAgent\n"
                f"- current_user_id: {payload.user_id or 'unknown'}\n"
                f"- primary_key: {payload.user_id or 'unknown'}\n"
                f"- bound_platform_workspace_id: {workspace.id}\n"
                f"- bound_platform_workspace_name: {workspace.name}\n"
                f"- display_name: {display_name}\n"
                f"- local_runtime_working_dir: {working_dir}\n"
                "- platform_workspace_rule: 当前 SuperAgent 只管理 bound_platform_workspace_id 对应的 mini8 平台工作空间；"
                "所有事项、workAgent、知识库和成果都必须限定在该 workspace_id 下。\n"
                "- boundary: local_runtime_working_dir 只是 deepagents 的本地运行目录，"
                "不是 mini8 平台工作空间，不能从本地目录推断平台业务状态。"
            ),
        )
    elif payload.kind == "workagent":
        if payload.agent_id is None:
            raise HTTPException(status_code=400, detail="agent_id is required for workagent")

        agent = get_workspace_agent(db, payload.agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="WorkAgent not found")

        workspace = get_workspace(db, agent.work_space_id)
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")

        display_name = agent.name or "执行专员"
        agent_name = f"workagent-{agent.id}"
        agent_dir = settings.RUNTIME_AGENTS_DIR / agent_name
        if agent.working_dir:
            workagent_dir = Path(agent.working_dir)
        else:
            workagent_dir = settings.WORKAGENT_WORK_DIR / str(agent.id)
        workagent_dir.mkdir(parents=True, exist_ok=True)
        working_dir = str(workagent_dir)
        thread_id = str(uuid5(NAMESPACE_URL, f"CamphorEOS:workagent:{agent.id}"))

        _ensure_agent_scaffold(
            agent_dir=agent_dir,
            identity_template=_read_prompt_template(settings.WORKAGENT_PROMPT_TEMPLATE_DIR, "default_identity.md"),
            agent_template=_read_prompt_template(settings.WORKAGENT_PROMPT_TEMPLATE_DIR, "default_agent.md"),
            tools_template=_read_prompt_template(settings.WORKAGENT_PROMPT_TEMPLATE_DIR, "default_tools.md"),
            skill_template_dir=[
                settings.WORKAGENT_SKILL_TEMPLATE_DIR,
                settings.OBSIDIAN_TOOLS_SKILL_TEMPLATE_DIR,
            ],
            runtime_context=(
                f"- role: WorkAgent\n"
                f"- current_user_id: {payload.user_id or 'unknown'}\n"
                f"- primary_key: {payload.user_id or 'unknown'}\n"
                f"- agent_id: {agent.id}\n"
                f"- bound_platform_workspace_id: {workspace.id}\n"
                f"- bound_platform_workspace_name: {workspace.name}\n"
                f"- display_name: {display_name}\n"
                f"- local_runtime_working_dir: {working_dir}\n"
                f"- boundary: local_runtime_working_dir 只是 deepagents 的本地运行目录，"
                f"不是 mini8 平台工作空间，不能从本地目录推断平台业务状态。"
            ),
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported runtime context kind")

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
        thread_id=thread_id,
        agent_name=agent_name,
        display_name=display_name,
        working_dir=working_dir,
    )


def _resolve_working_dir(kind: str, workspace_id: int | None, agent_id: int | None, db: Session) -> str:
    """根据上下文类型解析对应的 working_dir。"""
    if kind == "moss":
        moss_custom = get_system_setting(db, "moss_working_dir")
        if moss_custom and moss_custom.value:
            moss_work_dir = Path(moss_custom.value)
        else:
            moss_work_dir = settings.MOSS_WORK_DIR
        moss_work_dir.mkdir(parents=True, exist_ok=True)
        return str(moss_work_dir)

    elif kind == "workspace_superagent":
        if workspace_id is None:
            raise HTTPException(status_code=400, detail="workspace_id is required for workspace_superagent")
        workspace = get_workspace(db, workspace_id)
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found")
        if workspace.super_agent_working_dir:
            workspace_dir = Path(workspace.super_agent_working_dir)
        else:
            workspace_dir = settings.SUPERAGENT_WORKSPACES_DIR / str(workspace.id)
        workspace_dir.mkdir(parents=True, exist_ok=True)
        return str(workspace_dir)

    elif kind == "workagent":
        if agent_id is None:
            raise HTTPException(status_code=400, detail="agent_id is required for workagent")
        agent = get_workspace_agent(db, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="WorkAgent not found")
        if agent.working_dir:
            workagent_dir = Path(agent.working_dir)
        else:
            workagent_dir = settings.WORKAGENT_WORK_DIR / str(agent.id)
        workagent_dir.mkdir(parents=True, exist_ok=True)
        return str(workagent_dir)

    else:
        raise HTTPException(status_code=400, detail="Unsupported runtime context kind")


@router.post("/upload")
async def upload_to_working_dir(
    kind: str = File(...),
    workspace_id: int | None = File(None),
    agent_id: int | None = File(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    上传文件到指定 agent 的 working_dir/uploads 子目录。
    返回保存后的绝对路径，供前端直接插入到提示词中。
    """
    working_dir = Path(_resolve_working_dir(kind, workspace_id, agent_id, db))
    uploads_dir = working_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    # 使用原始文件名，覆盖同名文件
    safe_name = file.filename or "unnamed"
    target_path = uploads_dir / safe_name

    with target_path.open("wb") as buffer:
        copyfileobj(file.file, buffer)

    return {"path": str(target_path.resolve())}


def _parse_skill_md(skill_md_path: Path) -> dict | None:
    """解析 SKILL.md 的 YAML frontmatter，提取 name 和 description。"""
    try:
        content = skill_md_path.read_text(encoding="utf-8")
        frontmatter_pattern = r"^---\s*\n(.*?)\n---\s*\n"
        match = re.match(frontmatter_pattern, content, re.DOTALL)
        if not match:
            return None

        frontmatter = match.group(1)
        metadata: dict[str, str] = {}
        for line in frontmatter.split("\n"):
            kv_match = re.match(r"^(\w+):\s*(.+)$", line.strip())
            if kv_match:
                key, value = kv_match.groups()
                metadata[key] = value.strip()

        if "name" not in metadata or "description" not in metadata:
            return None

        return {
            "name": metadata["name"],
            "description": metadata["description"],
            "path": str(skill_md_path),
        }
    except (OSError, UnicodeDecodeError):
        return None


@router.get("/skills")
async def get_runtime_skills(
    kind: str = Query(...),
    id: str | None = Query(None),
):
    """
    获取指定 Agent 运行时目录下的 skill 列表。

    参数:
        kind: 上下文类型 — moss / workspace_superagent / workagent
        id:   对应实体 ID（workspace_id 或 agent_id），kind=moss 时不需要

    返回:
        {"skills": [{"name": "...", "description": "...", "path": "..."}]}
    """
    if kind == "moss":
        agent_dir = settings.RUNTIME_MOSS_DIR
    elif kind == "workspace_superagent":
        if not id:
            raise HTTPException(status_code=400, detail="id is required for workspace_superagent")
        agent_dir = settings.RUNTIME_AGENTS_DIR / f"workspace-{id}-superagent"
    elif kind == "workagent":
        if not id:
            raise HTTPException(status_code=400, detail="id is required for workagent")
        agent_dir = settings.RUNTIME_AGENTS_DIR / f"workagent-{id}"
    else:
        raise HTTPException(status_code=400, detail="Invalid kind. Use moss, workspace_superagent, or workagent.")

    skills_dir = agent_dir / "skills"
    skills: list[dict] = []

    if skills_dir.exists():
        for skill_subdir in sorted(skills_dir.iterdir()):
            if not skill_subdir.is_dir():
                continue
            skill_md = skill_subdir / "SKILL.md"
            if skill_md.exists():
                meta = _parse_skill_md(skill_md)
                if meta:
                    skills.append(meta)

    return {"skills": skills}
