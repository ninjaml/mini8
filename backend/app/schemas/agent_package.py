"""Agent 团队模板导入/导出的契约定义。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AgentPackageAgentManifest(BaseModel):
    """模板包里单个 Agent 的声明。"""

    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    name: str = Field(min_length=1)


class AgentPackageBindingManifest(BaseModel):
    """模板包里 root -> child 的直连绑定声明。"""

    model_config = ConfigDict(extra="forbid")

    child_key: str = Field(min_length=1)
    subagent_name: str = Field(min_length=1)
    description: str


class AgentPackageManifest(BaseModel):
    """团队模板 ZIP 内 ``manifest.json`` 的数据结构。"""

    model_config = ConfigDict(extra="forbid")

    package_type: Literal["agent_team_template"] = "agent_team_template"
    schema_version: Literal[1] = 1
    root_agent_key: str = Field(min_length=1)
    agents: list[AgentPackageAgentManifest]
    bindings: list[AgentPackageBindingManifest] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_topology(self) -> "AgentPackageManifest":
        agent_keys = [agent.key for agent in self.agents]
        if len(agent_keys) != len(set(agent_keys)):
            raise ValueError("manifest agents contains duplicate keys")
        if self.root_agent_key not in set(agent_keys):
            raise ValueError("manifest root_agent_key is missing from agents")

        child_keys = [binding.child_key for binding in self.bindings]
        unknown_keys = [key for key in child_keys if key not in set(agent_keys)]
        if unknown_keys:
            raise ValueError(f"manifest bindings reference unknown child keys: {', '.join(sorted(set(unknown_keys)))}")
        if self.root_agent_key in child_keys:
            raise ValueError("manifest bindings must not bind root agent as child")
        return self


class AgentPackageImportAgentRead(BaseModel):
    """导入结果里单个已创建 Agent 的回执。"""

    model_config = ConfigDict(extra="forbid")

    source_key: str
    source_name: str
    created_agent_id: int
    created_name: str
    role: Literal["root", "child"]


class AgentPackageImportRead(BaseModel):
    """导入团队模板后的返回体。"""

    model_config = ConfigDict(extra="forbid")

    root_agent_id: int
    root_agent_name: str
    created_agents: list[AgentPackageImportAgentRead]
    created_binding_count: int
