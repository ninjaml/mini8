"""MOSS 配置的数据访问层。"""

from sqlalchemy.orm import Session

from app.models import MossConfig


def get_moss_config(db: Session, key: str) -> MossConfig | None:
    """根据 key 获取单个配置项。"""
    return db.query(MossConfig).filter(MossConfig.key == key).first()


def set_moss_config(db: Session, key: str, value: str | None) -> MossConfig:
    """设置（新增或更新）单个配置项。"""
    item = get_moss_config(db, key)
    if item:
        item.value = value
    else:
        item = MossConfig(key=key, value=value)
        db.add(item)
    db.commit()
    db.refresh(item)
    return item
