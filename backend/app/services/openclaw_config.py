import logging
from typing import Dict

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.openclaw_config import OpenClawConfig

logger = logging.getLogger(__name__)

# 内存缓存：避免每次请求都查数据库
_openclaw_config_cache: Dict[str, str] = {}

DEFAULT_CONFIGS = {
    "gateway_url": {
        "value": settings.OPENCLAW_GATEWAY_URL,
        "description": "OpenClaw Gateway WebSocket 地址，如 ws://127.0.0.1:18789",
    },
    "gateway_token": {
        "value": settings.OPENCLAW_GATEWAY_TOKEN,
        "description": "OpenClaw Gateway 认证 Token",
    },
}


def _refresh_cache(db: Session):
    """从数据库刷新缓存。"""
    global _openclaw_config_cache
    configs = db.query(OpenClawConfig).all()
    _openclaw_config_cache = {cfg.key: cfg.value for cfg in configs}


def get_openclaw_config_value(db: Session, key: str) -> str | None:
    """从缓存/数据库获取单个配置值。"""
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


def ensure_default_openclaw_config(db: Session):
    """启动时自动检查：若 openclaw_config 表为空，不写入任何默认值；
    连接类配置（gateway_url, gateway_token）由用户在前端手动配置。"""
    count = db.query(OpenClawConfig).count()
    if count == 0:
        logger.info("OpenClaw config table is empty, waiting for user configuration")
        _refresh_cache(db)
