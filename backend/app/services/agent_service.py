"""Agent 生命周期服务。

这层服务承接的是 Agent 领域里最靠近“创建/绑定流程”的核心业务动作：
- 创建 Agent 主记录后，立即准备运行时目录与 default session
- 把现有 Agent 加入 workspace 时，立即补齐稳定 workspace session

它不负责：
- 决定 persona 内容
- 解析最终运行时规格
- 直接处理 HTTP 请求/响应
"""

from pathlib import Path
import shutil
import json

from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories.agent import create_agent, get_agent
from app.repositories.agent_session import create_default_agent_session, create_workspace_agent_session
from app.repositories.agent_subagent_binding import list_subagent_bindings_by_parent_agent_id
from app.repositories.agent_workspace_binding import bind_agent_to_workspace
from app.services.session_runtime_service import (
    build_agent_default_thread_id,
    build_agent_runtime_name,
    build_agent_workspace_thread_id,
    resolve_agent_base_dir,
)
from deepagents_webapi.session.env_manager import EnvManager


def _copy_missing_tree(source_dir: Path, target_dir: Path) -> None:
    """把模板目录里缺失的文件补到目标目录，但不覆盖现有内容。

    真实用途：
    - 当基础模板新增了文件时，给已存在的 Agent runtime 目录“补骨架”
    - 避免覆盖用户已经在 runtime 目录里改过的 prompt / skills / 配置
    """
    for source_path in source_dir.rglob("*"):
        relative_path = source_path.relative_to(source_dir)
        target_path = target_dir / relative_path
        if source_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if not target_path.exists():
            shutil.copy2(source_path, target_path)


def _ensure_default_model_config(target_dir: Path) -> None:
    """确保运行时目录里存在 ``model_config.json``。

    当前策略是“缺了就补，已有就不动”，
    因此它只负责初始化默认模型配置，不负责回写或升级用户配置。
    """
    model_config_path = target_dir / "model_config.json"
    if model_config_path.exists():
        return
    env_manager = EnvManager()
    model_config_path.write_text(
        json.dumps(env_manager.get_default_model_config(), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def ensure_agent_base_dir(agent_id: int) -> Path:
    """确保某个 Agent 的基础 runtime 目录存在。

    调用链：
    - Agent 创建时调用
    - 团队视图读取基础资源时也会调用
    - runtime bridge 读取普通 Agent 运行态时也会调用

    真实行为分两种：
    - 目录不存在：整棵复制 ``settings.AGENT_BASE_DIR`` 作为初始 runtime 副本
    - 目录已存在：只补缺失文件，不覆盖用户已有改动
    """
    target_dir = resolve_agent_base_dir(agent_id)
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    if not target_dir.exists():
        shutil.copytree(settings.AGENT_BASE_DIR, target_dir)
        _ensure_default_model_config(target_dir)
        return target_dir

    _copy_missing_tree(settings.AGENT_BASE_DIR, target_dir)
    _ensure_default_model_config(target_dir)
    return target_dir


def _derive_initial_subagent_mode(db: Session, *, agent_id: int) -> str | None:
    """按当前是否已经存在显式 child roster 推导新 session 的初始 mode。

    这里不使用固定 schema 默认值，而是按“这个 parent agent 现在是否已经有团队”
    来决定：
    - 没有显式 child bindings -> ``null``
    - 已有显式 child bindings -> ``collaborator``
    """
    bindings = list_subagent_bindings_by_parent_agent_id(db, agent_id)
    return "collaborator" if bindings else None


def create_agent_with_default_session(
    db: Session,
    *,
    user_id: str | None,
    name: str,
    type: str | None,
    agent_json: str | None,
    default_working_dir: str | None = None,
    display_name: str | None = None,
):
    """创建 Agent 主记录，并立刻生成 default session。

    这是“普通 Agent 出生流程”的核心入口。

    顺序很重要：
    1. 先持久化 Agent 主记录，拿到稳定 ``agent.id``
    2. 再确保 runtime 目录存在（目录名依赖 ``agent.id``）
    3. 再创建 default session（thread_id 同样依赖 ``agent.id``）
    """
    agent = create_agent(
        db,
        user_id=user_id,
        name=name,
        type=type,
        agent_json=agent_json,
        default_working_dir=default_working_dir,
    )
    ensure_agent_base_dir(agent.id)
    session = create_default_agent_session(
        db,
        agent_id=agent.id,
        thread_id=build_agent_default_thread_id(agent.id),
        persona_name=None,
        display_name=display_name or agent.name,
        # default session 一出生就写入正确的初始 mode，避免后续再靠运行时猜。
        subagent_mode=_derive_initial_subagent_mode(db, agent_id=agent.id),
    )
    return agent, session


def bind_agent_into_workspace_session(
    db: Session,
    *,
    agent_id: int,
    workspace_id: int,
):
    """把一个既有 Agent 绑定进某个 workspace，并创建稳定 workspace session。

    这里固定只做两件事：
    - 建立 agent <-> workspace 绑定关系
    - 创建 persona_name = null 的稳定 workspace session

    不在绑定阶段决定 persona，也不在这里接受外部覆盖 display_name。
    """
    # 绑定关系与 workspace session 是两层真相：
    # - agent_workspace_binding 表达“成员属于这个 workspace”
    # - agent_session 表达“这个成员在该 workspace 下如何稳定运行”
    bind_agent_to_workspace(db, agent_id, workspace_id)
    # workspace session 的初始展示名直接跟随 Agent 当前名称；
    # 后续若用户在 workspace 内单独修改，再落到 session 层。
    core_agent = get_agent(db, agent_id)
    session = create_workspace_agent_session(
        db,
        agent_id=agent_id,
        workspace_id=workspace_id,
        thread_id=build_agent_workspace_thread_id(agent_id, workspace_id),
        persona_name=None,
        display_name=(core_agent.name if core_agent is not None else build_agent_runtime_name(agent_id)),
        # workspace session 的初始 mode 也遵守同一条 roster 派生规则，
        # 不能因为是后创建的 session 就无条件落成 null。
        subagent_mode=_derive_initial_subagent_mode(db, agent_id=agent_id),
    )
    return session
