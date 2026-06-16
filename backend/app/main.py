from contextlib import asynccontextmanager
import sys
import io
from pathlib import Path

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


"""
CamphorEOS 后端主入口。

负责：
1. 强制 UTF-8 编码（兼容 Windows GBK 终端）。
2. 把 vendor 目录加入 sys.path，使内嵌的 deepagents_webapi 可被导入。
3. FastAPI 应用工厂与 lifespan 管理（数据库初始化、运行时目录创建、session manager 生命周期）。
4. 路由挂载（业务路由 + deepagents_webapi 自带路由）。
"""

# 强制设置 UTF-8 编码，避免 Windows GBK 编码问题
# 注意：PyInstaller --noconsole 模式下 sys.stdout 为 None，需跳过
if sys.platform == "win32" and sys.stdout is not None:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

VENDOR_DIR = Path(__file__).resolve().parents[1] / "vendor"
if str(VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(VENDOR_DIR))

from deepagents_webapi.api.routes.agents import router as agents_router
from deepagents_webapi.api.routes.chat import router as chat_router
from deepagents_webapi.api.routes.chat import set_session_manager as set_chat_session_manager
from deepagents_webapi.api.routes.cron import router as cron_router
from deepagents_webapi.api.routes.cron import (
    set_cron_engine as set_cron_engine_router,
    set_cron_store as set_cron_store_router,
    set_session_manager as set_cron_session_manager,
)
from deepagents_webapi.api.routes.env import router as env_router
from deepagents_webapi.api.routes.sessions import router as sessions_router
from deepagents_webapi.api.routes.speech import router as speech_router
from deepagents_webapi.api.routes.sessions import set_session_manager as set_sessions_session_manager
from deepagents_webapi.scheduler.engine import CronEngine
from deepagents_webapi.scheduler.store import CronJobStore
from deepagents_webapi.session.session_manager import AsyncSessionManager

from app.api import agent_settings, auth, config_export, resource_keys, runtime_bridge, work_items, work_knowledge, workspace_agents, workspaces
from app.api import hermes as hermes_router
from app.api import hermes_config as hermes_config_router
from app.api import openclaw as openclaw_router
from app.api import openclaw_config as openclaw_config_router
from app.core.config import settings
from app.core.database import Base, build_engine, engine
from app.models import *  # noqa: F401,F403


