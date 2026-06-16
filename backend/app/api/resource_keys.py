from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import ResourceKey
from app.repositories.resource_key import create_resource_key, list_resource_keys
from app.schemas.resource_key import ResourceKeyCreate, ResourceKeyRead


"""
资源密钥（Resource Key）接口模块。

ResourceKey 用于为工作空间、工作事项等资源生成全局唯一锚点，
供外部 Skill 或权限系统通过 key 快速定位目标资源。
"""

router = APIRouter(prefix="/resource-keys", tags=["resource_keys"])


@router.get("", response_model=list[ResourceKeyRead])
def read_resource_keys(db: Session = Depends(get_db)):
    """获取所有资源密钥列表。"""
    return list_resource_keys(db)


@router.post("", response_model=ResourceKeyRead)
def create_resource_key_endpoint(payload: ResourceKeyCreate, db: Session = Depends(get_db)):
    """
    创建新的资源密钥。

    参数:
        payload: 包含 key、resource_type 与 resource_identity。

    返回:
        创建后的 ResourceKey 记录。
    """
    return create_resource_key(
        db,
        ResourceKey(key=payload.key, resource_type=payload.resource_type, resource_identity=payload.resource_identity),
    )
