"""Middleware for loading agent-specific long-term memory into the system prompt."""

import contextlib
from collections.abc import Awaitable, Callable
from typing import NotRequired, TypedDict, cast
from datetime import datetime

from langchain.agents.middleware.types import (
    AgentMiddleware,
    AgentState,
    ModelRequest,
    ModelResponse,
)
from langgraph.runtime import Runtime

from deepagents_webapi.config import Settings


class AgentMemoryState(AgentState):
    """State for the agent memory middleware."""

    identity: NotRequired[str]
    """Agent identity and style from ~/.mini8/{agent}/identity.md"""

    memory: NotRequired[str]
    """Key decisions and discoveries from ~/.mini8/{agent}/memory.md"""

    agent_rules: NotRequired[str]
    """Agent behavior rules from ~/.mini8/{agent}/agent.md"""

    tools_description: NotRequired[str]
    """Tool descriptions from ~/.mini8/{agent}/tools.md"""

    project_agent_rules: NotRequired[str]
    """Project-specific rules from {project_root}/.mini8/agent.md"""

    project_memory: NotRequired[str]
    """Project-specific memory from {project_root}/.mini8/memory.md"""


class AgentMemoryStateUpdate(TypedDict):
    """A state update for the agent memory middleware."""

    identity: NotRequired[str]
    memory: NotRequired[str]
    agent_rules: NotRequired[str]
    tools_description: NotRequired[str]
    project_agent_rules: NotRequired[str]
    project_memory: NotRequired[str]


# Long-term Memory Documentation
# Note: Claude Code loads CLAUDE.md files hierarchically and combines them (not precedence-based):
# - Loads recursively from cwd up to (but not including) root directory
# - Multiple files are combined hierarchically: enterprise → project → user
# - Both [project-root]/CLAUDE.md and [project-root]/.claude/CLAUDE.md are loaded if both exist
# - Files higher in hierarchy load first, providing foundation for more specific memories
# We will follow that pattern for mini8-unique-v2.0
LONGTERM_MEMORY_SYSTEM_PROMPT = """

## Long-term Memory

Your memory is stored in 5 files that persist across sessions:

**User Memory Location**: `{agent_dir_absolute}` (displays as `{agent_dir_display}`)
**Project Memory Location**: `{project_deepagents_dir}`

| File | Purpose | Write Permission |
|------|---------|------------------|
| `{agent_dir_absolute}/identity.md` | Core identity and style | 🚫 NEVER modify |
| `{agent_dir_absolute}/memory.md` | Key decisions and discoveries (global) | ⚠️ Ask user first |
| `{agent_dir_absolute}/agent.md` | Behavior rules | ⚠️ Ask user first |
| `{agent_dir_absolute}/tools.md` | Tool usage guides | 🚫 NEVER modify |
| `{project_deepagents_dir}/agent.md` | Project-specific rules | ⚠️ Ask user first |
| `{project_deepagents_dir}/memory.md` | Project-specific memory | ⚠️ Ask user first |


**Note**: Your memory files are automatically loaded into this system prompt at the start of each session. You don't need to read them manually - just use the knowledge from the sections above.

## When to Update Memory

### File-Specific Rules

| File | When to Update | Permission | Scope Decision |
|------|---------------|------------|----------------|
| `identity.md` | **NEVER** - Fixed identity | 🚫 Do not modify | N/A |
| `memory.md` | Important decisions, discoveries, resolutions | ⚠️ Ask user first | **You decide**: global/project. If unsure, ask. |
| `agent.md` | New work rules, behavioral patterns | ⚠️ Ask user first | **You decide**: global/project. If unsure, ask. |
| `tools.md` | **NEVER** - Fixed descriptions | 🚫 Do not modify | N/A |

### How to Decide Scope (Global vs Project-Level)

**Choose Global** (`~/.mini8/{agent}/`) when:
- Knowledge applies across **ALL projects**
- About general behavior or preferences
- Example: "User prefers Chinese responses"

**Choose Project** (`project/.mini8/`) when:
- Knowledge is specific to **CURRENT project**
- About project architecture, tech stack, conventions
- Example: "This project uses FastAPI + SQLAlchemy"

**If unsure, ASK**:
> "I noticed [X]. Should I remember this globally or just for this project?"

### Timestamp Requirement for Memory

**When writing to memory.md, you MUST:**
1. **Include timestamp** - accurate to the hour
2. **Format**: `[YYYY-MM-DD HH:00]`
3. **Place at beginning** of each entry
4. **NOW**:{current_time}

**Example:**
```markdown
## Key Decisions
[2026-02-28 22:00] Use SQLite for dev, PostgreSQL for production
[2026-02-28 15:00] Test framework: pytest (not unittest, needs async support)
```

**Why timestamps matter:**
- Track when decisions were made
- Identify outdated information
- Provide context for future sessions

## Memory Editing Rules

### Core Principles (3 Iron Rules)
1. **Append Only** - NEVER delete entries, memory is cumulative
2. **Never Duplicate** - Check before writing, update if similar exists
3. **Compress Redundancy** - Merge related entries, keep latest timestamp

**Compression Example:**
```markdown
<!-- Before (redundant) -->
[2026-02-28 10:00] User prefers pytest
[2026-02-28 14:00] Testing framework is pytest
[2026-02-28 16:00] Tests use pytest, not unittest

<!-- After (compressed) -->
[2026-02-28 16:00] Test framework: pytest (not unittest, needs async support)
```

### Conflict Resolution
- **Project memory > Global memory** - Specific overrides general
- **New timestamp > Old timestamp** - Requires user confirmation
- **If unsure, ASK**: "Global memory says X, project needs Y, which takes precedence?"

### Priority Levels
- **🔴 Critical** - Architecture decisions, core preferences (permanent)
- **🟡 Important** - Workflows, tool choices (review periodically)
- **🟢 Reference** - Temporary context (can expire)

### Size Constraints
- **File limit**: 300 entries or 50KB
- **Near limit**: Proactively suggest compression/archival
- **Mark expired**: Use `~~[Expired]~~` for outdated entries
- **Conflict resolution**: When archiving, keep the NEWEST entry for conflicting information

### User Confirmation Template
**ALWAYS ask before writing:**
> 📝 **Memory Update Suggestion**
> - **Content**: [Brief description]
> - **Location**: [Global/Project] memory.md or agent.md
> - **Priority**: 🔴/🟡/🟢
> - **Reason**: [Why this needs recording]
> - **Confirm?** (Yes/No/Modify)

### Validation Rules
- ✅ No contradictions with existing memory, if has, keep the latest one
- ✅ not ambiguous and clear
- ✅ Include category tags: `[Architecture]` `[Tools]` `[Workflow]` `[Preferences]` `[Bug]` `[Deployment]` and etc.

**🚫 Critical Constraint**: 
- **NEVER** modify identity.md or tools.md
- For memory.md and agent.md: **ALWAYS ask user before writing**
- **ALWAYS follow 3 core principles**: Append only, no duplicates, compress redundancy

## File Contents Guide

| File | Content | Format Requirements |
|------|---------|---------------------|
| **identity.md** | Name, role, style | Fixed, never change |
| **memory.md** | Decisions, discoveries, context | `[Timestamp] [Tag] Content` |
| **agent.md** | Work rules, workflows | Clear and executable |
| **tools.md** | Tool usage guides | Fixed, never change |
| **project/agent.md** | Project rules, architecture | Project-specific |
| **project/memory.md** | Project decisions, tech debt | `[Timestamp] [Tag] Content` |

**Complete Entry Examples:**
```markdown
[2026-02-28 22:00] [Architecture] Use SQLite for dev, PostgreSQL for production
[2026-02-28 15:00] [Tools] Test framework: pytest (not unittest, needs async)
[2026-02-28 10:00] [Preferences] User prefers Chinese responses
```"""


