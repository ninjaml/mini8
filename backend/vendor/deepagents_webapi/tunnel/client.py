"""Tunnel client stubs.

CamphorOS 当前只做本地直连运行时，不启用旧项目里的网关 / 隧道能力。
旧路由仍然会导入 `get_active_tunnel_client`，因此这里提供一个最小 no-op 实现，
让上层状态上报逻辑自动降级为空操作。
"""


def get_active_tunnel_client():
    """Return no active tunnel client in local-only mode."""
    return None
