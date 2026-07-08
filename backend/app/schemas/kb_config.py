"""知识库全局配置的请求/响应模型。

这层 schema 对应的是 ``kb_config`` 表里的全局键值配置，
不是某个 workspace 私有的知识挂载配置。

从 ``api/knowledge.py``、``models/kb_config.py`` 和
``services/enterprise_knowledge.py`` 的调用链可以确认：
- 当前对外暴露的是一套通用 ``key/value/description`` 配置接口。
- 但稳定使用的 key 目前主要是 ``r2r_base_url`` 和 ``r2r_login_url``。
- 其中 ``r2r_base_url`` 在新增/更新时还会同步刷新 enterprise knowledge service 的运行时缓存。
"""

from pydantic import BaseModel


class KBConfigCreate(BaseModel):
    """创建或幂等写入知识库全局配置的请求体。

    使用方：
    - ``POST /kb-configs``

    注意：
    - 这个接口虽然叫 create，但如果同 key 已存在，当前实现会走“覆盖更新”。
    - ``key`` 的业务语义由服务端约定，目前最重要的是 ``r2r_base_url``。
    """
    # 配置键名。
    # 目前稳定使用的包括 ``r2r_base_url`` 和 ``r2r_login_url``。
    key: str
    # 配置值正文。
    # 当前主要保存 URL 这类文本值，不做额外结构化解析。
    value: str
    # 面向前端配置界面的说明文字。
    description: str | None = None


class KBConfigUpdate(BaseModel):
    """更新知识库全局配置的请求体。

    使用方：
    - ``PUT /kb-configs/{config_id}``

    这里不允许改 ``key``，只能更新既有配置项的值和说明。
    """
    # 新的配置值正文。
    value: str
    # 新的说明文字；若为 None，当前实现会保留旧 description。
    description: str | None = None


class KBConfigRead(BaseModel):
    """知识库全局配置的读取模型。

    使用方：
    - ``GET /kb-configs``
    - ``GET /kb-configs/{config_key}``
    - 配置创建/更新后的返回体

    这个响应描述的是数据库中的单条 kb_config 记录，
    不直接表示“知识引擎当前是否可达”；连通性要看 enterprise status 接口。
    """
    # kb_config 表主键。
    id: int
    # 配置键名。
    key: str
    # 配置值正文。
    value: str
    # 配置项说明，供前端展示或运维理解用途。
    description: str | None = None

    class Config:
        from_attributes = True
