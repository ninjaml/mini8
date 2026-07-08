import os
from pathlib import Path


class Settings:
    """
    应用全局配置类。

    集中管理 CamphorEOS API 的所有路径、目录和外部服务配置。
    包括项目根目录、运行时目录、数据库路径、提示词模板目录、
    技能模板目录以及外部 API 和 Obsidian 相关配置。
    """

    APP_NAME = "CamphorEOS API"
    API_PREFIX = "/api"

    # --- 项目路径配置 ---
    BASE_DIR = Path(__file__).resolve().parents[2]          # backend/ 目录
    APP_DIR = Path(__file__).resolve().parents[1]           # app/ 目录
    PROJECT_ROOT = Path(__file__).resolve().parents[3]      # 项目根目录
    AGENT_TEMPLATES_DIR = APP_DIR / "agent_templates"
    AGENT_BASE_DIR = AGENT_TEMPLATES_DIR / "mini8_agent_base"
    MOSS_AGENT_TEMPLATE_DIR = AGENT_TEMPLATES_DIR / "moss"
    PERSONA_TEMPLATE_DIR = APP_DIR / "persona"

    # --- 用户主目录下的 CamphorEOS 工作目录 ---
    CamphorEOS_HOME_DIR = Path.home() / ".CamphorEOS"
    MOSS_WORK_DIR = CamphorEOS_HOME_DIR / "moss"
    AGENTS_WORK_DIR = CamphorEOS_HOME_DIR / "agents"
    PERSONA_DIR = CamphorEOS_HOME_DIR / "persona"

    # --- 提示词 / 技能模板目录 ---
    PROMPT_TEMPLATES_DIR = APP_DIR / "prompt_templates"
    MOSS_SKILL_TEMPLATE_DIR = AGENT_TEMPLATES_DIR / "moss" / "skills"

    # --- 数据与运行时目录 ---
    # 打包环境下可通过环境变量覆盖数据目录，避免写入临时目录
    _data_override = os.environ.get("CAMPHOR_DATA_DIR")
    if _data_override:
        DATA_DIR = Path(_data_override)
    else:
        DATA_DIR = PROJECT_ROOT / "data"
    RUNTIME_DIR = DATA_DIR / "runtime"
    RUNTIME_AGENTS_DIR = RUNTIME_DIR / "agents"
    RUNTIME_SESSIONS_DIR = RUNTIME_DIR / "sessions"
    RUNTIME_ENV_DIR = RUNTIME_DIR / "env"
    RUNTIME_MOSS_DIR = RUNTIME_AGENTS_DIR / "moss"

    # --- 数据库配置 ---
    DEFAULT_DB_PATH = DATA_DIR / "CamphorEOS.db"
    APP_DB_PATH = DEFAULT_DB_PATH
    DATABASE_URL = f"sqlite:///{APP_DB_PATH.as_posix()}"

    # --- 外部服务配置 ---
    AUTH_API_URL = "https://ep2048.cn/kabibala/dp/user/login"
    OBSIDIAN_LOCAL_REST_API_KEY = os.getenv("OBSIDIAN_LOCAL_REST_API_KEY")
    OBSIDIAN_LOCAL_REST_TIMEOUT = float(os.getenv("OBSIDIAN_LOCAL_REST_TIMEOUT", "8"))

    # --- R2R 团队知识图谱引擎配置 ---
    R2R_BASE_URL = os.getenv("R2R_BASE_URL", "http://103.120.91.105:8097/eos")
    R2R_LOGIN_URL = os.getenv("R2R_LOGIN_URL", "https://ep2048.cn/camphorEOS/")

    # --- AI 市场远程 API 配置 ---
    MARKET_API_BASE = "https://ep2048.cn/market"

    # --- OpenClaw Gateway 配置 ---
    OPENCLAW_GATEWAY_URL: str = os.getenv("OPENCLAW_GATEWAY_URL", "ws://127.0.0.1:18789")
    OPENCLAW_GATEWAY_TOKEN: str = os.getenv("OPENCLAW_GATEWAY_TOKEN", "cb89be6d97bee0483619836a1f78f1ff091a7fd7bbc55980")

    # --- Hermes Agent 外部服务配置 ---
    HERMES_API_BASE_URL = os.getenv("HERMES_API_BASE_URL", "http://127.0.0.1:8642")
    HERMES_API_KEY = os.getenv("HERMES_API_KEY", "")
    HERMES_HOME_DIR = Path.home() / ".hermes"
    HERMES_SKILLS_DIR = HERMES_HOME_DIR / "skills"
    HERMES_CRON_JOBS_PATH = HERMES_HOME_DIR / "cron" / "jobs.json"
    HERMES_CONFIG_PATH = HERMES_HOME_DIR / "config.yaml"


# 全局 Settings 单例，供整个应用使用
settings = Settings()