DEFAULT_MEMORY_SNIPPET = """<identity>
{identity}
</identity>

<memory>
{memory}
</memory>

<agent_rules>
{agent_rules}
</agent_rules>

<tools_description>
{tools_description}
</tools_description>

<project_agent_rules>
{project_agent_rules}
</project_agent_rules>

<project_memory>
{project_memory}
</project_memory>"""


class AgentMemoryMiddleware(AgentMiddleware):
    """Middleware for loading agent-specific long-term memory.

    This middleware loads the agent's long-term memory from a file (agent.md)
    and injects it into the system prompt. The memory is loaded once at the
    start of the conversation and stored in state.
    """

    state_schema = AgentMemoryState

    def __init__(
        self,
        *,
        settings: Settings,
        assistant_id: str,
        system_prompt_template: str | None = None,
    ) -> None:
        """Initialize the agent memory middleware.

        Args:
            settings: Global settings instance with project detection and paths.
            assistant_id: The agent identifier.
            system_prompt_template: Optional custom template for injecting
                agent memory into system prompt.
        """
        self.settings = settings
        self.assistant_id = assistant_id

        # User paths
        self.agent_dir = settings.get_agent_dir(assistant_id)
        # Store both display path (with ~) and absolute path for file operations
        self.agent_dir_display = f"~/.mini8/{assistant_id}"
        self.agent_dir_absolute = str(self.agent_dir)

        # Project paths (from settings)
        self.project_root = settings.project_root

        self.system_prompt_template = system_prompt_template or DEFAULT_MEMORY_SNIPPET

    def before_agent(
        self,
        state: AgentMemoryState,
        runtime: Runtime,
    ) -> AgentMemoryStateUpdate:
        """Load agent memory from file before agent execution.

        Loads 4 user memory files (identity.md, user.md, agent.md, tools.md)
        and project-specific agent.md if available.
        Only loads if not already present in state.

        Dynamically checks for file existence on every call to catch user updates.

        Args:
            state: Current agent state.
            runtime: Runtime context.

        Returns:
            Updated state with identity, memory, agent_rules, tools_description,
            project_agent_rules, and project_memory populated.
        """
        result: AgentMemoryStateUpdate = {}

        # Get user memory directory
        agent_dir = self.settings.get_agent_dir(self.assistant_id)

        # Load identity.md if not already in state
        if "identity" not in state:
            identity_path = agent_dir / "identity.md"
            if identity_path.exists():
                with contextlib.suppress(OSError, UnicodeDecodeError):
                    result["identity"] = identity_path.read_text(encoding='utf-8')

        # Load memory.md if not already in state
        if "memory" not in state:
            memory_path = agent_dir / "memory.md"
            if memory_path.exists():
                with contextlib.suppress(OSError, UnicodeDecodeError):
                    result["memory"] = memory_path.read_text(encoding='utf-8')

        # Load agent.md if not already in state
        if "agent_rules" not in state:
            agent_path = agent_dir / "agent.md"
            if agent_path.exists():
                with contextlib.suppress(OSError, UnicodeDecodeError):
                    result["agent_rules"] = agent_path.read_text(encoding='utf-8')

        # Load tools.md if not already in state
        if "tools_description" not in state:
            tools_path = agent_dir / "tools.md"
            if tools_path.exists():
                with contextlib.suppress(OSError, UnicodeDecodeError):
                    result["tools_description"] = tools_path.read_text(encoding='utf-8')

        # Load project agent.md if not already in state
        if "project_agent_rules" not in state:
            project_path = self.settings.get_project_agent_md_path()
            if project_path and project_path.exists():
                with contextlib.suppress(OSError, UnicodeDecodeError):
                    result["project_agent_rules"] = project_path.read_text(encoding='utf-8')

        # Load project memory.md if not already in state
        if "project_memory" not in state:
            if self.project_root:
                project_memory_path = self.project_root / ".mini8" / "memory.md"
                if project_memory_path.exists():
                    with contextlib.suppress(OSError, UnicodeDecodeError):
                        result["project_memory"] = project_memory_path.read_text(encoding='utf-8')

        return result

    def _build_system_prompt(self, request: ModelRequest) -> str:
        """Build the complete system prompt with memory sections.

        Args:
            request: The model request containing state and base system prompt.

        Returns:
            Complete system prompt with memory sections injected.
        """
        # Extract memory from state
        state = cast("AgentMemoryState", request.state)
        identity = state.get("identity")
        memory = state.get("memory")
        agent_rules = state.get("agent_rules")
        tools_description = state.get("tools_description")
        project_agent_rules = state.get("project_agent_rules")
        project_memory = state.get("project_memory")
        base_system_prompt = request.system_prompt

        # Build project memory info for documentation
        if self.project_root and project_memory:
            project_memory_info = f"`{self.project_root}` (detected)"
        elif self.project_root:
            project_memory_info = f"`{self.project_root}` (no agent.md found)"
        else:
            project_memory_info = "None (not in a git project)"

        # Build project deepagents directory path
        if self.project_root:
            project_deepagents_dir = str(self.project_root / ".mini8")
        else:
            project_deepagents_dir = "[project-root]/.mini8 (not in a project)"

        # Format memory section with all 6 parts
        memory_section = self.system_prompt_template.format(
            identity=identity if identity else "(No identity.md)",
            memory=memory if memory else "(No memory.md)",
            agent_rules=agent_rules if agent_rules else "(No agent.md)",
            tools_description=tools_description if tools_description else "(No tools.md)",
            project_agent_rules=project_agent_rules if project_agent_rules else "(No project agent.md)",
            project_memory=project_memory if project_memory else "(No project memory.md)",
        )

        system_prompt = memory_section

        if base_system_prompt:
            system_prompt += "\n\n" + base_system_prompt
        
        current_time = datetime.now().strftime("%Y-%m-%d %H:00")

        system_prompt += "\n\n" + LONGTERM_MEMORY_SYSTEM_PROMPT.format(
            agent_dir_absolute=self.agent_dir_absolute,
            agent_dir_display=self.agent_dir_display,
            agent=self.assistant_id,
            current_time=current_time,
            project_memory_info=project_memory_info,
            project_deepagents_dir=project_deepagents_dir,
        )

        return system_prompt

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Inject agent memory into the system prompt.

        Args:
            request: The model request being processed.
            handler: The handler function to call with the modified request.

        Returns:
            The model response from the handler.
        """
        system_prompt = self._build_system_prompt(request)
        return handler(request.override(system_prompt=system_prompt))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        """(async) Inject agent memory into the system prompt.

        Args:
            request: The model request being processed.
            handler: The handler function to call with the modified request.

        Returns:
            The model response from the handler.
        """
        system_prompt = self._build_system_prompt(request)
        return await handler(request.override(system_prompt=system_prompt))
