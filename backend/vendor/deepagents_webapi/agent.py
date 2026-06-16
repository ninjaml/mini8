"""Agent management and creation for the CLI."""

import os
import platform
from datetime import datetime
from pathlib import Path
from typing import Optional

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend
from deepagents.backends.filesystem import FilesystemBackend
from langchain.agents.middleware import InterruptOnConfig
from langchain.agents.middleware.types import AgentState
from langchain.messages import ToolCall
from langchain.tools import BaseTool
from langchain_core.language_models import BaseChatModel
from langgraph.pregel import Pregel
from langgraph.runtime import Runtime

from deepagents_webapi.agent_memory import AgentMemoryMiddleware
from deepagents_webapi.config import (
    config,
    get_default_agent_rules,
    get_default_identity,
    get_default_tools_description,
    settings,
)
from deepagents_webapi.shell_factory import create_shell_middleware
from deepagents_webapi.skills import SkillsMiddleware


def get_system_prompt(assistant_id: str, working_dir: str | None = None) -> str:
    """Get the base system prompt for the agent.

    Args:
        assistant_id: The agent identifier for path references
        working_dir: Working directory for the agent. If None, uses Path.cwd()

    Returns:
        The system prompt string (without agent.md content)
    """
    from deepagents_webapi.config import settings as _da_settings
    agent_dir_path = str(_da_settings.get_agent_dir(assistant_id))

    if not working_dir:
        working_dir = str(Path.cwd())
    else:
        working_dir = str(Path(working_dir).resolve())
            
    os_name = platform.system()
    os_info = f"{os_name} {platform.release()}"
    
    now = datetime.now()
    current_time = now.strftime("%Y-%m-%d %A %H:%M")
    
    working_dir_section = f"""<env>
Working directory: {working_dir}
Operating system: {os_info}
Current date and time: {current_time}
</env>

### Current Working Directory

The filesystem backend is currently operating in: `{working_dir}`

### Operating System Information

You are running on **{os_info}**.

**Important path handling notes:**
- **Windows systems**: Use backslashes (`\\`) for file paths (e.g., `{working_dir}\\file.txt`)
- **Linux/macOS systems**: Use forward slashes (`/`) for file paths (e.g., `{working_dir}/file.txt`)
- **Shell commands**: On Windows with Git Bash, commands run via Git Bash supporting Linux-style commands
- **Path separator**: Always use the correct path separator for the current operating system

### File System and Paths

**IMPORTANT - Path Handling:**
- All file paths must be absolute paths
- Use the working directory from <env> to construct absolute paths
- Example: To create a file in your working directory, use `{working_dir}\\research_project\\file.md` for Windows, or `{working_dir}/research_project/file.md` for Linux/macOS
- Never use relative paths - always construct full absolute paths

"""

    return (
        working_dir_section
        + f"""### Skills Directory

Your skills are stored at: `{agent_dir_path}/skills/`
Skills may contain scripts or supporting files. When executing skill scripts with bash, use the real filesystem path:
Example: `bash python {agent_dir_path}/skills/web-research/script.py`

### Human-in-the-Loop Tool Approval

Some tool calls require user approval before execution. When a tool call is rejected by the user:
1. Accept their decision immediately - do NOT retry the same command
2. Explain that you understand they rejected the action
3. Suggest an alternative approach or ask for clarification
4. Never attempt the exact same rejected command again

Respect the user's decisions and work with them collaboratively.

### Web Search Tool Usage

When you use the web_search tool:
1. The tool will return search results with titles, URLs, and content excerpts
2. You MUST read and process these results, then respond naturally to the user
3. NEVER show raw JSON or tool results directly to the user
4. Synthesize the information from multiple sources into a coherent answer
5. Cite your sources by mentioning page titles or URLs when relevant
6. If the search doesn't find what you need, explain what you found and ask clarifying questions

The user only sees your text responses - not tool results. Always provide a complete, natural language answer after using web_search.

### Todo List Management

When using the write_todos tool:
1. Keep the todo list MINIMAL - aim for 3-6 items maximum
2. Only create todos for complex, multi-step tasks that truly need tracking
3. Break down work into clear, actionable items without over-fragmenting
4. For simple tasks (1-2 steps), just do them directly without creating todos
5. When first creating a todo list for a task, ALWAYS ask the user if the plan looks good before starting work
   - Create the todos, let them render, then ask: "Does this plan look good?" or similar
   - Wait for the user's response before marking the first todo as in_progress
   - If they want changes, adjust the plan accordingly
6. Update todo status promptly as you complete each item

The todo list is a planning tool - use it judiciously to avoid overwhelming the user with excessive task tracking."""
    )


