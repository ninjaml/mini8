"""Factory for creating platform-appropriate FilesystemMiddleware instances."""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from typing import Any
    from langchain.agents.middleware.types import AgentMiddleware, AgentState


def create_filesystem_middleware(
    *,
    backend: Any | None = None,
    system_prompt: str | None = None,
    custom_tool_descriptions: dict[str, str] | None = None,
    tool_token_limit_before_evict: int | None = 20000,
) -> AgentMiddleware[AgentState, Any]:
    """Create a FilesystemMiddleware instance appropriate for the current platform.
    
    Args:
        backend: Backend for file storage and optional execution. If not provided,
            defaults to StateBackend (ephemeral storage in agent state).
        system_prompt: Optional custom system prompt override.
        custom_tool_descriptions: Optional custom tool descriptions override.
        tool_token_limit_before_evict: Optional token limit before evicting a tool
            result to the filesystem. Defaults to 20000.
    
    Returns:
        An initialized FilesystemMiddleware instance appropriate for the current platform.
    """
    if sys.platform == "win32":
        return _create_windows_filesystem_middleware(
            backend=backend,
            system_prompt=system_prompt,
            custom_tool_descriptions=custom_tool_descriptions,
            tool_token_limit_before_evict=tool_token_limit_before_evict,
        )
    else:
        return _create_linux_filesystem_middleware(
            backend=backend,
            system_prompt=system_prompt,
            custom_tool_descriptions=custom_tool_descriptions,
            tool_token_limit_before_evict=tool_token_limit_before_evict,
        )


def _create_windows_filesystem_middleware(
    *,
    backend: Any | None = None,
    system_prompt: str | None = None,
    custom_tool_descriptions: dict[str, str] | None = None,
    tool_token_limit_before_evict: int | None = 20000,
) -> AgentMiddleware[AgentState, Any]:
    """Create Windows-specific FilesystemMiddleware instance."""
    from .filesystem import FilesystemMiddleware
    
    return FilesystemMiddleware(
        backend=backend,
        system_prompt=system_prompt,
        custom_tool_descriptions=custom_tool_descriptions,
        tool_token_limit_before_evict=tool_token_limit_before_evict,
    )


def _create_linux_filesystem_middleware(
    *,
    backend: Any | None = None,
    system_prompt: str | None = None,
    custom_tool_descriptions: dict[str, str] | None = None,
    tool_token_limit_before_evict: int | None = 20000,
) -> AgentMiddleware[AgentState, Any]:
    """Create Linux/Unix-specific FilesystemMiddleware instance."""
    from .filesystem_linux import FilesystemMiddleware
    
    return FilesystemMiddleware(
        backend=backend,
        system_prompt=system_prompt,
        custom_tool_descriptions=custom_tool_descriptions,
        tool_token_limit_before_evict=tool_token_limit_before_evict,
    )


# For backward compatibility and easier imports
__all__ = ["create_filesystem_middleware"]