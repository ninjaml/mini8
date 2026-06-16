"""
系统全局配置（SystemSetting）的数据访问层。

以 key-value 形式存取系统级配置项。
"""

from sqlalchemy.orm import Session

from app.models import SystemSetting


def get_system_setting(db: Session, key: str) -> SystemSetting | None:
    """根据 key 获取单个配置项。"""
    return db.query(SystemSetting).filter(SystemSetting.key == key).first()


def set_system_setting(db: Session, key: str, value: str | None) -> SystemSetting:
    """设置（新增或更新）单个配置项。"""
    item = get_system_setting(db, key)
    if item:
        item.value = value
    else:
        item = SystemSetting(key=key, value=value)
        db.add(item)
    db.commit()
    db.refresh(item)
    return item
