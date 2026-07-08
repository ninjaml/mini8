"""
API 路由包。

这个包本身不负责自动注册路由；
真实挂载关系在 ``app/main.py`` 中显式完成。

``__all__`` 只是一个轻量导出列表，不代表当前后端所有已存在的 API 模块全集。
"""

__all__ = ["auth", "agents", "workspaces", "workspace_messages", "knowledge", "integrations"]

