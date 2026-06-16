import logging
from typing import Dict

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.hermes_config import HermesConfig

logger = logging.getLogger(__name__)

# 内存缓存：避免每次请求都查数据库
_hermes_config_cache: Dict[str, str] = {}

DEFAULT_CONFIGS = {
    "api_base_url": {
        "value": settings.HERMES_API_BASE_URL,
        "description": "Hermes API 网关地址，如 http://127.0.0.1:8642",
    },
    "api_key": {
        "value": settings.HERMES_API_KEY,
        "description": "Hermes API 认证密钥（Bearer Token）",
    },
    "home_dir": {
        "value": str(settings.HERMES_HOME_DIR),
        "description": "Hermes 主目录，默认 ~/.hermes",
    },
    "skills_dir": {
        "value": str(settings.HERMES_SKILLS_DIR),
        "description": "技能存放目录，默认 ~/.hermes/skills",
    },
    "cron_jobs_path": {
        "value": str(settings.HERMES_CRON_JOBS_PATH),
        "description": "定时任务文件路径，默认 ~/.hermes/cron/jobs.json",
    },
    "config_path": {
        "value": str(settings.HERMES_CONFIG_PATH),
        "description": "Hermes 配置文件路径，默认 ~/.hermes/config.yaml",
    },
    "dashboard_url": {
        "value": "http://127.0.0.1:9119",
        "description": "Hermes Dashboard 地址，如 http://127.0.0.1:9119",
    },
}


def _refresh_cache(db: Session):
    """从数据库刷新缓存。"""
    global _hermes_config_cache
    configs = db.query(HermesConfig).all()
    _hermes_config_cache = {cfg.key: cfg.value for cfg in configs}


def get_hermes_config_value(db: Session, key: str) -> str | None:
    """从缓存/数据库获取单个配置值。"""
    if key in _hermes_config_cache:
        return _hermes_config_cache[key]
    cfg = db.query(HermesConfig).filter(HermesConfig.key == key).first()
    if cfg:
        _hermes_config_cache[key] = cfg.value
        return cfg.value
    return None


def get_hermes_api_base_url(db: Session) -> str:
    """获取 Hermes API 地址；若数据库未配置则返回 config.py 默认值。"""
    url = get_hermes_config_value(db, "api_base_url")
    return url.strip() if url else settings.HERMES_API_BASE_URL


def get_hermes_api_key(db: Session) -> str:
    """获取 Hermes API 密钥；若数据库未配置则返回 config.py 默认值。"""
    key = get_hermes_config_value(db, "api_key")
    return key if key else settings.HERMES_API_KEY


def ensure_default_hermes_config(db: Session):
    """启动时自动检查：若 hermes_config 表为空，只写入路径类默认值；
    连接类配置（api_base_url, api_key, dashboard_url）不自动写入，
    由用户在前端手动配置。"""
    count = db.query(HermesConfig).count()
    if count == 0:
        for key, meta in DEFAULT_CONFIGS.items():
            if key in {"api_base_url", "api_key", "dashboard_url"}:
                continue
            cfg = HermesConfig(
                key=key,
                value=meta["value"],
                description=meta["description"],
            )
            db.add(cfg)
        db.commit()
        logger.info("Initialized default Hermes path configs in database")
        _refresh_cache(db)
