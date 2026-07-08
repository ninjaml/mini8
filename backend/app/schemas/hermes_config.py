"""Hermes 全局连接配置的请求/响应模型。

这层 schema 对应 ``hermes_config`` 表中的配置记录，
服务的是 Hermes 外部集成，不是普通 Agent 的运行时模型配置。

从 ``api/integrations.py``、``models/hermes_config.py``、
``services/hermes_config.py`` 和 ``services/hermes.py`` 的调用链可以确认：
- 当前正式支持的 key 只有 ``api_base_url``、``api_key``、``dashboard_url``。
- 接口层会拒绝不在白名单内的 key。
- ``api_key`` 这类敏感值当前也是直接保存在 ``value`` 字段里。
- create 接口是 upsert 风格：同 key 已存在时会直接覆盖更新。
"""

from pydantic import BaseModel


class HermesConfigCreate(BaseModel):
    """创建或幂等写入 Hermes 配置的请求体。

    使用方：
    - ``POST /hermes-configs``

    注意：
    - 虽然名字叫 create，但当前接口实现里若同 key 已存在，会直接更新旧记录。
    - ``key`` 不是任意字符串，必须属于支持列表。
    """
    # 配置键名。
    # 当前只支持：api_base_url、api_key、dashboard_url。
    key: str
    # 配置值正文。
    # 可能是 URL，也可能是敏感的 Bearer Token。
    value: str
    # 配置项说明文字，供前端配置界面展示。
    description: str | None = None


class HermesConfigUpdate(BaseModel):
    """更新 Hermes 配置的请求体。

    使用方：
    - ``PUT /hermes-configs/{config_id}``

    当前只允许修改现有记录的值和说明，不允许通过这个接口改 key。
    """
    # 新的配置值正文。
    value: str
    # 新的配置说明；若为 None，当前实现会保留旧 description。
    description: str | None = None


class HermesConfigRead(BaseModel):
    """Hermes 配置记录的读取模型。

    使用方：
    - ``GET /hermes-configs``
    - ``GET /hermes-configs/{config_key}``
    - 配置创建/更新后的返回体

    这是数据库中的单条配置真相，不直接代表 Hermes 服务是否可联通。
    可用性还需要结合 health / agent 等 Hermes 接口判断。
    """
    # hermes_config 表主键。
    id: int
    # 配置键名。
    key: str
    # 配置值正文。
    # 对 ``api_key`` 来说，这里当前会直接返回密钥明文。
    value: str
    # 配置项说明文字。
    description: str | None = None

    class Config:
        from_attributes = True
