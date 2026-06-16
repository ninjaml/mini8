from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


# --- 请求模型 ---

class HermesChatRequest(BaseModel):
    model: str = "hermes-agent"
    messages: List[Dict[str, str]]
    stream: bool = False


# Phase 2 预留：定时任务 CRUD
class HermesJobCreateRequest(BaseModel):
    name: str
    prompt: str
    schedule: str
    skills: Optional[List[str]] = None
    deliver: Optional[str] = "local"


class HermesJobUpdateRequest(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None
    schedule: Optional[str] = None
    skills: Optional[List[str]] = None
    deliver: Optional[str] = None
    enabled: Optional[bool] = None


# --- 响应模型 ---

class HermesAgentInfo(BaseModel):
    id: str
    name: str
    personality: str
    model: str
    status: str  # "online" | "offline" | "not_installed" | "unknown"
    configured: bool = False


class HermesSkillInfo(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    enabled: bool


class HermesJobInfo(BaseModel):
    id: str
    name: str
    prompt: Optional[str] = None
    skills: Optional[List[str]] = None
    schedule_display: Optional[str] = None
    enabled: bool
    state: str
    next_run_at: Optional[str] = None
    last_run_at: Optional[str] = None
    last_status: Optional[str] = None
    deliver: Optional[str] = None
    last_error: Optional[str] = None
    origin: Optional[Any] = None
    created_at: Optional[str] = None
    paused_at: Optional[str] = None
    paused_reason: Optional[str] = None


class ToolsetItem(BaseModel):
    name: str
    label: str
    description: Optional[str] = None
    enabled: bool
    available: bool
    configured: bool
    tools: List[str] = []


class HermesHealthResponse(BaseModel):
    status: str
    platform: Optional[str] = None


class HermesChatResponse(BaseModel):
    # OpenAI-compatible response
    id: str
    object: str
    created: int
    model: str
    choices: List[Dict[str, Any]]


class HermesSkillToggleRequest(BaseModel):
    enabled: bool


class SkillInstallRequest(BaseModel):
    content: str
