from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.hermes_config import HermesConfig
from app.schemas.hermes_config import HermesConfigCreate, HermesConfigRead, HermesConfigUpdate
from app.services import hermes_config as hc_service

router = APIRouter(prefix="/hermes-configs", tags=["Hermes配置"])


@router.get("", response_model=list[HermesConfigRead])
def list_hermes_configs(db: Session = Depends(get_db)):
    """获取所有 Hermes 配置。"""
    return db.query(HermesConfig).all()


@router.get("/{config_key}", response_model=HermesConfigRead)
def get_hermes_config(config_key: str, db: Session = Depends(get_db)):
    """根据 key 获取单条配置。"""
    cfg = db.query(HermesConfig).filter(HermesConfig.key == config_key).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    return cfg


@router.post("", response_model=HermesConfigRead)
def create_hermes_config(payload: HermesConfigCreate, db: Session = Depends(get_db)):
    """新增配置；若 key 已存在则自动覆盖（upsert）。
    description 为 None 时不覆盖已有描述，避免前端批量保存时抹掉自定义描述。"""
    existing = db.query(HermesConfig).filter(HermesConfig.key == payload.key).first()
    if existing:
        existing.value = payload.value
        if payload.description is not None:
            existing.description = payload.description
        db.commit()
        db.refresh(existing)
        hc_service._refresh_cache(db)
        return existing

    cfg = HermesConfig(
        key=payload.key,
        value=payload.value,
        description=payload.description,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    hc_service._refresh_cache(db)
    return cfg


@router.put("/{config_id}", response_model=HermesConfigRead)
def update_hermes_config(config_id: int, payload: HermesConfigUpdate, db: Session = Depends(get_db)):
    """按 id 更新配置值。"""
    cfg = db.query(HermesConfig).filter(HermesConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    cfg.value = payload.value
    if payload.description is not None:
        cfg.description = payload.description
    db.commit()
    db.refresh(cfg)
    hc_service._refresh_cache(db)
    return cfg


@router.delete("/{config_id}")
def delete_hermes_config(config_id: int, db: Session = Depends(get_db)):
    """按 id 删除配置。"""
    cfg = db.query(HermesConfig).filter(HermesConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    db.delete(cfg)
    db.commit()
    hc_service._refresh_cache(db)
    return {"message": "已删除"}
