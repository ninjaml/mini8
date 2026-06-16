from urllib.parse import urljoin

import httpx


class EnterpriseKnowledgeError(RuntimeError):
    pass


# 模块级缓存，运行时只从数据库 kb_config 表读取，不再回退到 config.py
_R2R_BASE_URL: str | None = None


def set_r2r_base_url(url: str | None) -> None:
    global _R2R_BASE_URL
    _R2R_BASE_URL = url


def check_r2r_reachable() -> bool:
    """发轻量 HTTP 请求探测 R2R 服务是否真正可达。"""
    if not _R2R_BASE_URL:
        return False
    # R2R v3 健康检查端点优先尝试 /v3/health，其次 /health
    for path in ("api/v3/health", "api/health"):
        try:
            url = urljoin(_R2R_BASE_URL.rstrip("/") + "/", path)
            resp = httpx.get(url, timeout=3.0)
            # 2xx / 3xx / 401 / 403 都算可达（401/403 说明是 R2R 但可能需要认证）
            # 404 说明端口上有其他服务但不是 R2R，继续试下一个路径
            if resp.status_code < 400 or resp.status_code in (401, 403):
                return True
        except httpx.ConnectError:
            continue
        except httpx.TimeoutException:
            continue
        except Exception:
            continue
    return False


def _r2r_request(
    method: str,
    path: str,
    primary_key: str,
    json: dict | None = None,
    params: dict | None = None,
    files: dict | None = None,
    data: dict | None = None,
    timeout: float = 60.0,
) -> dict:
    if not _R2R_BASE_URL:
        raise EnterpriseKnowledgeError("知识库未配置，请先在系统中配置 R2R 连接地址")
    url = urljoin(_R2R_BASE_URL.rstrip("/") + "/", path.lstrip("/"))
    headers = {"Authorization": f"Bearer dev:{primary_key}"}
    try:
        response = httpx.request(
            method, url, headers=headers, json=json, params=params,
            files=files, data=data, timeout=timeout,
        )
        if response.status_code >= 400:
            detail = response.text[:500]
            raise EnterpriseKnowledgeError(f"知识引擎请求失败 {response.status_code}: {detail}")
        return response.json() if response.content else {}
    except httpx.TimeoutException:
        raise EnterpriseKnowledgeError("知识引擎请求超时，请稍后重试")
    except httpx.ConnectError:
        raise EnterpriseKnowledgeError(f"无法连接到知识引擎服务（{_R2R_BASE_URL or '未配置'}），请确认服务是否已启动")
    except httpx.HTTPError as exc:
        raise EnterpriseKnowledgeError(f"知识引擎请求发生错误: {exc}")


def search_enterprise(
    query: str,
    primary_key: str,
    collection_ids: list[str] | None = None,
    limit: int = 10,
    use_hybrid_search: bool = False,
    use_graph_search: bool = False,
    graph_limits: dict | None = None,
) -> dict:
    payload: dict = {
        "query": query,
        "collection_ids": [int(cid) for cid in collection_ids] if collection_ids else None,
        "limit": limit,
        "use_hybrid_search": use_hybrid_search,
        "use_graph_search": use_graph_search,
    }
    if use_graph_search:
        payload["graph_limits"] = {
            "entity": graph_limits.get("entity", 10) if graph_limits else 10,
            "relationship": graph_limits.get("relationship", 10) if graph_limits else 10,
            "community": graph_limits.get("community", 5) if graph_limits else 5,
        }
    print(f"[search_enterprise] payload={payload}")
    result = _r2r_request("POST", "/api/retrieval/search", primary_key=primary_key, json=payload)
    inner_keys = list(result.get("results", {}).keys()) if isinstance(result, dict) and "results" in result else []
    print(f"[search_enterprise] results inner_keys={inner_keys}")
    return result


