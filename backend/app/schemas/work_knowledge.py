"""Workspace 知识挂载相关的请求/响应模型。

这层 schema 服务的是“某个 workspace 挂载了哪些知识入口”，
不是企业知识引擎的全局配置，也不是知识正文存储本身。

从 ``api/knowledge.py``、``models/work_knowledge.py``、
``repositories/work_knowledge.py`` 和 ``services/obsidian_local_rest.py`` 的调用链可以确认：
- 当前主实现围绕 ``type="obsidian"`` 的本地知识库挂载。
- ``WorkKnowledgeRead.knowledge_json`` 保存的是连接/挂载配置，不是文件内容。
- 目录树浏览和文件读取，都会先按约定解析 ``knowledge_json`` 中的端口、密钥等字段。
"""

from pydantic import BaseModel, ConfigDict, Field


class WorkKnowledgeCreate(BaseModel):
    """创建 workspace 知识挂载的请求体。

    使用方：
    - ``POST /workspaces/{workspace_id}/knowledge``

    当前创建流程会：
    - 校验 workspace 存在
    - 校验名称在 workspace 内唯一
    - 校验端口在 workspace 内未重复挂载
    - 调用 ``probe_obsidian_knowledge()`` 探测目标 Obsidian Local REST 服务
    - 最终把这些字段写进 ``WorkKnowledge.knowledge_json``
    """

    model_config = ConfigDict(extra="forbid")

    # 该挂载项在 workspace 内的展示名称。
    # 创建时还会被同时写入 knowledge_json["vault_name"]。
    name: str = Field(..., min_length=1, max_length=255)
    # Obsidian Local REST API 监听端口。
    # 用于构造基础访问地址 http://localhost:{port}。
    port: int = Field(..., ge=1, le=65535)
    # Obsidian Local REST API 访问密钥。
    # 创建后会写入 knowledge_json["api_key"]，读取文件/目录时再解析出来。
    api_key: str = Field(..., min_length=1)
    # Omnisearch HTTP Server 端口，可选。
    # 当前平台主存的是端口值；导出给 Obsidian skill 时再推导成 omnisearch_url。
    # 不填写时，相关 skill 会退化为只使用 Local REST API。
    omnisearch_port: int | None = Field(default=None, ge=1, le=65535)


class WorkKnowledgeUpdate(BaseModel):
    """更新 workspace 知识挂载的请求体。

    使用方：
    - ``PATCH /knowledge/{knowledge_id}``

    当前实现只允许改展示名称 ``name``，
    不允许通过这个接口改端口、API key 或 omnisearch 端口。
    """

    # 更新后的展示名称。
    name: str = Field(..., min_length=1, max_length=255)


class WorkKnowledgeRead(BaseModel):
    """workspace 知识挂载记录的读取模型。

    使用方：
    - ``GET /workspaces/{workspace_id}/knowledge``
    - 创建/更新知识挂载后的返回体

    这个响应描述的是数据库里的挂载记录真相。
    其中 ``knowledge_json`` 当前仍然是原始 JSON 字符串，而不是拆开的结构化字段。
    """

    # work_knowledge 表主键。
    id: int
    # 归属用户标识；当前创建接口通常不主动写入，因此常见为 None。
    user_id: str | None = None
    # 所属 workspace 主键。
    work_space_id: int
    # 该挂载项在 workspace 内显示的名称。
    name: str
    # 知识挂载类型；当前创建接口固定写入 ``obsidian``。
    type: str
    # 挂载配置 JSON 字符串。
    # 当前主实现约定其中至少可能包含：
    # port、api_key、vault_name、omnisearch_port，
    # 以及导出/兼容场景下可能出现的 omnisearch_url。
    knowledge_json: str

    model_config = {"from_attributes": True}


class KnowledgeTreeEntryRead(BaseModel):
    """知识目录树中的单个条目。"""

    # 文件或文件夹名称。
    name: str
    # 相对 vault 根目录的路径。
    path: str
    # 是否为目录。
    is_dir: bool
    # 条目类型；当前 ``obsidian_local_rest`` 返回 ``directory`` 或 ``file``。
    type: str


class KnowledgeTreeRead(BaseModel):
    """知识目录树读取模型。

    使用方：
    - ``GET /knowledge/{knowledge_id}/tree``
    """

    # 当前浏览的 WorkKnowledge 主键。
    knowledge_id: int
    # 当前树视图标题；接口层直接复用 knowledge.name。
    title: str
    # 当前浏览的相对路径；根目录时为空字符串。
    current_path: str
    # 当前路径下的条目列表。
    entries: list[KnowledgeTreeEntryRead]


class KnowledgeFileRead(BaseModel):
    """知识文件内容读取模型。

    使用方：
    - ``GET /knowledge/{knowledge_id}/file``
    """

    # 当前文件所属的 WorkKnowledge 主键。
    knowledge_id: int
    # 当前文件视图标题；接口层直接复用 knowledge.name。
    title: str
    # 文件在 vault 内的相对路径。
    path: str
    # 文件名；接口层由 path 最后一段推导。
    name: str
    # 文件文本内容。
    content: str
