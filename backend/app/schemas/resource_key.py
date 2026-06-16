"""
资源密钥（ResourceKey）相关的 Pydantic 模式定义。

本模块定义了资源密钥的创建与读取等数据模型，
用于 API 请求/响应的校验与序列化。
"""

from pydantic import BaseModel


class ResourceKeyCreate(BaseModel):
    """资源密钥创建请求模型。

    Attributes:
        key: 密钥字符串（必填）。
        resource_type: 资源类型（必填）。
        resource_identity: 资源唯一标识（必填）。
    """

    key: str
    resource_type: str
    resource_identity: str


class ResourceKeyRead(BaseModel):
    """资源密钥读取响应模型。

    Attributes:
        id: 资源密钥唯一标识。
        key: 密钥字符串。
        resource_type: 资源类型。
        resource_identity: 资源唯一标识。
    """

    id: int
    key: str | None = None
    resource_type: str | None = None
    resource_identity: str | None = None

    model_config = {"from_attributes": True}
