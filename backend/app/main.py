from contextlib import asynccontextmanager
import sys
import io
import mimetypes
from pathlib import Path
import os

from fastapi import FastAPI

# Windows 注册表可能把 .js 映射成 application/x-js，导致浏览器拒绝加载 module script
# 强制覆盖为标准的 MIME 类型，保证前端静态文件能被正确加载
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/wasm", ".wasm")

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


"""
CamphorEOS 后端主入口。

负责：
1. 强制 UTF-8 编码（兼容 Windows GBK 终端）。
2. 把 vendor 目录加入 sys.path，使内嵌的 deepagents_webapi 可被导入。
3. FastAPI 应用工厂与 lifespan 管理（主数据库初始化、运行时目录创建、session manager 生命周期）。
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
from app.repositories.cron_job import CronJobStore
from deepagents_webapi.scheduler.engine import CronEngine
from deepagents_webapi.session.session_manager import AsyncSessionManager

from app.api import agents, auth, config_export, integrations, knowledge, market_proxy, runtime_bridge, workspace_messages, workspaces
from app.core.config import settings
from app.core.database import Base, engine
from app.models import *  # noqa: F401,F403


def create_app() -> FastAPI:
    """
    FastAPI 应用工厂。

    返回:
        配置完毕的 FastAPI 应用实例。
    """
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
        app.state.engine = engine
        settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_AGENTS_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_ENV_DIR.mkdir(parents=True, exist_ok=True)
        settings.RUNTIME_MOSS_DIR.mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(bind=app.state.engine)
        _ensure_default_kb_config(app.state.engine)
        _ensure_default_hermes_config(app.state.engine)
        _initialize_openclaw_config(app.state.engine)
        _ensure_persona_directories(app.state.engine)
        _ensure_default_moss_scaffold()

        session_manager = await AsyncSessionManager.create()
        app.state.runtime_session_manager = session_manager
        set_sessions_session_manager(session_manager)
        set_chat_session_manager(session_manager)

        # 初始化 Cron 调度器，并把依赖注入到 deepagents 的路由层
        cron_store = CronJobStore(db_path=session_manager.db_path)
        await cron_store.init()
        cron_engine = CronEngine(store=cron_store, session_manager=session_manager)
        await cron_engine.start()
        app.state.cron_engine = cron_engine
        set_cron_store_router(cron_store)
        set_cron_engine_router(cron_engine)
        set_cron_session_manager(session_manager)

        yield

        # 关闭阶段优雅停止 Cron 引擎
        cron_engine.shutdown()
        await session_manager.close()

    app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)
    app.state.engine = engine

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
    app.include_router(workspace_messages.router, prefix=settings.API_PREFIX)
    app.include_router(agents.router, prefix=settings.API_PREFIX)
    app.include_router(agents.workspace_agents_router, prefix=settings.API_PREFIX)
    app.include_router(agents.agent_settings_router, prefix=settings.API_PREFIX)
    app.include_router(agents.agent_sessions_router, prefix=settings.API_PREFIX)
    app.include_router(knowledge.work_knowledge_router, prefix=settings.API_PREFIX)
    app.include_router(knowledge.knowledge_router, prefix=settings.API_PREFIX)
    app.include_router(runtime_bridge.router, prefix=settings.API_PREFIX)
    app.include_router(config_export.router, prefix=settings.API_PREFIX)
    app.include_router(knowledge.kb_configs_router, prefix=settings.API_PREFIX)
    app.include_router(knowledge.enterprise_knowledge_router, prefix=settings.API_PREFIX)
    app.include_router(market_proxy.router, prefix=settings.API_PREFIX)
    app.include_router(integrations.hermes_router, prefix=settings.API_PREFIX)
    app.include_router(integrations.hermes_config_router, prefix=settings.API_PREFIX)
    app.include_router(integrations.openclaw_router, prefix=settings.API_PREFIX)
    app.include_router(integrations.openclaw_config_router, prefix=settings.API_PREFIX)
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


def _ensure_default_kb_config(engine) -> None:
    """启动时若 kb_config 表为空，自动写入 config.py 中的默认值，并同步到 service 缓存。"""
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        knowledge.ensure_default_kb_config(db)
        # 同步到 service 层缓存
        url = knowledge.get_r2r_base_url(db)
        from app.services import enterprise_knowledge as ek_service
        ek_service.set_r2r_base_url(url)
    finally:
        db.close()


def _ensure_default_hermes_config(engine) -> None:
    """启动时刷新 Hermes 配置缓存，并清理 legacy 路径类配置。"""
    from sqlalchemy.orm import sessionmaker
    from app.services import hermes_config as hc_service
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        hc_service.cleanup_legacy_hermes_config_keys(db)
        hc_service.ensure_default_hermes_config(db)
    finally:
        db.close()


def _initialize_openclaw_config(engine) -> None:
    """启动时初始化 OpenClaw 配置缓存。

    OpenClaw 连接配置不会自动写回数据库；
    当前仍由用户在前端手动配置，启动阶段只负责刷新运行时缓存。
    """
    from sqlalchemy.orm import sessionmaker
    from app.services import openclaw_config as oc_service
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        oc_service.initialize_openclaw_config_cache(db)
    finally:
        db.close()


def _ensure_persona_directories(engine) -> None:
    """启动时校验基础注入层与 persona 路径资源。"""
    from sqlalchemy.orm import sessionmaker
    from app.services.persona_service import ensure_persona_directories

    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        ensure_persona_directories(db)
    finally:
        db.close()
        
def _ensure_default_moss_scaffold() -> None:
    """初始化默认的 MOSS 运行时目录与基础模板。"""
    runtime_bridge._ensure_moss_scaffold(
        moss_dir=settings.RUNTIME_MOSS_DIR,
        identity_template=runtime_bridge._read_prompt_template(
            settings.MOSS_AGENT_TEMPLATE_DIR, "default_identity.md"
        ),
        agent_template=runtime_bridge._read_prompt_template(
            settings.MOSS_AGENT_TEMPLATE_DIR, "default_agent.md"
        ),
        tools_template=runtime_bridge._read_prompt_template(
            settings.MOSS_AGENT_TEMPLATE_DIR, "default_tools.md"
        ),
        skill_template_dir=[
            settings.MOSS_SKILL_TEMPLATE_DIR,
        ],
    )


app = create_app()








