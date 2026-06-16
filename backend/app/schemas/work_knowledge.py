"""
工作知识库（WorkKnowledge）相关的 Pydantic 模式定义。

本模块定义了知识库的创建、更新、读取以及知识树/文件浏览等数据模型，
用于 API 请求/响应的校验与序列化。
"""

from pydantic import BaseModel, ConfigDict, Field


class WorkKnowledgeCreate(BaseModel):
    """知识库创建请求模型。

    禁止传入额外字段（extra="forbid"），确保请求体严格受控。

    Attributes:
        name: 知识库名称，长度限制 1~255 个字符。
        port: 服务端口号，取值范围 1~65535。
        api_key: API 密钥，非空字符串。
        omnisearch_port: 全文检索服务端口，取值范围 1~65535。
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=255)
    port: int = Field(..., ge=1, le=65535)
    api_key: str = Field(..., min_length=1)
    omnisearch_port: int = Field(..., ge=1, le=65535)


class WorkKnowledgeUpdate(BaseModel):
    """知识库更新请求模型。

    Attributes:
        name: 知识库名称，长度限制 1~255 个字符。
    """

    name: str = Field(..., min_length=1, max_length=255)


class WorkKnowledgeRead(BaseModel):
    """知识库读取响应模型。

    Attributes:
        id: 知识库唯一标识。
        user_id: 所属用户 ID。
        work_space_id: 所属工作空间 ID。
        name: 知识库名称。
        type: 知识库类型。
        knowledge_json: 知识库配置 JSON 字符串。
    """

    id: int
    user_id: str | None = None
    work_space_id: int | None = None
    name: str | None = None
    type: str | None = None
    knowledge_json: str | None = None

    model_config = {"from_attributes": True}


class KnowledgeTreeEntryRead(BaseModel):
    """知识库树形结构单条条目模型。

    Attributes:
        name: 条目名称（文件或文件夹名）。
        path: 条目路径。
        is_dir: 是否为目录。
        type: 条目类型标识。
    """

    name: str
    path: str
    is_dir: bool
    type: str


class KnowledgeTreeRead(BaseModel):
    """知识库树形结构读取模型。

    Attributes:
        knowledge_id: 所属知识库 ID。
        title: 树形结构标题。
        current_path: 当前浏览路径。
        entries: 当前路径下的条目列表。
    """

    knowledge_id: int
    title: str
    current_path: str
    entries: list[KnowledgeTreeEntryRead]


class KnowledgeFileRead(BaseModel):
    """知识库文件内容读取模型。

    Attributes:
        knowledge_id: 所属知识库 ID。
        title: 文件标题。
        path: 文件路径。
        name: 文件名称。
        content: 文件文本内容。
    """

    knowledge_id: int
    title: str
    path: str
    name: str
    content: str
