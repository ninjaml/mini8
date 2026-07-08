from typing import Any, Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    """登录请求
    
    用户登录认证的请求数据。
    """
    username: str  # 用户名
    password: str  # 密码


class LoginResponse(BaseModel):
    """登录响应
    
    登录认证的结果。
    """
    success: bool  # 是否登录成功
    message: str  # 结果消息
    user_id: Optional[str] = None  # 用户ID（登录成功时返回）


class CreateSessionRequest(BaseModel):
    """创建会话请求
    
    创建新的对话会话。
    """
    agent_name: str = "agent"  # 绑定的 Agent 名称，默认为 "agent"
    working_dir: Optional[str] = None  # 工作目录路径，不提供则使用用户主目录
    name: Optional[str] = None  # 会话名称，不提供则自动生成
    history_turn_limit: int = 20  # 历史保留轮数，默认保留最近 20 轮


class CreateSessionResponse(BaseModel):
    """创建会话响应
    
    会话创建成功后返回的信息。
    """
    thread_id: str  # 会话唯一标识符（UUID）
    agent_name: str  # 绑定的 Agent 名称
    name: str  # 会话名称
    working_dir: str  # 工作目录路径
    history_turn_limit: int = 20  # 历史保留轮数
    message: str  # 结果消息


class ListSessionsRequest(BaseModel):
    """列出会话请求
    
    获取会话列表，可按 Agent 名称筛选。
    """
    agent_name: Optional[str] = None  # 筛选指定 Agent 的会话，不提供则返回所有


class SessionInfo(BaseModel):
    """会话信息
    
    单个会话的详细信息。
    """
    thread_id: str  # 会话唯一标识符
    agent_name: str  # 绑定的 Agent 名称
    name: Optional[str] = ''  # 会话名称
    working_dir: Optional[str] = None  # 工作目录路径
    history_turn_limit: Optional[int] = None  # 历史保留轮数，未设置时为 None
    model_provider: Optional[str] = None  # 模型提供商（如 openai、anthropic 等）
    created_at: str  # 创建时间
    updated_at: str  # 更新时间
    first_message_preview: str  # 首条消息预览（用于会话列表显示）
    message_count: int  # 消息总数


class ListSessionsResponse(BaseModel):
    """列出会话响应
    
    会话列表查询结果。
    """
    sessions: list[SessionInfo]  # 会话信息列表


class DeleteSessionRequest(BaseModel):
    """删除会话请求
    
    删除指定的会话。
    """
    thread_id: str  # 要删除的会话唯一标识符


class RenameSessionRequest(BaseModel):
    """重命名会话请求
    
    修改会话名称。
    """
    thread_id: str  # 会话唯一标识符
    name: str  # 新的会话名称


class RenameSessionResponse(BaseModel):
    """重命名会话响应
    
    重命名操作的结果。
    """
    success: bool  # 是否操作成功
    message: str  # 结果消息


class ClearSessionRequest(BaseModel):
    """清除会话请求
    
    清除会话中的所有消息历史，但保留会话本身。
    """
    thread_id: str  # 会话唯一标识符


class ClearSessionResponse(BaseModel):
    """清除会话响应
    
    清除操作的结果。
    """
    success: bool  # 是否操作成功
    message: str  # 结果消息


class CreateAgentRequest(BaseModel):
    """创建 Agent 请求
    
    创建新的 AI Agent 实例。
    """
    agent_name: str  # Agent 名称，只能包含字母、数字、连字符、下划线和空格
    provider: str  # 模型提供商（如 deepseek、kimi、openai）
    model_name: str = ""  # Agent 使用的模型名称
    base_url: str = ""  # Agent 使用的基础 URL，可为空
    overwrite: bool = False  # 是否覆盖已存在的同名 Agent


class CreateAgentResponse(BaseModel):
    """创建 Agent 响应
    
    Agent 创建结果。
    """
    success: bool  # 是否创建成功
    message: str  # 结果消息
    agent_name: str  # Agent 名称
    agent_dir: str  # Agent 目录路径


class AgentListItem(BaseModel):
    """Agent 列表项
    
    Agent 列表中的单个 Agent 信息（简化版）。
    """
    name: str  # Agent 名称（运行时标识）
    display_name: Optional[str] = None  # 业务昵称（SuperAgent/WorkAgent 的人类可读名称）
    workspace_id: Optional[int] = None  # 所属 workspace ID（MOSS 等全局 Agent 为 None）
    path: str  # Agent 目录路径
    has_skills: bool  # 是否包含技能文件
    model_provider: Optional[str] = None  # 模型提供商
    model_name: Optional[str] = None  # Agent 配置中的模型名称
    base_url: Optional[str] = None  # Agent 配置中的 base_url


class AgentListResponse(BaseModel):
    """Agent 列表响应
    
    所有 Agent 的列表。
    """
    agents: list[AgentListItem]  # Agent 列表