def _format_write_file_description(
    tool_call: ToolCall, _state: AgentState, _runtime: Runtime
) -> str:
    """Format write_file tool call for approval prompt."""
    args = tool_call["args"]
    file_path = args.get("file_path", "unknown")
    content = args.get("content", "")

    action = "Overwrite" if Path(file_path).exists() else "Create"
    line_count = len(content.splitlines())
    
    # Base description
    description = f"File: {file_path}\nAction: {action} file\nLines: {line_count}"
    
    return description


def _format_edit_file_description(
    tool_call: ToolCall, _state: AgentState, _runtime: Runtime
) -> str:
    """Format edit_file tool call for approval prompt."""
    args = tool_call["args"]
    file_path = args.get("file_path", "unknown")
    replace_all = bool(args.get("replace_all", False))
      
    return (
        f"File: {file_path}\n"
        f"Action: Replace text ({'all occurrences' if replace_all else 'single occurrence'})"
    )


def _format_web_search_description(
    tool_call: ToolCall, _state: AgentState, _runtime: Runtime
) -> str:
    """Format web_search tool call for approval prompt."""
    args = tool_call["args"]
    query = args.get("query", "unknown")
    max_results = args.get("max_results", 5)

    return f"Query: {query}\nMax results: {max_results}\n\nWARNING: This will use Tavily API credits"


def _format_fetch_url_description(
    tool_call: ToolCall, _state: AgentState, _runtime: Runtime
) -> str:
    """Format fetch_url tool call for approval prompt."""
    args = tool_call["args"]
    url = args.get("url", "unknown")
    timeout = args.get("timeout", 30)

    return f"URL: {url}\nTimeout: {timeout}s\n\nWARNING: Will fetch and convert web content to markdown"


def _format_task_description(tool_call: ToolCall, _state: AgentState, _runtime: Runtime) -> str:
    """Format task (subagent) tool call for approval prompt.

    The task tool signature is: task(description: str, subagent_type: str)
    The description contains all instructions that will be sent to the subagent.
    """
    args = tool_call["args"]
    description = args.get("description", "unknown")
    subagent_type = args.get("subagent_type", "unknown")

    # Truncate description if too long for display
    description_preview = description
    if len(description) > 500:
        description_preview = description[:500] + "..."

    return (
        f"Subagent Type: {subagent_type}\n\n"
        f"Task Instructions:\n"
        f"{'─' * 40}\n"
        f"{description_preview}\n"
        f"{'─' * 40}\n\n"
        f"WARNING: Subagent will have access to file operations and shell commands"
    )


def _format_shell_description(tool_call: ToolCall, _state: AgentState, _runtime: Runtime) -> str:
    """Format shell tool call for approval prompt."""
    args = tool_call["args"]
    command = args.get("command", "N/A")
    # 注意：这里的working_dir应该从runtime或state中获取，暂时保持原样
    return f"Shell Command: {command}\nWorking Directory: {Path.cwd()}"


def _format_execute_description(tool_call: ToolCall, _state: AgentState, _runtime: Runtime) -> str:
    """Format execute tool call for approval prompt."""
    args = tool_call["args"]
    command = args.get("command", "N/A")
    return f"Execute Command: {command}\nLocation: Remote Sandbox"


