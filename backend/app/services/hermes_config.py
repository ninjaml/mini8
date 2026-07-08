import logging
from typing import Dict

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.hermes_config import HermesConfig

logger = logging.getLogger(__name__)

# 内存缓存：避免每次请求都查数据库。
_hermes_config_cache: Dict[str, str] = {}

# 当前正式支持的 Hermes 连接类 key。
# 这里既承载默认值/说明，也被 API 层当作白名单使用。
SUPPORTED_HERMES_CONFIG_KEYS = {
    "api_base_url": {
        "value": settings.HERMES_API_BASE_URL,
        "description": "Hermes API 网关地址，如 http://127.0.0.1:8642",
    },
    "api_key": {
        "value": settings.HERMES_API_KEY,
        "description": "Hermes API 认证密钥（Bearer Token）",
    },
    "dashboard_url": {
        "value": "http://127.0.0.1:9119",
        "description": "Hermes Dashboard 地址，如 http://127.0.0.1:9119",
    },
}

LEGACY_HERMES_CONFIG_KEYS = {
    "home_dir",
    "skills_dir",
    "cron_jobs_path",
    "config_path",
}


def is_supported_hermes_config_key(key: str) -> bool:
    """判断 key 是否属于当前正式支持的 Hermes 连接配置。"""
    return key in SUPPORTED_HERMES_CONFIG_KEYS


def _refresh_cache(db: Session):
    """从数据库刷新 Hermes 配置缓存。

    注意这里会主动过滤：
    - 只把 ``SUPPORTED_HERMES_CONFIG_KEYS`` 中的记录放进缓存
    - legacy key 即使数据库里还在，也不会进入运行时缓存
    """
    global _hermes_config_cache
    configs = (
        db.query(HermesConfig)
        .filter(HermesConfig.key.in_(SUPPORTED_HERMES_CONFIG_KEYS))
        .all()
    )
    _hermes_config_cache = {cfg.key: cfg.value for cfg in configs}


def get_hermes_config_value(db: Session, key: str) -> str | None:
    """从缓存/数据库获取单个配置值。

    若 key 不在正式支持列表内，直接返回 None。
    """
    if not is_supported_hermes_config_key(key):
        return None
    if key in _hermes_config_cache:
        return _hermes_config_cache[key]
    cfg = (
        db.query(HermesConfig)
        .filter(HermesConfig.key == key)
        .first()
    )
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
    """刷新 Hermes 配置缓存。

    当前不会自动向数据库补写默认值；
    默认值的“存在感”主要体现在读取时的 settings 回退。
    """
    _refresh_cache(db)


def cleanup_legacy_hermes_config_keys(db: Session) -> int:
    """删除 Hermes 旧路径类配置，并刷新正式配置缓存。

    这些 legacy key 代表旧的本地路径语义：
    - home_dir
    - skills_dir
    - cron_jobs_path
    - config_path

    当前主链路不会再读取或暴露它们。
    """
    deleted = (
        db.query(HermesConfig)
        .filter(HermesConfig.key.in_(LEGACY_HERMES_CONFIG_KEYS))
        .delete(synchronize_session=False)
    )
    db.commit()
    if deleted:
        logger.info("Removed %s legacy Hermes config rows", deleted)
    _refresh_cache(db)
    return deleted
