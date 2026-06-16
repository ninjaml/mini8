"""Route package for vendored deepagents runtime.

这里不做聚合导入，避免把未启用模块的重依赖提前拉进来。
需要什么路由，就在接入层按文件显式导入。
"""
