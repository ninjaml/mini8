"""Hermes 集成相关的请求/响应模型。

这层 schema 服务的是 Hermes API / Dashboard 代理接口，
不是本地 Agent 或 cron 的数据库模型。

从 ``api/integrations.py``、``services/hermes.py`` 和
``services/hermes_dashboard.py`` 的调用链可以确认：
- 一部分模型是本地接口请求体，例如聊天、技能切换、任务创建/更新。
- 另一部分模型是对 Hermes / Hermes Dashboard 返回结构的适配。
- 某些响应字段是本地代码明确组装出来的；
  另一些则基本沿用下游 Hermes Dashboard 返回的字段命名。
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


# --- 请求模型 ---

class HermesChatRequest(BaseModel):
    """Hermes 聊天请求体。

    使用方：
    - Hermes 聊天代理接口（见 integrations 路由中的 chat 调用）

    结构上接近 OpenAI Chat Completions 请求格式。
    """
    # 目标模型名；当前默认写死为 hermes-agent。
    model: str = "hermes-agent"
    # 对话消息列表；每项通常包含 role / content。
    messages: List[Dict[str, str]]
    # 是否请求流式响应。
    stream: bool = False


# Phase 2 预留：定时任务 CRUD
class HermesJobCreateRequest(BaseModel):
    """创建 Hermes 定时任务的请求体。"""
    # 任务名称。
    name: str
    # 任务执行时发送给 Hermes 的 prompt。
    prompt: str
    # 调度表达式；当前直接转发给下游 Hermes/Dashboard。
    schedule: str
    # 任务启用的技能列表；为空时由下游决定默认行为。
    skills: Optional[List[str]] = None
    # 投递方式；当前默认 local。
    deliver: Optional[str] = "local"


class HermesJobUpdateRequest(BaseModel):
    """更新 Hermes 定时任务的请求体。"""
    # 更新后的任务名称。
    name: Optional[str] = None
    # 更新后的 prompt。
    prompt: Optional[str] = None
    # 更新后的调度表达式。
    schedule: Optional[str] = None
    # 更新后的技能列表。
    skills: Optional[List[str]] = None
    # 更新后的投递方式。
    deliver: Optional[str] = None
    # 是否启用该任务。
    enabled: Optional[bool] = None


# --- 响应模型 ---

class HermesAgentInfo(BaseModel):
    """Hermes Agent 概览信息。

    使用方：
    - ``GET /hermes/agent``

    这个响应一部分来自 Hermes 配置，一部分来自 Dashboard/API 探测结果。
    """
    # Hermes 侧 agent 标识；当前由本地 service 组装，常见为固定字符串。
    id: str
    # Agent 展示名称。
    name: str
    # 人设/个性描述；当前通过 Dashboard 配置摘要提取。
    personality: str
    # 当前模型名；Dashboard 里可能原本是 string，也可能是 dict，这里已被整理成字符串。
    model: str
    # 连接状态摘要。
    # 当前代码明确会出现 online / offline / not_installed / unknown 这些值。
    status: str  # "online" | "offline" | "not_installed" | "unknown"
    # 是否已完成 Hermes 连接配置。
    configured: bool = False


class HermesSkillInfo(BaseModel):
    """Hermes 技能信息。"""
    # 技能名。
    name: str
    # 技能描述；取决于 Dashboard 是否返回。
    description: Optional[str] = None
    # 技能分类；取决于 Dashboard 是否返回。
    category: Optional[str] = None
    # 当前是否启用。
    enabled: bool


class HermesJobInfo(BaseModel):
    """Hermes 定时任务信息。

    使用方：
    - ``GET /hermes/jobs``
    - 创建/更新任务后的返回体

    这组字段大多直接适配 Hermes Dashboard 的 cron job 返回结构，
    当前本地代码没有对它们做强归一化。
    """
    # 任务 ID。
    id: str
    # 任务名称。
    name: str
    # 任务 prompt。
    prompt: Optional[str] = None
    # 任务启用的技能列表。
    skills: Optional[List[str]] = None
    # 面向界面展示的调度文本。
    schedule_display: Optional[str] = None
    # 是否启用。
    enabled: bool
    # 当前状态字符串；语义依赖下游 Hermes/Dashboard。
    state: str
    # 下一次计划执行时间。
    next_run_at: Optional[str] = None
    # 上一次执行时间。
    last_run_at: Optional[str] = None
    # 上一次执行状态。
    last_status: Optional[str] = None
    # 投递方式。
    deliver: Optional[str] = None
    # 最近错误信息。
    last_error: Optional[str] = None
    # 下游返回的原始来源信息；当前本地不做进一步解析。
    origin: Optional[Any] = None
    # 创建时间。
    created_at: Optional[str] = None
    # 暂停时间。
    paused_at: Optional[str] = None
    # 暂停原因。
    paused_reason: Optional[str] = None


class ToolsetItem(BaseModel):
    """Hermes 工具集信息。"""
    # 工具集内部名称。
    name: str
    # 工具集展示标签。
    label: str
    # 工具集描述。
    description: Optional[str] = None
    # 当前是否启用。
    enabled: bool
    # 当前环境下是否可用。
    available: bool
    # 当前是否已完成必要配置。
    configured: bool
    # 工具集包含的工具名列表。
    tools: List[str] = []


class HermesHealthResponse(BaseModel):
    """Hermes 健康检查响应。"""
    # 健康状态；当前常见为 ok / error / offline。
    status: str
    # 可选平台信息；是否返回取决于下游响应。
    platform: Optional[str] = None


class HermesChatResponse(BaseModel):
    """Hermes 聊天响应。

    当前按 OpenAI-compatible chat response 结构建模。
    """
    # 响应 ID。
    id: str
    # 对象类型。
    object: str
    # 创建时间戳。
    created: int
    # 实际使用的模型名。
    model: str
    # 响应候选列表；当前不进一步细分 choice 内部结构。
    choices: List[Dict[str, Any]]


class HermesSkillToggleRequest(BaseModel):
    """Hermes 技能启停请求体。"""
    # 目标状态：True 为启用，False 为停用。
    enabled: bool