def rag_enterprise(
    query: str,
    primary_key: str,
    collection_ids: list[str] | None = None,
    limit: int = 10,
    use_hybrid_search: bool = False,
    use_graph_search: bool = False,
    graph_limits: dict | None = None,
) -> dict:
    payload: dict = {
        "query": query,
        "collection_ids": [int(cid) for cid in collection_ids] if collection_ids else None,
        "limit": limit,
        "use_hybrid_search": use_hybrid_search,
        "use_graph_search": use_graph_search,
        "rag_generation_config": {
            "model": "openai/deepseek-v4-flash",
            "temperature": 0,
            "top_p": 1,
            "max_tokens_to_sample": 1024,
            "stream": False,
            "api_base": "https://api.deepseek.com",
        },
    }
    if use_graph_search:
        payload["graph_limits"] = {
            "entity": graph_limits.get("entity", 10) if graph_limits else 10,
            "relationship": graph_limits.get("relationship", 10) if graph_limits else 10,
            "community": graph_limits.get("community", 5) if graph_limits else 5,
        }
    print(f"[rag_enterprise] payload={payload}")
    result = _r2r_request("POST", "/api/retrieval/rag", primary_key=primary_key, json=payload)
    inner_keys = list(result.get("results", {}).keys()) if isinstance(result, dict) and "results" in result else []
    print(f"[rag_enterprise] results inner_keys={inner_keys}")
    return result


def list_enterprise_collections(primary_key: str) -> list[dict]:
    resp = _r2r_request("GET", "/api/collections", primary_key=primary_key)
    if isinstance(resp, list):
        return resp
    return resp.get("results", [])


def list_enterprise_folders(primary_key: str, collection_id: int) -> list[dict]:
    resp = _r2r_request("GET", f"/api/collections/{collection_id}/folders", primary_key=primary_key)
    if isinstance(resp, list):
        return resp
    return resp.get("results", resp)


def list_enterprise_documents(
    primary_key: str,
    collection_id: int,
    folder_id: int | None = None,
    root_only: bool = False,
    keyword: str | None = None,
    mime_type: str | None = None,
) -> list[dict]:
    params = {}
    if folder_id is not None:
        params["folder_id"] = folder_id
    if root_only:
        params["root_only"] = "true"
    if keyword:
        params["keyword"] = keyword
    if mime_type:
        params["mime_type"] = mime_type
    resp = _r2r_request(
        "GET",
        f"/api/collections/{collection_id}/documents",
        primary_key=primary_key,
        params=params or None,
    )
    if isinstance(resp, list):
        return resp
    return resp.get("results", resp)


def download_enterprise_document(primary_key: str, document_id: int) -> tuple[bytes, str]:
    if not _R2R_BASE_URL:
        raise EnterpriseKnowledgeError("知识库未配置，请先在系统中配置 R2R 连接地址")
    url = urljoin(_R2R_BASE_URL.rstrip("/") + "/", f"api/documents/{document_id}/download")
    headers = {"Authorization": f"Bearer dev:{primary_key}"}
    try:
        response = httpx.request("GET", url, headers=headers, timeout=60.0)
        if response.status_code >= 400:
            raise EnterpriseKnowledgeError(f"知识引擎请求失败 {response.status_code}")
        content_type = response.headers.get("content-type", "application/octet-stream")
        return response.content, content_type
    except httpx.TimeoutException:
        raise EnterpriseKnowledgeError("知识引擎请求超时")
    except httpx.RequestError as exc:
        raise EnterpriseKnowledgeError(f"知识引擎连接失败: {exc}")


def upload_enterprise_document(
    primary_key: str,
    collection_id: int,
    file_name: str,
    file_content: bytes,
    content_type: str,
    folder_id: int | None = None,
) -> dict:
    import json as _json

    if not _R2R_BASE_URL:
        raise EnterpriseKnowledgeError("知识库未配置，请先在系统中配置 R2R 连接地址")
    url = urljoin(_R2R_BASE_URL.rstrip("/") + "/", f"api/collections/{collection_id}/documents")
    headers = {"Authorization": f"Bearer dev:{primary_key}"}
    files = {"file": (file_name, file_content, content_type)}
    data_fields = {
        "metadata": _json.dumps({}),
        "collection_ids": _json.dumps([str(collection_id)]),
        "ingestion_mode": "fast",
    }
    if folder_id is not None:
        data_fields["folder_id"] = _json.dumps(folder_id)
    try:
        response = httpx.request("POST", url, headers=headers, files=files, data=data_fields, timeout=120.0)
        if response.status_code >= 400:
            raise EnterpriseKnowledgeError(f"上传失败 {response.status_code}: {response.text[:500]}")
        return response.json()
    except httpx.TimeoutException:
        raise EnterpriseKnowledgeError("上传超时")
    except httpx.RequestError as exc:
        raise EnterpriseKnowledgeError(f"上传连接失败: {exc}")