class DeleteAgentRequest(BaseModel):
    """删除 Agent 请求
    
    删除指定的 Agent。
    """
    agent_name: str  # 要删除的 Agent 名称


class DeleteAgentResponse(BaseModel):
    """删除 Agent 响应
    
    删除操作的结果。
    """
    success: bool  # 是否删除成功
    message: str  # 结果消息


class ResetAgentRequest(BaseModel):
    """重置 Agent 请求
    
    将 Agent 重置为默认配置（删除 agent.md 并重新创建）。
    """
    agent_name: str  # 要重置的 Agent 名称


class ResetAgentResponse(BaseModel):
    """重置 Agent 响应
    
    重置操作的结果。
    """
    success: bool  # 是否重置成功
    message: str  # 结果消息
    agent_name: str  # Agent 名称


class FilesystemRoot(BaseModel):
    """文件系统根目录项
    
    表示一个文件系统根目录（Windows 盘符或 Linux/Mac 根目录）。
    """
    name: str  # 根目录名称（如 "D:" 或 "/"）
    path: str  # 根目录路径


class FilesystemRootsResponse(BaseModel):
    """文件系统根目录列表响应
    
    返回系统可用的文件系统根目录。
    """
    platform: str  # 操作系统类型（windows、linux、darwin）
    roots: list[FilesystemRoot]  # 根目录列表


class ListDirectoryRequest(BaseModel):
    """列出目录请求
    
    获取指定路径下的子目录列表。
    """
    path: str  # 要列出的目录路径


class DirectoryItem(BaseModel):
    """目录项
    
    单个目录的信息。
    """
    name: str  # 目录名称
    path: str  # 目录完整路径
    accessible: bool  # 是否可访问（有读取权限）


class ListDirectoryResponse(BaseModel):
    """列出目录响应
    
    目录列表查询结果。
    """
    current_path: str  # 当前目录路径
    parent_path: Optional[str]  # 父目录路径（根目录时为 None）
    normalized_path: str  # 标准化后的路径
    directories: list[DirectoryItem]  # 子目录列表


class ValidatePathRequest(BaseModel):
    """验证路径请求
    
    验证指定路径是否有效。
    """
    path: str  # 要验证的路径


class ValidatePathResponse(BaseModel):
    """验证路径响应
    
    路径验证结果。
    """
    valid: bool  # 路径是否有效
    exists: bool  # 路径是否存在
    is_directory: bool  # 是否为目录
    accessible: bool  # 是否可访问
    normalized_path: Optional[str] = None  # 标准化后的路径


class FileTreeItem(BaseModel):
    """文件树项
    
    文件树中的单个文件或目录节点。
    """
    name: str  # 文件或目录名称
    path: str  # 完整路径
    is_dir: bool  # 是否为目录
    size: Optional[int] = None  # 文件大小（字节），目录时为 None
    children: Optional[list["FileTreeItem"]] = None  # 子项列表（目录时有效）


class FileTreeRequest(BaseModel):
    """文件树请求
    
    获取指定根目录的文件树结构。
    """
    root: str  # 根目录路径
    depth: int = 3  # 遍历深度，默认 3 层


class FileTreeResponse(BaseModel):
    """文件树响应
    
    文件树查询结果。
    """
    root: str  # 根目录路径
    tree: list[FileTreeItem]  # 文件树结构


class FileReadRequest(BaseModel):
    """读取文件请求
    
    读取指定文件的内容。
    """
    path: str  # 文件路径


class FileReadResponse(BaseModel):
    """读取文件响应
    
    文件内容读取结果。
    """
    path: str  # 文件路径
    name: str  # 文件名
    content: str  # 文件内容
    size: int  # 文件大小（字节）
    extension: str  # 文件扩展名


class FileMkdirRequest(BaseModel):
    """创建目录请求
    
    在指定路径创建新目录。
    """
    path: str  # 要创建的目录路径


class FileDeleteRequest(BaseModel):
    """删除文件请求
    
    删除指定的文件或目录。
    """
    path: str  # 要删除的文件或目录路径


class SetApiKeyRequest(BaseModel):
    """设置 API Key 请求
    
    设置或更新 API 密钥。
    """
    provider: str  # 提供商名称（如 openai、deepseek）
    key_value: str  # API key 值
    base_url: str = ""  # API 基础 URL，可为空
    description: str = ""  # 描述信息


class ApiKeyItem(BaseModel):
    """API Key 项
    
    单个 API 密钥的信息。
    """
    provider: str  # 提供商名称
    description: str  # 描述信息
    category: str  # 分类（如 llm、search 等）
    is_active: bool  # 是否已激活
    has_value: bool  # 是否已设置值
    model_name: str | None = None  # 模型名称
    base_url: str | None = None  # API 基础 URL
    key_preview: str = ""  # key 值预览（脱敏显示）


