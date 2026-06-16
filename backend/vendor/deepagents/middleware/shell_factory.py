"""Factory for creating platform-appropriate ShellMiddleware instances."""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from typing import Any
    from langchain.agents.middleware.types import AgentMiddleware, AgentState


def create_shell_middleware(
    *,
    workspace_root: str,
    timeout: float | None = None,
    max_output_bytes: int = 100_000,
    env: dict[str, str] | None = None,
) -> AgentMiddleware[AgentState, Any]:
    """Create a ShellMiddleware instance appropriate for the current platform.
    
    Args:
        workspace_root: Working directory for shell commands.
        timeout: Maximum time in seconds to wait for command completion.
            If None, uses default of 300 seconds for both Windows and Linux.
        max_output_bytes: Maximum number of bytes to capture from command output.
            Defaults to 100,000 bytes.
        env: Environment variables to pass to the subprocess. If None,
            uses the current process's environment. Defaults to None.
    
    Returns:
        An initialized ShellMiddleware instance appropriate for the current platform.
    
    Raises:
        ImportError: If the required platform-specific module cannot be imported.
        ToolException: If shell detection fails on the current platform.
    """
    if sys.platform == "win32":
        return _create_windows_shell_middleware(
            workspace_root=workspace_root,
            timeout=timeout,
            max_output_bytes=max_output_bytes,
            env=env,
        )
    else:
        return _create_unix_shell_middleware(
            workspace_root=workspace_root,
            timeout=timeout,
            max_output_bytes=max_output_bytes,
            env=env,
        )


def _create_windows_shell_middleware(
    *,
    workspace_root: str,
    timeout: float | None = None,
    max_output_bytes: int = 100_000,
    env: dict[str, str] | None = None,
) -> AgentMiddleware[AgentState, Any]:
    """Create Windows-specific ShellMiddleware instance."""
    from .shell import ShellMiddleware
    
    # Use default timeout if not specified
    if timeout is None:
        timeout = 300.0
    
    return ShellMiddleware(
        workspace_root=workspace_root,
        timeout=timeout,
        max_output_bytes=max_output_bytes,
        env=env,
    )


def _create_unix_shell_middleware(
    *,
    workspace_root: str,
    timeout: float | None = None,
    max_output_bytes: int = 100_000,
    env: dict[str, str] | None = None,
) -> AgentMiddleware[AgentState, Any]:
    """Create Unix/Linux-specific ShellMiddleware instance."""
    from .shell_linux import ShellMiddleware
    
    # Use default timeout if not specified
    if timeout is None:
        timeout = 300.0
    
    return ShellMiddleware(
        workspace_root=workspace_root,
        timeout=timeout,
        max_output_bytes=max_output_bytes,
        env=env,
    )


# For backward compatibility and easier imports
__all__ = ["create_shell_middleware"]