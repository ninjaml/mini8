import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings


def get_base_resource_bundle() -> dict[str, Path]:
    """返回普通业务 Agent 的基础注入资源路径集合。

    这组资源不属于某个 persona，而是所有普通 Agent 共享的基础模板层。
    """
    base_dir = settings.AGENT_BASE_DIR
    return {
        "base_dir": base_dir,
        "identity_path": base_dir / "identity.md",
        "prompt_path": base_dir / "agent.md",
        "tools_path": base_dir / "tools.md",
        "skills_dir": base_dir / "skills",
    }


def get_persona_resource_bundle(persona_name: str) -> dict[str, Path]:
    """按 persona 目录名返回路径资源集合。

    当前 persona 的真相完全来自用户目录：
    ``~/.CamphorEOS/persona/{persona_name}/``
    """
    persona_dir = settings.PERSONA_DIR / persona_name
    return {
        "persona_dir": persona_dir,
        "prompt_path": persona_dir / "prompt.md",
        "skills_dir": persona_dir / "skills",
    }


def _bootstrap_persona_directory() -> None:
    """首次启动时，把内置 persona 模板复制到用户目录。"""
    if settings.PERSONA_DIR.exists():
        return
    settings.PERSONA_DIR.mkdir(parents=True, exist_ok=True)
    template_dir = settings.PERSONA_TEMPLATE_DIR
    if not template_dir.exists():
        return
    for entry in sorted(template_dir.iterdir(), key=lambda item: item.name):
        if not entry.is_dir():
            continue
        shutil.copytree(entry, settings.PERSONA_DIR / entry.name)


def list_persona_names() -> list[str]:
    """列出当前 persona 根目录下可用的 persona 名称。

    当前判断标准很具体：
    - 必须是目录
    - 目录下必须存在 ``prompt.md``

    仅有 skills 目录但缺 prompt 的目录，不算有效 persona。
    """
    if not settings.PERSONA_DIR.exists():
        return []
    names: list[str] = []
    for entry in sorted(settings.PERSONA_DIR.iterdir(), key=lambda item: item.name):
        if not entry.is_dir():
            continue
        if (entry / "prompt.md").exists():
            names.append(entry.name)
    return names


def persona_exists(persona_name: str | None) -> bool:
    """判断 persona 是否存在。

    这里的语义需要特别注意：
    - ``None`` 被当成“未设置 persona”，这是合法状态，所以返回 True
    - 非空 persona_name 只检查 ``prompt.md`` 是否存在
    - skills 目录允许不存在
    """
    if persona_name is None:
        return True
    return get_persona_resource_bundle(persona_name)["prompt_path"].exists()


def _validate_prompt_and_optional_skills(prompt_path: Path, skills_dir: Path) -> None:
    """校验 prompt 必备，skills 目录允许为空。"""
    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt not found: {prompt_path}")
    if skills_dir.exists() and not skills_dir.is_dir():
        raise NotADirectoryError(f"Skills path is not a directory: {skills_dir}")


def _validate_base_resources() -> None:
    """校验基础模板资源是否完整存在。"""
    bundle = get_base_resource_bundle()
    if not bundle["identity_path"].exists():
        raise FileNotFoundError(f"Base identity not found: {bundle['identity_path']}")
    if not bundle["tools_path"].exists():
        raise FileNotFoundError(f"Base tools not found: {bundle['tools_path']}")
    _validate_prompt_and_optional_skills(bundle["prompt_path"], bundle["skills_dir"])


def _validate_persona_resources(persona_name: str) -> None:
    """校验指定 persona 的目录资源是否完整存在。"""
    bundle = get_persona_resource_bundle(persona_name)
    _validate_prompt_and_optional_skills(bundle["prompt_path"], bundle["skills_dir"])


def ensure_persona_directories(db: Session) -> None:
    """
    校验基础注入层与当前 persona 目录资源。

    当前阶段 persona 的唯一真相是 ``~/.CamphorEOS/persona/<persona_name>/`` 路径资源。
    应用内置的 ``backend/app/persona/`` 只作为首次启动时的模板来源。
    """
    # 这个 db 参数目前只是为了保持与启动期 service 调用签名一致；
    # 当前实现不会读取数据库中的 persona 表。
    _ = db
    _bootstrap_persona_directory()
    _validate_base_resources()
    for persona_name in list_persona_names():
        _validate_persona_resources(persona_name)