class ApiKeyListResponse(BaseModel):
    """API Key 列表响应
    
    所有 API 密钥的列表。
    """
    keys: list[ApiKeyItem]  # API key 列表


class DeleteApiKeyRequest(BaseModel):
    """删除 API Key 请求
    
    删除指定的 API 密钥。
    """
    provider: str  # 要删除的 provider 名称


class ActivateApiKeyRequest(BaseModel):
    """激活 API Key 请求

    将某个模型 provider 设为默认模型来源。
    """
    provider: str


class UpdateAgentModelRequest(BaseModel):
    """修改 Agent 模型配置请求
    
    修改已有 Agent 的模型提供商、模型名称和 base_url。
    """
    agent_name: str      # 要修改的 Agent 名称
    provider: str        # 新的模型提供商
    model_name: str = "" # 模型名称（留空使用 provider 默认值）
    base_url: str = ""   # API 基础 URL（留空使用 provider 默认值）


class UpdateAgentModelResponse(BaseModel):
    """修改 Agent 模型配置响应
    
    返回修改后的模型配置信息。
    """
    success: bool
    message: str
    agent_name: str
    provider: str
    model_name: str
    base_url: str


class AttachmentInfo(BaseModel):
    """附件信息
    
    消息中的附件（图片、视频等）。
    """
    type: str  # 附件类型（image、video 等）
    url: str  # 附件 URL 或 base64 数据


class FetchEventsRequest(BaseModel):
    """获取完整事件历史请求。"""
    limit: int = 20
    before_id: Optional[int] = None


class EventHistoryItem(BaseModel):
    """完整事件历史项。"""
    id: int
    thread_id: str
    group_id: str
    event_index: int
    type: str
    content: str
    metadata: dict[str, Any] = {}
    attachments: list[AttachmentInfo] = []
    message_index: Optional[int] = None
    created_at: Optional[str] = None


class FetchEventsResponse(BaseModel):
    """获取完整事件历史响应。"""
    events: list[EventHistoryItem]
    has_more: bool
    oldest_id: Optional[int] = None


class FetchGroupedReplayRequest(BaseModel):
    """获取分组回放请求。"""
    limit_groups: int = 20
    before_cursor: Optional[int] = None


class ReplayTraceEvent(BaseModel):
    """回放事件。"""
    id: int
    type: str
    content: str
    metadata: dict[str, Any] = {}
    attachments: list[AttachmentInfo] = []
    message_index: Optional[int] = None
    created_at: Optional[str] = None


class ReplayTraceBranchNode(BaseModel):
    """按 namespace 组织的分支节点。"""
    namespace: list[str]
    namespace_key: str
    events: list["ReplayTraceEvent"]
    children: list["ReplayTraceBranchNode"] = []


class ReplayTraceInstance(BaseModel):
    """单次 invocation 回放。"""
    subagent_invocation_id: str
    subagent_type: Optional[str] = None
    description: Optional[str] = None
    # 这次 invocation 背后对应的长期 child thread 身份锚点。
    # 目前只用于观察/回放，不等于完整 child-session 历史接口。
    child_thread_id: Optional[str] = None
    namespace_key: Optional[str] = None
    # 聊天区历史要直接重建子 agent 卡片，所以这里把 invocation 级摘要一并带回前端。
    events: list[ReplayTraceEvent] = []
    first_event_id: Optional[int] = None
    last_event_id: Optional[int] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    status: Optional[str] = None
    preview: Optional[str] = None
    branch_tree: ReplayTraceBranchNode


class ReplayTraceGroup(BaseModel):
    """单个 run group 的回放结果。"""
    group_id: str
    root_events: list[ReplayTraceEvent]
    invocations: list[ReplayTraceInstance]


class FetchGroupedReplayResponse(BaseModel):
    """分组回放响应。"""
    groups: list[ReplayTraceGroup]
    has_more: bool
    next_cursor: Optional[int] = None


class FetchReplayGroupResponse(BaseModel):
    """单个 group 的完整回放响应。"""
    group: Optional[ReplayTraceGroup] = None


class RollbackRequest(BaseModel):
    """回滚消息请求
    
    将会话回滚到指定消息索引处，删除该消息之后的所有内容。
    """
    message_index: int  # 要回滚到的消息索引


class RollbackResponse(BaseModel):
    """回滚消息响应
    
    回滚操作的结果。
    """
    message: str  # 结果消息
    new_message_count: int  # 回滚后的消息总数


class SpeechRecognizeRequest(BaseModel):
    """语音识别请求
    
    调用百度语音识别 API 进行语音转文字。
    """
    format: str = "pcm"  # 音频格式，默认 pcm
    rate: int = 16000  # 采样率，默认 16000
    channel: int = 1  # 声道数，默认 1（单声道）
    token: str  # 百度 API 访问令牌
    speech: str  # 音频数据（base64 编码）
    len: int  # 音频数据长度（字节）


ReplayTraceBranchNode.model_rebuild()
