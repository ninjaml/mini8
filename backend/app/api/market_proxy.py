"""
AI 市场 API 代理模块。

将所有 /api/market/* 请求转发到远程市场 API，解决前端 CORS 和下载问题。
API Base 从 config.py 读取，不暴露给前端。
"""

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

import httpx

from app.core.config import settings

router = APIRouter(prefix="/market", tags=["market"])

_market_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """获取或初始化市场 API 的 httpx 客户端（单例）。"""
    global _market_client
    if _market_client is None:
        _market_client = httpx.AsyncClient(
            base_url=f"{settings.MARKET_API_BASE}/api",
            timeout=httpx.Timeout(30.0, connect=5.0),
            follow_redirects=True,
        )
    return _market_client


# 请求头中不应转发的字段（由 HTTP 层自动管理）
_EXCLUDED_REQ_HEADERS = {"host", "content-length", "transfer-encoding", "connection"}

# 响应头中不应转发的字段
_EXCLUDED_RESP_HEADERS = {"content-encoding", "transfer-encoding", "connection", "content-length"}


@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def proxy_market(request: Request, path: str):
    """
    代理所有市场 API 请求到远程服务器。

    路径映射:
        /api/market/tags              → https://ep2048.cn/market/api/tags
        /api/market/skills            → https://ep2048.cn/market/api/skills
        /api/market/skills/{id}/download → 同上（返回文件 bytes）
    """
    client = _get_client()

    # 构建目标 URL（保留 query string）
    # 注意：httpx base_url 拼接时，target 不能以 / 开头，否则会替换整个 path
    target_url = path
    if request.query_params:
        target_url = f"{target_url}?{request.query_params}"

    # 转发请求头
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _EXCLUDED_REQ_HEADERS
    }

    # 读取请求体（如果有）
    body = await request.body()

    # 发送代理请求
    try:
        rp = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
        )
    except httpx.TimeoutException:
        return JSONResponse(
            status_code=504,
            content={"detail": "资源包服务响应超时，请稍后重试。"},
        )
    except httpx.HTTPError:
        return JSONResponse(
            status_code=502,
            content={"detail": "资源包服务暂时不可用，请稍后重试。"},
        )

    # 过滤响应头后返回
    # 使用 Response 而非 StreamingResponse，避免 chunked encoding 长度不匹配问题
    response_headers = {
        k: v
        for k, v in rp.headers.items()
        if k.lower() not in _EXCLUDED_RESP_HEADERS
    }

    return Response(
        content=rp.content,
        status_code=rp.status_code,
        headers=response_headers,
    )
