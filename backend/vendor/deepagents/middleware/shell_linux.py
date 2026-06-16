"""Linux/Unix shell middleware with UTF-8 encoding support and shell detection.

This middleware provides shell access for Linux and Unix-like systems (including macOS).
It detects available shells and ensures proper UTF-8 encoding for command output.
"""

from __future__ import annotations

import os
import sys
import subprocess
import threading
from typing import Any

from langchain.agents.middleware.types import AgentMiddleware, AgentState
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import ToolMessage
from langchain_core.tools.base import ToolException


class ShellMiddleware(AgentMiddleware[AgentState, Any]):
    """Linux/Unix shell access for agents with UTF-8 encoding support.

    This shell will execute on Linux/Unix systems using the system default shell
    (bash/sh) and has NO safeguards except for the human in the loop safeguard
    provided by the CLI itself.

    Key features:
    1. Shell detection - validates that bash/sh is available
    2. UTF-8 encoding support - sets PYTHONIOENCODING='utf-8'
    3. Output truncation - prevents memory issues with large outputs
    4. Consistent error handling - always returns ToolMessage format
    5. Non-blocking execution - long-running commands run in background after initial timeout

    Note: For Windows systems, use shell.py instead.
    """

    def __init__(
        self,
        *,
        workspace_root: str,
        timeout: float = 120.0,
        initial_timeout: float = 10.0,
        max_output_bytes: int = 100_000,
        env: dict[str, str] | None = None,
    ) -> None:
        """Initialize an instance of `ShellMiddleware`.

        Args:
            workspace_root: Working directory for shell commands.
            timeout: Maximum time in seconds to wait for command completion (hard limit).
                Defaults to 120 seconds.
            initial_timeout: Time in seconds to wait before returning partial output
                for long-running commands. Defaults to 10 seconds.
            max_output_bytes: Maximum number of bytes to capture from command output.
                Defaults to 100,000 bytes.
            env: Environment variables to pass to the subprocess. If None,
                uses the current process's environment. Defaults to None.
        """
        super().__init__()

        # Linux/Unix-only check
        if sys.platform == "win32":
            raise ToolException("This shell middleware is designed for Linux/Unix systems only. Use shell.py for Windows.")

        self._timeout = timeout
        self._initial_timeout = initial_timeout
        self._max_output_bytes = max_output_bytes
        self._tool_name = "shell"
        self._env = env if env is not None else os.environ.copy()
        # 添加编码环境变量
        self._env['PYTHONIOENCODING'] = 'utf-8'
        self._workspace_root = workspace_root

        # 检测可用 shell
        self._detect_available_shells()

        # Build description with working directory information
        description = (
            f"Shell (bash/sh). Working directory: {workspace_root}."
            f"\nCommands not finished within {initial_timeout:.0f}s run in background (returns PID). Do NOT re-run background commands."
            "\nUse 'kill -0 <PID>' to check if alive, 'kill <PID>' to stop."
        )

        @tool(self._tool_name, description=description)
        def shell_tool(
            command: str,
            runtime: ToolRuntime[None, AgentState],
        ) -> ToolMessage | str:
            """Execute a shell command.

            Args:
                command: The shell command to execute.
                runtime: The tool runtime context.
            """
            return self._run_shell_command(command, tool_call_id=runtime.tool_call_id)

        self._shell_tool = shell_tool
        self.tools = [self._shell_tool]

    def _detect_available_shells(self) -> None:
        """检测可用 shell，如果没有找到则抛出 ToolException"""
        common_shells = [
            "/bin/bash", "/usr/bin/bash", "/bin/sh", "/usr/bin/sh",
            "/bin/bash", "/bin/sh",
            "/usr/local/bin/bash", "/opt/homebrew/bin/bash",
            "/opt/local/bin/bash",
        ]
        available = [s for s in common_shells if os.path.exists(s)]
        if not available:
            raise ToolException(
                "No common shell found in standard locations. "
                "Please ensure bash or sh is installed and available."
            )

    def _run_shell_command(
        self,
        command: str,
        *,
        tool_call_id: str | None,
    ) -> ToolMessage | str:
        """Execute a shell command and return the result.

        Uses Popen for non-blocking execution. If the command finishes within
        the initial timeout, returns full output. Otherwise returns partial
        output and lets the command continue in background.

        Args:
            command: The shell command to execute.
            tool_call_id: The tool call ID for creating a ToolMessage.

        Returns:
            A ToolMessage with the command output or an error message.
        """
        if not command or not isinstance(command, str):
            msg = "Shell tool expects a non-empty command string."
            return ToolMessage(
                content=f"ERROR: {msg}",
                tool_call_id=tool_call_id,
                name=self._tool_name,
                status="error",
            )

        try:
            proc = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=True,
                text=True,
                env=self._env,
                cwd=self._workspace_root,
            )

            # Collect output in threads to avoid pipe deadlock
            stdout_chunks: list[str] = []
            stderr_chunks: list[str] = []

            def _read_stream(stream, chunks: list[str]):
                """Read from a stream in a thread."""
                try:
                    while True:
                        data = stream.read(4096)
                        if not data:
                            break
                        chunks.append(data)
                except (OSError, ValueError):
                    pass

            stdout_thread = threading.Thread(
                target=_read_stream, args=(proc.stdout, stdout_chunks), daemon=True
            )
            stderr_thread = threading.Thread(
                target=_read_stream, args=(proc.stderr, stderr_chunks), daemon=True
            )
            stdout_thread.start()
            stderr_thread.start()

            # Wait for initial timeout
            proc.wait(timeout=self._initial_timeout)

            # Process finished within initial timeout
            stdout_thread.join(timeout=2.0)
            stderr_thread.join(timeout=2.0)

            stdout_text = "".join(stdout_chunks)
            stderr_text = "".join(stderr_chunks)

            return self._build_output(
                stdout_text, stderr_text,
                returncode=proc.returncode,
                tool_call_id=tool_call_id,
                background=False,
                pid=None,
            )

        except subprocess.TimeoutExpired:
            # Process still running after initial timeout
            stdout_thread.join(timeout=1.0)
            stderr_thread.join(timeout=1.0)

            stdout_text = "".join(stdout_chunks)
            stderr_text = "".join(stderr_chunks)

            pid = proc.pid

            return self._build_output(
                stdout_text, stderr_text,
                returncode=None,
                tool_call_id=tool_call_id,
                background=True,
                pid=pid,
            )

        except Exception as e:
            return ToolMessage(
                content=f"ERROR: Failed to execute command: {e}",
                tool_call_id=tool_call_id,
                name=self._tool_name,
                status="error",
            )

    def _build_output(
        self,
        stdout_text: str,
        stderr_text: str,
        *,
        returncode: int | None,
        tool_call_id: str | None,
        background: bool,
        pid: int | None,
    ) -> ToolMessage:
        """Build the output ToolMessage from stdout/stderr.

        Args:
            stdout_text: Stdout string.
            stderr_text: Stderr string.
            returncode: Process return code (None if still running).
            tool_call_id: The tool call ID.
            background: Whether the command is still running in background.
            pid: Process ID if running in background.

        Returns:
            A ToolMessage.
        """
        output_parts = []
        if stdout_text:
            output_parts.append(stdout_text)
        if stderr_text:
            stderr_lines = stderr_text.strip().split("\n")
            for line in stderr_lines:
                output_parts.append(f"[stderr] {line}")

        if not output_parts:
            if background:
                output_parts.append("(命令已启动，暂无输出)")
            else:
                output_parts.append("<no output>")

        output = "\n".join(output_parts)

        # Truncate if needed
        if len(output) > self._max_output_bytes:
            output = output[:self._max_output_bytes]
            output += f"\n\n... Output truncated at {self._max_output_bytes} bytes."

        if background:
            output += f"\n\n后台运行中（PID: {pid}）。请勿重复执行。"
            output += f"\n检查: kill -0 {pid} | 终止: kill {pid}"
            status = "success"
        else:
            if returncode is not None and returncode != 0:
                output = f"{output.rstrip()}\n\nExit code: {returncode}"
                status = "error"
            else:
                status = "success"

        return ToolMessage(
            content=output,
            tool_call_id=tool_call_id,
            name=self._tool_name,
            status=status,
        )


__all__ = ["ShellMiddleware"]
