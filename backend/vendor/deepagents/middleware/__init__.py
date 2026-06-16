"""Middleware for the DeepAgent."""

from deepagents.middleware.auto_gui import AutoGuiMiddleware
from deepagents.middleware.browser import BrowserMiddleware
from deepagents.middleware.filesystem import FilesystemMiddleware
from deepagents.middleware.filesystem_linux import FilesystemMiddleware as FilesystemLinuxMiddleware
from deepagents.middleware.subagents import CompiledSubAgent, SubAgent, SubAgentMiddleware
from deepagents.middleware.deepseek_summarization import DeepSeekSummarizationMiddleware

__all__ = [
    "AutoGuiMiddleware",
    "BrowserMiddleware",
    "CompiledSubAgent",
    "FilesystemMiddleware",
    "FilesystemLinuxMiddleware",
    "SubAgent",
    "SubAgentMiddleware",
    "DeepSeekSummarizationMiddleware",
]
