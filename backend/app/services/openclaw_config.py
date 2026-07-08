import logging
from typing import Dict

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.openclaw_config import OpenClawConfig

logger = logging.getLogger(__name__)

# 内存缓存：避免每次请求都查数据库。
_openclaw_config_cache: Dict[str, str] = {}

# 当前正式支持的 OpenClaw 连接类 key。
# 与 Hermes 保持一致：这里既承载默认值/说明，也作为 API 层白名单来源。
SUPPORTED_OPENCLAW_CONFIG_KEYS = {
    "gateway_url": {
        "value": settings.OPENCLAW_GATEWAY_URL,
        "description": "OpenClaw Gateway WebSocket 地址，如 ws://127.0.0.1:18789",
    },
    "gateway_token": {
        "value": settings.OPENCLAW_GATEWAY_TOKEN,
        "description": "OpenClaw Gateway 认证 Token",
    },
}


def is_supported_openclaw_config_key(key: str) -> bool:
    """判断 key 是否属于当前正式支持的 OpenClaw 连接配置。"""
    return key in SUPPORTED_OPENCLAW_CONFIG_KEYS


def refresh_openclaw_config_cache(db: Session):
    """从数据库刷新 OpenClaw 配置缓存。

    当前会主动过滤：
    - 只把 ``SUPPORTED_OPENCLAW_CONFIG_KEYS`` 中的记录放进缓存
    - 数据库里若存在其他 key，不进入运行时缓存
    """
    global _openclaw_config_cache
    configs = (
        db.query(OpenClawConfig)
        .filter(OpenClawConfig.key.in_(SUPPORTED_OPENCLAW_CONFIG_KEYS))
        .all()
    )
    _openclaw_config_cache = {cfg.key: cfg.value for cfg in configs}


def get_openclaw_config_value(db: Session, key: str) -> str | None:
    """从缓存/数据库获取单个配置值。"""
    if not is_supported_openclaw_config_key(key):
        return None
    if key in _openclaw_config_cache:
        return _openclaw_config_cache[key]
    cfg = db.query(OpenClawConfig).filter(OpenClawConfig.key == key).first()
    if cfg:
        _openclaw_config_cache[key] = cfg.value
        return cfg.value
    return None


def get_openclaw_gateway_url(db: Session) -> str:
    """获取 Gateway URL；若数据库未配置则返回 config.py 默认值。"""
    url = get_openclaw_config_value(db, "gateway_url")
    return url.strip() if url else settings.OPENCLAW_GATEWAY_URL


def get_openclaw_gateway_token(db: Session) -> str:
    """获取 Gateway Token；若数据库未配置则返回 config.py 默认值。"""
    token = get_openclaw_config_value(db, "gateway_token")
    return token if token else settings.OPENCLAW_GATEWAY_TOKEN


def initialize_openclaw_config_cache(db: Session) -> None:
    """初始化 OpenClaw 配置缓存。

    真实策略：
    - 不自动向数据库补写默认值
    - 连接类配置仍由用户在前端手动配置
    - 无论配置表是否为空，都在函数内部完成一次缓存刷新
    """
    count = db.query(OpenClawConfig).count()
    if count == 0:
        logger.info("OpenClaw config table is empty, waiting for user configuration")
    refresh_openclaw_config_cache(db)