def _add_interrupt_on() -> dict[str, InterruptOnConfig]:
    """Configure human-in-the-loop interrupt_on settings for destructive tools."""
    shell_interrupt_config: InterruptOnConfig = {
        "allowed_decisions": ["approve", "reject"],
        "description": _format_shell_description,
    }

    execute_interrupt_config: InterruptOnConfig = {
        "allowed_decisions": ["approve", "reject"],
        "description": _format_execute_description,
    }

    write_file_interrupt_config: InterruptOnConfig = {
        "allowed_decisions": ["approve", "reject"],
        "description": _format_write_file_description,
    }

    edit_file_interrupt_config: InterruptOnConfig = {
        "allowed_decisions": ["approve", "reject"],
        "description": _format_edit_file_description,
    }

    web_search_interrupt_config: InterruptOnConfig = {
        "allowed_decisions": ["approve", "reject"],
        "description": _format_web_search_description,
    }

    fetch_url_interrupt_config: InterruptOnConfig = {
        "allowed_decisions": ["approve", "reject"],
        "description": _format_fetch_url_description,
    }

    task_interrupt_config: InterruptOnConfig = {
        "allowed_decisions": ["approve", "reject"],
        "description": _format_task_description,
    }
    return {
        "shell": shell_interrupt_config,
        "execute": execute_interrupt_config,
        "write_file": write_file_interrupt_config,
        "edit_file": edit_file_interrupt_config,
        "web_search": web_search_interrupt_config,
        "fetch_url": fetch_url_interrupt_config,
        "task": task_interrupt_config,
    }


def create_agent_with_config(
    model: str | BaseChatModel,
    assistant_id: str,
    tools: list[BaseTool],
    *,
    thread_id: Optional[str] = None,
    checkpointer=None,
    working_dir: Optional[str] = None,
) -> tuple[Pregel, CompositeBackend]:
    """Create and configure an agent with the specified model and tools.

    Args:
        model: LLM model to use
        assistant_id: Agent identifier for memory storage
        tools: Additional tools to provide to agent
        thread_id: Optional thread ID for session resumption
        checkpointer: Optional pre-created checkpointer instance
        working_dir: Optional working directory for the agent. If None, uses CamphorOS project root

    Returns:
        2-tuple of graph and backend
    """
    if working_dir is None:
        working_dir = str(settings.project_root or settings.user_deepagents_dir.parent)
    
    agent_dir = settings.ensure_agent_dir(assistant_id)
    
    identity_path = agent_dir / "identity.md"
    if not identity_path.exists():
        import sys
        sys.stderr.write(f"DEBUG: Writing identity.md to {identity_path}\n")
        sys.stderr.flush()
        identity_path.write_text(get_default_identity(), encoding='utf-8')

    agent_rules_path = agent_dir / "agent.md"
    if not agent_rules_path.exists():
        import sys
        sys.stderr.write(f"DEBUG: Writing agent.md to {agent_rules_path}\n")
        sys.stderr.flush()
        agent_rules_path.write_text(get_default_agent_rules(), encoding='utf-8')

    tools_path = agent_dir / "tools.md"
    if not tools_path.exists():
        import sys
        sys.stderr.write(f"DEBUG: Writing tools.md to {tools_path}\n")
        sys.stderr.flush()
        tools_path.write_text(get_default_tools_description(), encoding='utf-8')

    skills_dir = settings.ensure_user_skills_dir(assistant_id)
    project_skills_dir = settings.get_project_skills_dir()

    composite_backend = CompositeBackend(
        default=FilesystemBackend(),
        routes={},
    )

    agent_middleware = [
        AgentMemoryMiddleware(settings=settings, assistant_id=assistant_id),
        SkillsMiddleware(
            skills_dir=skills_dir,
            assistant_id=assistant_id,
            project_skills_dir=project_skills_dir,
        ),
        create_shell_middleware(
            workspace_root=working_dir,
            env=os.environ,
        ),
    ]

    system_prompt = get_system_prompt(
        assistant_id=assistant_id, 
        working_dir=working_dir
    )

    interrupt_on = _add_interrupt_on()

    # 如何没有保存器就换成内存保存
    if not checkpointer:
        # 默认使用内存存储
        from langgraph.checkpoint.memory import InMemorySaver
        checkpointer = InMemorySaver()
    
    # 设置thread_id
    if thread_id:
        config["configurable"] = {"thread_id": thread_id}

    agent = create_deep_agent(
        model=model,
        system_prompt=system_prompt,
        tools=tools,
        backend=composite_backend,
        middleware=agent_middleware,
        interrupt_on=interrupt_on,
        checkpointer=checkpointer,
    ).with_config(config)

    

    return agent, composite_backend
