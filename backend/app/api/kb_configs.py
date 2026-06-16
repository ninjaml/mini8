from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.kb_config import KBConfig
from app.schemas.kb_config import KBConfigCreate, KBConfigRead, KBConfigUpdate
from app.services import enterprise_knowledge as ek_service

router = APIRouter(prefix="/kb-configs", tags=["知识库配置"])


@router.get("", response_model=list[KBConfigRead])
def list_kb_configs(db: Session = Depends(get_db)):
    """获取所有知识库配置。"""
    return db.query(KBConfig).all()


@router.get("/{config_key}", response_model=KBConfigRead)
def get_kb_config(config_key: str, db: Session = Depends(get_db)):
    """根据 key 获取单条配置。"""
    cfg = db.query(KBConfig).filter(KBConfig.key == config_key).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    return cfg


@router.post("", response_model=KBConfigRead)
def create_kb_config(payload: KBConfigCreate, db: Session = Depends(get_db)):
    """新增配置；若 key 已存在则自动覆盖（upsert）。"""
    existing = db.query(KBConfig).filter(KBConfig.key == payload.key).first()
    if existing:
        existing.value = payload.value
        existing.description = payload.description
        db.commit()
        db.refresh(existing)
        if payload.key == "r2r_base_url":
            ek_service.set_r2r_base_url(payload.value)
        return existing

    cfg = KBConfig(
        key=payload.key,
        value=payload.value,
        description=payload.description,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    if payload.key == "r2r_base_url":
        ek_service.set_r2r_base_url(payload.value)
    return cfg


@router.put("/{config_id}", response_model=KBConfigRead)
def update_kb_config(config_id: int, payload: KBConfigUpdate, db: Session = Depends(get_db)):
    """按 id 更新配置值。"""
    cfg = db.query(KBConfig).filter(KBConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    cfg.value = payload.value
    if payload.description is not None:
        cfg.description = payload.description
    db.commit()
    db.refresh(cfg)
    if cfg.key == "r2r_base_url":
        ek_service.set_r2r_base_url(payload.value)
    return cfg


@router.delete("/{config_id}")
def delete_kb_config(config_id: int, db: Session = Depends(get_db)):
    """按 id 删除配置。"""
    cfg = db.query(KBConfig).filter(KBConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(cfg)
    db.commit()
    return {"message": "已删除"}


def get_r2r_base_url(db: Session) -> str | None:
    """
    只从数据库读取 r2r_base_url；若不存在或为空则返回 None。
    供 enterprise_knowledge.py 等业务模块调用。
    """
    cfg = db.query(KBConfig).filter(KBConfig.key == "r2r_base_url").first()
    if cfg and cfg.value:
        return cfg.value.strip()
    return None


def get_r2r_login_url(db: Session) -> str | None:
    """只从数据库读取 r2r_login_url；若不存在或为空则返回 None。"""
    cfg = db.query(KBConfig).filter(KBConfig.key == "r2r_login_url").first()
    if cfg and cfg.value:
        return cfg.value.strip()
    return None


def ensure_default_kb_config(db: Session):
    """
    启动时自动检查默认知识库配置，缺哪条就补哪条。
    """
    from app.core.config import settings

    defaults = [
        ("r2r_base_url", settings.R2R_BASE_URL, "R2R 团队知识图谱引擎连接地址"),
        ("r2r_login_url", settings.R2R_LOGIN_URL, "R2R 团队知识图谱登录地址"),
    ]

    created = False
    for key, value, description in defaults:
        existing = db.query(KBConfig).filter(KBConfig.key == key).first()
        if existing:
            continue
        db.add(KBConfig(key=key, value=value, description=description))
        created = True

    if created:
        db.commit()

def is_kb_connected(db: Session) -> bool:
    """检查知识库是否已配置（数据库中有 r2r_base_url 且非空）。"""
    cfg = db.query(KBConfig).filter(KBConfig.key == "r2r_base_url").first()
    return bool(cfg and cfg.value and cfg.value.strip())
