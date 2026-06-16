from sqlalchemy.orm import Session

from app.repositories.workspace import get_dashboard


"""
仪表盘服务模块。

目前仅做一层薄薄的代理，将仪表盘数据组装逻辑下沉到 repository 层，
后续若需聚合多个数据源（如统计、趋势图）可在此扩展。
"""


def build_workspace_dashboard(db: Session, workspace_id: int) -> dict:
    """
    获取指定工作空间的仪表盘数据。

    参数:
        db: 数据库会话。
        workspace_id: 工作空间主键。

    返回:
        包含仪表盘统计信息的字典（结构由 repository 层定义）。
    """
    return get_dashboard(db, workspace_id)
