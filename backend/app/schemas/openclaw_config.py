"""OpenClaw 全局连接配置的请求/响应模型。

这层 schema 对应 ``openclaw_config`` 表中的配置记录，
服务的是 OpenClaw Gateway 集成。

从 ``api/integrations.py``、``models/openclaw_config.py``、
``services/openclaw_config.py`` 和 ``services/openclaw_gateway_client.py`` 的调用链可以确认：
- 当前已知稳定 key 主要是 ``gateway_url`` 和 ``gateway_token``。
- 当前 API / service 层同样会按支持列表校验 key，
  真正进入运行时缓存的也只有这两个已知连接类 key。
- ``value`` 既可能保存 Gateway WebSocket 地址，也可能直接保存认证 Token。
- create 接口同样是 upsert 风格：同 key 已存在时会直接覆盖更新。
"""

from pydantic import BaseModel


class OpenClawConfigCreate(BaseModel):
    """创建或幂等写入 OpenClaw 配置的请求体。

    使用方：
    - ``POST /openclaw-configs``

    注意：
    - 当前接口会校验 key 是否属于支持列表。
    - 运行时真正会读取的，当前就是 ``gateway_url`` 和 ``gateway_token``。
    """
    # 配置键名。
    key: str
    # 配置值正文。
    # 可能是 WebSocket 地址，也可能是敏感认证 Token。
    value: str
    # 配置项说明文字，供前端配置界面展示。
    description: str | None = None


class OpenClawConfigUpdate(BaseModel):
    """更新 OpenClaw 配置的请求体。

    使用方：
    - ``PUT /openclaw-configs/{config_id}``

    当前只允许修改既有记录的值和说明。
    """
    # 新的配置值正文。
    value: str
    # 新的配置说明；若为 None，当前实现会保留旧 description。
    description: str | None = None


class OpenClawConfigRead(BaseModel):
    """OpenClaw 配置记录的读取模型。

    使用方：
    - ``GET /openclaw-configs``
    - ``GET /openclaw-configs/{config_key}``
    - 配置创建/更新后的返回体

    这个响应描述的是数据库中的单条配置记录。
    OpenClaw 代理建连时，service 层会优先读这些记录，再回退到 settings 默认值。
    """
    # openclaw_config 表主键。
    id: int
    # 配置键名。
    key: str
    # 配置值正文。
    # 对 ``gateway_token`` 来说，这里当前会直接返回 Token 明文。
    value: str
    # 配置项说明文字。
    description: str | None = None

    class Config:
        from_attributes = True
