from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.openclaw_config import OpenClawConfig
from app.schemas.openclaw_config import OpenClawConfigCreate, OpenClawConfigRead, OpenClawConfigUpdate
from app.services import openclaw_config as oc_service

router = APIRouter(prefix="/openclaw-configs", tags=["OpenClaw配置"])


@router.get("", response_model=list[OpenClawConfigRead])
def list_openclaw_configs(db: Session = Depends(get_db)):
    """获取所有 OpenClaw 配置。"""
    return db.query(OpenClawConfig).all()


@router.get("/{config_key}", response_model=OpenClawConfigRead)
def get_openclaw_config(config_key: str, db: Session = Depends(get_db)):
    """根据 key 获取单条配置。"""
    cfg = db.query(OpenClawConfig).filter(OpenClawConfig.key == config_key).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    return cfg


@router.post("", response_model=OpenClawConfigRead)
def create_openclaw_config(payload: OpenClawConfigCreate, db: Session = Depends(get_db)):
    """新增配置；若 key 已存在则自动覆盖（upsert）。"""
    existing = db.query(OpenClawConfig).filter(OpenClawConfig.key == payload.key).first()
    if existing:
        existing.value = payload.value
        if payload.description is not None:
            existing.description = payload.description
        db.commit()
        db.refresh(existing)
        oc_service._refresh_cache(db)
        return existing

    cfg = OpenClawConfig(
        key=payload.key,
        value=payload.value,
        description=payload.description,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    oc_service._refresh_cache(db)
    return cfg


@router.put("/{config_id}", response_model=OpenClawConfigRead)
def update_openclaw_config(config_id: int, payload: OpenClawConfigUpdate, db: Session = Depends(get_db)):
    """按 id 更新配置值。"""
    cfg = db.query(OpenClawConfig).filter(OpenClawConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    cfg.value = payload.value
    if payload.description is not None:
        cfg.description = payload.description
    db.commit()
    db.refresh(cfg)
    oc_service._refresh_cache(db)
    return cfg


@router.delete("/{config_id}")
def delete_openclaw_config(config_id: int, db: Session = Depends(get_db)):
    """按 id 删除配置。"""
    cfg = db.query(OpenClawConfig).filter(OpenClawConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(cfg)
    db.commit()
    oc_service._refresh_cache(db)
    return {"message": "已删除"}