def create_app(database_url: str | None = None) -> FastAPI:
    """
    FastAPI 应用工厂。

    参数:
        database_url: 可选数据库连接字符串；None 时使用默认引擎。

    返回:
        配置完毕的 FastAPI 应用实例。
    """
    app_engine = engine if database_url is None else build_engine(database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """
        应用生命周期管理器。

        启动时：
        - 初始化数据库表结构。
        - 创建运行时目录。
        - 初始化 MOSS 默认模板。
        - 启动并注入 AsyncSessionManager。

        关闭时：
        - 优雅关闭 session manager。
        """
        app.state.engine = app_engine
        settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_AGENTS_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_ENV_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_MOSS_DIR.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(bind=app.state.engine)
        _ensure_default_hermes_config(app.state.engine)
        _ensure_default_openclaw_config(app.state.engine)
        _ensure_default_moss_scaffold()

        session_manager = await AsyncSessionManager.create()
        app.state.runtime_session_manager = session_manager
        set_sessions_session_manager(session_manager)
        set_chat_session_manager(session_manager)

        # NEW: Cron scheduler
        cron_store = CronJobStore(db_path=session_manager.db_path)
        await cron_store.init()
        cron_engine = CronEngine(store=cron_store, session_manager=session_manager)
        await cron_engine.start()
        app.state.cron_engine = cron_engine
        set_cron_store_router(cron_store)
        set_cron_engine_router(cron_engine)
        set_cron_session_manager(session_manager)

        yield

        # NEW: shutdown cron engine
        cron_engine.shutdown()
        await session_manager.close()

    app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)
    app.state.engine = app_engine

    # 生产模式下若存在前端静态文件，放宽 CORS 或直接使用同域
    frontend_dist = os.environ.get("CAMPHOR_FRONTEND_DIST")
    # 显式列出所有可能的来源（wildcard + credentials 被浏览器禁止）
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:2048",
            "http://127.0.0.1:2049",
            "http://127.0.0.1:2050",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        """健康检查端点。"""
        return {"status": "ok"}

    app.include_router(auth.router, prefix=settings.API_PREFIX)
    app.include_router(workspaces.router, prefix=settings.API_PREFIX)
    app.include_router(workspace_agents.router, prefix=settings.API_PREFIX)
    app.include_router(work_items.router, prefix=settings.API_PREFIX)
    app.include_router(work_knowledge.router, prefix=settings.API_PREFIX)
    app.include_router(work_knowledge.knowledge_router, prefix=settings.API_PREFIX)
    app.include_router(resource_keys.router, prefix=settings.API_PREFIX)
    app.include_router(runtime_bridge.router, prefix=settings.API_PREFIX)
    app.include_router(config_export.router, prefix=settings.API_PREFIX)
    app.include_router(agent_settings.router, prefix=settings.API_PREFIX)
    app.include_router(hermes_router.router, prefix=settings.API_PREFIX)
    app.include_router(hermes_config_router.router, prefix=settings.API_PREFIX)
    app.include_router(openclaw_router.router, prefix=settings.API_PREFIX)
    app.include_router(openclaw_config_router.router, prefix=settings.API_PREFIX)
    # deepagents_webapi 的路由路径已经自带 /api 前缀，这里直接挂载。
    app.include_router(sessions_router)
    app.include_router(chat_router)
    app.include_router(cron_router)
    app.include_router(env_router)
    app.include_router(agents_router)
    app.include_router(speech_router)

    # 若配置了前端静态文件目录，托管为 SPA
    if frontend_dist and Path(frontend_dist).exists():
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")

    return app


def _ensure_default_hermes_config(engine) -> None:
    """启动时若 hermes_config 表为空，自动写入 config.py 中的默认值；
    无论表是否为空，都刷新内存缓存，确保后端使用数据库中的最新配置。"""
    from sqlalchemy.orm import sessionmaker
    from app.services import hermes_config as hc_service
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        hc_service.ensure_default_hermes_config(db)
        # 总是刷新缓存：用户可能通过前端修改过配置，重启后必须重新加载
        hc_service._refresh_cache(db)
    finally:
        db.close()


def _ensure_default_openclaw_config(engine) -> None:
    """启动时若 openclaw_config 表为空，不自动写入默认值；
    连接类配置由用户在前端手动配置。"""
    from sqlalchemy.orm import sessionmaker
    from app.services import openclaw_config as oc_service
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        oc_service.ensure_default_openclaw_config(db)
        oc_service._refresh_cache(db)
    finally:
        db.close()


def _ensure_default_moss_scaffold() -> None:
    """初始化默认的 MOSS 运行时目录与基础模板。"""
    runtime_bridge._ensure_agent_scaffold(
        agent_dir=settings.RUNTIME_MOSS_DIR,
        identity_template=runtime_bridge._read_prompt_template(
            settings.MOSS_PROMPT_TEMPLATE_DIR, "default_identity.md"
        ),
        agent_template=runtime_bridge._read_prompt_template(
            settings.MOSS_PROMPT_TEMPLATE_DIR, "default_agent.md"
        ),
        tools_template=runtime_bridge._read_prompt_template(
            settings.MOSS_PROMPT_TEMPLATE_DIR, "default_tools.md"
        ),
        skill_template_dir=[
            settings.MOSS_SKILL_TEMPLATE_DIR,
            settings.OBSIDIAN_TOOLS_SKILL_TEMPLATE_DIR,
        ],
    )


app = create_app()
