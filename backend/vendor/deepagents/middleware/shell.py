"""Windows Git Bash shell middleware with universal encoding support."""

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
    """Windows Git Bash shell access for agents with universal encoding support.
    
    This shell will execute on the local Windows machine using Git Bash and has NO safeguards except
    for the human in the loop safeguard provided by the CLI itself.
    Supports: Git Bash on Windows only.
    
    Key features:
    1. Universal encoding detection - tries multiple Windows encodings to decode output
    2. Git Bash command execution on Windows
    3. Robust error handling for encoding issues
    4. Windows Git Bash path format handling
    5. Non-blocking execution - long-running commands run in background after initial timeout
    """

    def _detect_git_bash(self) -> str | None:
        """Dynamically detect Git Bash installation path on Windows."""
        try:
            result = subprocess.run(
                ["where", "git"],
                capture_output=True,
                text=False,
                shell=True,
                timeout=5.0
            )
            if result.returncode == 0 and result.stdout:
                output = self._decode_bytes(result.stdout)
                lines = output.strip().split('\n')
                if lines:
                    git_path = lines[0].strip()
                    git_dir = os.path.dirname(git_path)
                    if git_dir.endswith('\\cmd') or git_dir.endswith('/cmd'):
                        git_install_dir = os.path.dirname(git_dir)
                        bash_path = os.path.join(git_install_dir, "bin", "bash.exe")
                        if os.path.exists(bash_path):
                            return bash_path
        except (subprocess.SubprocessError, FileNotFoundError, IndexError):
            pass
        common_paths = [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
            r"C:\Git\bin\bash.exe",
        ]
        for path in common_paths:
            if os.path.exists(path):
                return path
        return None

    def __init__(
        self,
        *,
        workspace_root: str,
        timeout: float = 120.0,
        initial_timeout: float = 10.0,
        max_output_bytes: int = 100_000,
        env: dict[str, str] | None = None,
    ) -> None:
        """Initialize an instance of `ShellMiddleware` for Windows Git Bash.

        Args:
            workspace_root: Working directory for shell commands.
            timeout: Maximum time in seconds to wait for command completion (hard limit).
                Defaults to 120 seconds.
            initial_timeout: Time in seconds to wait before returning partial output
                for long-running commands. If the command finishes within this time,
                full output is returned. Otherwise, collected output is returned and
                the command continues in background. Defaults to 10 seconds.
            max_output_bytes: Maximum number of bytes to capture from command output.
                Defaults to 100,000 bytes.
            env: Environment variables to pass to the subprocess. If None,
                uses the current process's environment. Defaults to None.
        """
        super().__init__()
        self._timeout = timeout
        self._initial_timeout = initial_timeout
        self._max_output_bytes = max_output_bytes
        self._tool_name = "shell"
        self._env = env if env is not None else os.environ.copy()
                
        # Ensure workspace_root is properly normalized for Windows
        # This fixes issues with Chinese characters in paths
        self._workspace_root = os.path.normpath(workspace_root)

        # Windows-only check
        if sys.platform != "win32":
            raise ToolException("This shell middleware is designed for Windows only.")

        # Git Bash setup
        self._git_bash_path = self._detect_git_bash()
        if not self._git_bash_path:
            raise ToolException("Git Bash not detected. Please install Git for Windows.")

        # Build description
        description = (
            f"Git Bash shell on Windows. Working directory: {workspace_root}."
            f"\nCommands not finished within {initial_timeout:.0f}s run in background (returns PID). Do NOT re-run background commands."
            "\nUse 'powershell -Command \"Get-Process -Id <PID>\"' to check, 'powershell -Command \"Stop-Process -Id <PID> -Force\"' to stop."
            "\nPaths: use /c/Users/... format (not C:\\). AVOID 'cmd /c' — use 'powershell -Command \"...\"' for Windows-native ops."
        )

        @tool(self._tool_name, description=description)
        def shell_tool(
            command: str,
            runtime: ToolRuntime[None, AgentState],
        ) -> ToolMessage | str:
            """Execute a Windows Git Bash shell command.

            Args:
                command: The Git Bash shell command to execute.
                runtime: The tool runtime context.
            """
            return self._run_shell_command(
                command,
                tool_call_id=runtime.tool_call_id
            )

        self._shell_tool = shell_tool
        self.tools = [self._shell_tool]

    def _decode_bytes(self, data: bytes) -> str:
        """Decode bytes data, trying common Windows encodings (no cache).

        Args:
            data: Byte data to decode

        Returns:
            Decoded string
        """
        if not data:
            return ""

        encodings_to_try = ['utf-8', 'gbk', 'gb2312', 'latin-1', 'ascii']

        for encoding in encodings_to_try:
            try:
                return data.decode(encoding)
            except UnicodeDecodeError:
                continue

        try:
            return data.decode('utf-8', errors='replace')
        except:
            return data.decode('latin-1', errors='replace')

    def _run_shell_command(
        self,
        command: str,
        *,
        tool_call_id: str | None,
    ) -> ToolMessage | str:
        """Execute a Windows Git Bash shell command and return the result.

        Uses Popen for non-blocking execution. If the command finishes within
        the initial timeout, returns full output. Otherwise returns partial
        output and lets the command continue in background.

        Args:
            command: The Git Bash shell command to execute.
            tool_call_id: The tool call ID for creating a ToolMessage.

        Returns:
            A ToolMessage with the command output or an error message.
        """
        if not command or not isinstance(command, str):
            msg = "Shell tool expects a non-empty command string."
            return self._create_error_message(msg, tool_call_id)

        try:
            # Prepare environment variables
            env = self._env.copy()
            env['PYTHONIOENCODING'] = 'utf-8'

            # Use Popen for non-blocking execution
            proc = subprocess.Popen(
                [self._git_bash_path, "-c", command],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                env=env,
                cwd=self._workspace_root,
            )

            # Collect output in threads to avoid pipe deadlock
            stdout_chunks: list[bytes] = []
            stderr_chunks: list[bytes] = []

            def _read_stream(stream, chunks: list[bytes]):
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

            # Wait for initial timeout — if process finishes, great
            proc.wait(timeout=self._initial_timeout)

            # Process finished within initial timeout — collect all output
            stdout_thread.join(timeout=2.0)
            stderr_thread.join(timeout=2.0)

            stdout_decoded = self._decode_bytes(b"".join(stdout_chunks))
            stderr_decoded = self._decode_bytes(b"".join(stderr_chunks))

            return self._build_output(
                stdout_decoded, stderr_decoded,
                returncode=proc.returncode,
                tool_call_id=tool_call_id,
                background=False,
                pid=None,
            )

        except subprocess.TimeoutExpired:
            # Process still running after initial timeout
            # Collect whatever output we have so far
            stdout_thread.join(timeout=1.0)
            stderr_thread.join(timeout=1.0)

            stdout_decoded = self._decode_bytes(b"".join(stdout_chunks))
            stderr_decoded = self._decode_bytes(b"".join(stderr_chunks))

            pid = proc.pid

            return self._build_output(
                stdout_decoded, stderr_decoded,
                returncode=None,
                tool_call_id=tool_call_id,
                background=True,
                pid=pid,
            )

        except Exception as e:
            msg = f"Failed to execute command: {e}"
            return self._create_error_message(msg, tool_call_id)

    def _build_output(
        self,
        stdout_decoded: str,
        stderr_decoded: str,
        *,
        returncode: int | None,
        tool_call_id: str | None,
        background: bool,
        pid: int | None,
    ) -> ToolMessage | str:
        """Build the output message from decoded stdout/stderr.

        Args:
            stdout_decoded: Decoded stdout string.
            stderr_decoded: Decoded stderr string.
            returncode: Process return code (None if still running).
            tool_call_id: The tool call ID.
            background: Whether the command is still running in background.
            pid: Process ID if running in background.

        Returns:
            A ToolMessage or plain string.
        """
        output_parts = []
        if stdout_decoded:
            output_parts.append(f"STDOUT:\n{stdout_decoded}")
        if stderr_decoded:
            output_parts.append(f"STDERR:\n{stderr_decoded}")

        if not output_parts:
            if background:
                output_parts.append("(命令已启动，暂无输出)")
            else:
                output_parts.append("(Command executed successfully with no output)")

        output = "\n\n".join(output_parts)

        # Truncate if needed
        if len(output) > self._max_output_bytes:
            output = output[:self._max_output_bytes]
            output += f"\n\n... Output truncated at {self._max_output_bytes} bytes."

        if background:
            output += f"\n\n后台运行中（PID: {pid}）。请勿重复执行。"
            output += f"\n检查: powershell -Command \"Get-Process -Id {pid}\""
            output += f"\n终止: powershell -Command \"Stop-Process -Id {pid} -Force\""
            status = "success"
        else:
            status = "error" if returncode != 0 else "success"
            if returncode is not None and returncode != 0:
                output = f"{output.rstrip()}\n\nExit code: {returncode}"

        if tool_call_id is not None:
            return ToolMessage(
                content=output,
                tool_call_id=tool_call_id,
                status=status,
            )
        else:
            return output

    def _create_error_message(self, error_msg: str, tool_call_id: str | None) -> ToolMessage | str:
        """Create an error message instead of throwing an exception."""
        content = f"ERROR: {error_msg}"
        if tool_call_id is not None:
            return ToolMessage(
                content=content,
                tool_call_id=tool_call_id,
                status="error",
            )
        else:
            return content


__all__ = ["ShellMiddleware"]
