import json
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.models import WorkKnowledge


"""
Obsidian Local REST API 封装服务。

提供知识库配置解析、端口探测、目录遍历、文件读取等能力，
作为平台与本地 Obsidian 实例之间的协议适配层。
"""


def parse_knowledge_config(knowledge: WorkKnowledge) -> dict[str, Any]:
    """
    解析知识库 JSON 配置字段。

    参数:
        knowledge: 知识库 ORM 对象。

    返回:
        解析后的字典。

    异常:
        HTTPException(500): 配置损坏或格式错误。
    """
    raw = knowledge.knowledge_json or "{}"
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="知识库配置损坏，无法解析。") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="知识库配置格式错误。")
    return data


def get_obsidian_port(knowledge: WorkKnowledge) -> int:
    """
    从知识库配置中提取 Obsidian Local REST API 端口。

    异常:
        HTTPException(400): 端口未配置或格式无效。
    """
    config = parse_knowledge_config(knowledge)
    port = config.get("port")
    if port in (None, ""):
        raise HTTPException(status_code=400, detail="当前知识库没有配置本地端口。")
    try:
        return int(port)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="知识库端口格式无效。") from exc


def get_obsidian_api_key(knowledge: WorkKnowledge) -> str | None:
    """取知识库独立 API Key；若未配置则回退到全局默认值。"""
    config = parse_knowledge_config(knowledge)
    return config.get("api_key") or settings.OBSIDIAN_LOCAL_REST_API_KEY


def get_obsidian_vault_name(knowledge: WorkKnowledge) -> str | None:
    """取知识库配置中的 vault 名称，空值返回 None。"""
    config = parse_knowledge_config(knowledge)
    value = config.get("vault_name")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def get_obsidian_omnisearch_port(knowledge: WorkKnowledge) -> int | None:
    """取 Omnisearch 插件端口；未配置或空值时返回 None。"""
    config = parse_knowledge_config(knowledge)
    port = config.get("omnisearch_port")
    if port in (None, ""):
        return None
    try:
        return int(port)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Omnisearch 端口格式无效。") from exc


def get_obsidian_omnisearch_url(knowledge: WorkKnowledge) -> str:
    """构造 Omnisearch 服务根地址；端口未配置时返回空串。"""
    port = get_obsidian_omnisearch_port(knowledge)
    return f"http://127.0.0.1:{port}" if port else ""


def get_obsidian_base_url(port: int) -> str:
    """根据端口构造 Obsidian Local REST API 根地址。"""
    return f"http://127.0.0.1:{port}"


def build_headers(api_key: str | None) -> dict[str, str]:
    """根据 API Key 构建 Authorization 请求头；无 Key 时返回空字典。"""
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def safe_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
) -> httpx.Response:
    """
    同步发送 HTTP 请求到本地 Obsidian 服务。

    参数:
        method: HTTP 方法。
        url: 完整请求地址。
        headers: 可选请求头。
        params: 可选查询参数。

    返回:
        httpx Response 对象。

    异常:
        HTTPException(502): 本地服务无法连接。
    """
    try:
        with httpx.Client(verify=False, timeout=settings.OBSIDIAN_LOCAL_REST_TIMEOUT) as client:
            response = client.request(method, url, headers=headers, params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"无法连接本地 Obsidian 服务：{exc}") from exc
    return response


def extract_vault_name(payload: Any, port: int) -> str:
    """
    从 Obsidian 状态接口返回体中提取 vault 名称。
    兼容多种字段命名（vault_name / vaultName / vault / name）。
    均无法识别时，返回带端口的默认名称。
    """
    if isinstance(payload, dict):
        for key in ("vault_name", "vaultName", "vault", "name"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return f"Obsidian {port}"


def probe_obsidian_knowledge(port: int, api_key: str | None = None) -> dict[str, Any]:
    """
    探测指定端口的 Obsidian Local REST API 是否可用，并获取 vault 基本信息。

    参数:
        port: Obsidian 服务端口。
        api_key: 可选认证密钥。

    返回:
        包含 name 与 port 的字典。

    异常:
        HTTPException(400/401): 服务不可用、需要 API Key 或目录不可访问。
    """
    base_url = get_obsidian_base_url(port)
    status_response = safe_request("GET", f"{base_url}/", headers=build_headers(api_key))
    if status_response.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"端口 {port} 上没有可用的 Obsidian Local REST API。")

    status_payload: Any
    try:
        status_payload = status_response.json()
    except ValueError:
        status_payload = {}

    vault_probe = safe_request("GET", f"{base_url}/vault/", headers=build_headers(api_key))
    if vault_probe.status_code == 401:
        raise HTTPException(status_code=400, detail="Obsidian Local REST API 需要有效的 API Key。")
    if vault_probe.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"端口 {port} 上的知识库目录暂时不可访问。")

    return {
        "name": extract_vault_name(status_payload, port),
        "port": port,
    }


def build_vault_api_path(vault_path: str, *, directory: bool = False) -> str:
    """
    把 vault 内相对路径编码为 Obsidian Local REST API 可识别的 URI。

    参数:
        vault_path: vault 内的文件或目录路径。
        directory: 是否目录（末尾加斜杠）。

    返回:
        编码后的 API 路径字符串。
    """
    normalized_path = "/".join(segment for segment in vault_path.strip("/").split("/") if segment)
    if not normalized_path:
        return "/vault/"
    encoded = "/".join(quote(segment, safe="") for segment in normalized_path.split("/"))
    return f"/vault/{encoded}{'/' if directory else ''}"


def request_obsidian_json(
    knowledge: WorkKnowledge,
    path: str,
    *,
    params: dict[str, Any] | None = None,
) -> Any:
    """
    向 Obsidian 发起 GET 请求并解析 JSON 响应。

    参数:
        knowledge: 知识库对象（用于取端口与 API Key）。
        path: API 路径（已编码）。
        params: 可选查询参数。

    返回:
        JSON 解析后的 Python 对象。

    异常:
        HTTPException(502): 认证失败、HTTP 错误或返回非 JSON。
    """
    port = get_obsidian_port(knowledge)
    api_key = get_obsidian_api_key(knowledge)
    response = safe_request(
        "GET",
        f"{get_obsidian_base_url(port)}{path}",
        headers=build_headers(api_key),
        params=params,
    )
    if response.status_code == 401:
        raise HTTPException(status_code=502, detail="Obsidian Local REST API 需要有效的 API Key。")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Obsidian Local REST API 调用失败：{response.text}")
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Obsidian Local REST API 返回了无效 JSON。") from exc


def request_obsidian_text(knowledge: WorkKnowledge, vault_path: str) -> str:
    """
    读取 Obsidian vault 中指定路径的文本内容。

    参数:
        knowledge: 知识库对象。
        vault_path: vault 内文件路径。

    返回:
        文件原文。

    异常:
        HTTPException(502): 认证失败或读取失败。
    """
    port = get_obsidian_port(knowledge)
    api_key = get_obsidian_api_key(knowledge)
    normalized_path = vault_path.strip("/")
    response = safe_request(
        "GET",
        f"{get_obsidian_base_url(port)}{build_vault_api_path(normalized_path, directory=False)}",
        headers=build_headers(api_key),
    )
    if response.status_code == 401:
        raise HTTPException(status_code=502, detail="Obsidian Local REST API 需要有效的 API Key。")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"读取 Obsidian 文件失败：{response.text}")
    return response.text


def normalize_tree_entry(entry: Any, parent_path: str = "") -> dict[str, Any]:
    """
    把 Obsidian 目录接口返回的杂项条目统一规范化为内部树节点字典。

    参数:
        entry: 原始条目（str 或 dict）。
        parent_path: 父级路径前缀，用于补全相对路径。

    返回:
        统一格式的节点字典，包含 name / path / is_dir / type。

    异常:
        HTTPException(502): 遇到无法识别的条目格式。
    """
    if isinstance(entry, str):
        original_value = entry
        raw_entry = entry.strip("/")
        path = raw_entry
        if parent_path and path and not path.startswith(f"{parent_path.strip('/')}/"):
            path = f"{parent_path.strip('/')}/{path}".strip("/")
        raw_name = path.split("/")[-1] if path else entry.strip("/")
        name = raw_name or entry.strip("/").split("/")[-1]
        is_dir = entry.endswith("/") or ("." not in name)
        return {
            "name": name,
            "path": path,
            "is_dir": is_dir,
            "type": "directory" if is_dir else "file",
            "raw": original_value,
        }

    if isinstance(entry, dict):
        raw_path = (
            entry.get("path")
            or entry.get("vault_path")
            or entry.get("filename")
            or entry.get("name")
            or ""
        )
        name = entry.get("name") or str(raw_path).split("/")[-1] or raw_path
        entry_type = entry.get("type")
        is_dir = bool(
            entry.get("is_dir")
            or entry.get("isDirectory")
            or entry.get("folder")
            or str(raw_path).endswith("/")
            or str(name).endswith("/")
            or entry_type == "folder"
            or entry_type == "directory"
        )
        path = str(raw_path).strip("/")
        if parent_path:
            parent_prefix = f"{parent_path.strip('/')}/"
            if not path:
                path = f"{parent_path.rstrip('/')}/{name}".strip("/")
            elif not path.startswith(parent_prefix):
                path = f"{parent_path.rstrip('/')}/{path}".strip("/")
        clean_name = str(name).strip("/") or path.split("/")[-1] or str(name)
        return {
            "name": clean_name,
            "path": path,
            "is_dir": is_dir,
            "type": "directory" if is_dir else "file",
        }

    raise HTTPException(status_code=502, detail="Obsidian 返回了无法识别的目录结构。")


def list_obsidian_directory(knowledge: WorkKnowledge, path: str = "") -> list[dict[str, Any]]:
    """
    列出 Obsidian vault 中指定目录下的内容。

    参数:
        knowledge: 知识库对象。
        path: vault 内的目录路径，空串表示根目录。

    返回:
        规范化后的条目列表，按“目录在前、文件在后，字母序”排序。

    异常:
        HTTPException(502): 返回格式异常。
    """
    normalized_path = path.strip("/")
    api_path = build_vault_api_path(normalized_path, directory=True)
    payload = request_obsidian_json(knowledge, api_path)

    entries_payload: list[Any] | None = None
    if isinstance(payload, list):
        entries_payload = payload
    elif isinstance(payload, dict):
        if isinstance(payload.get("entries"), list):
            entries_payload = payload["entries"]
        elif isinstance(payload.get("children"), list):
            entries_payload = payload["children"]
        elif isinstance(payload.get("items"), list):
            entries_payload = payload["items"]
        elif isinstance(payload.get("files"), list):
            entries_payload = payload["files"]
        else:
            folders = payload.get("folders") if isinstance(payload.get("folders"), list) else []
            files = payload.get("files") if isinstance(payload.get("files"), list) else []
            if folders or files:
                entries_payload = (
                    [{"name": entry, "path": f"{normalized_path}/{entry}".strip("/"), "is_dir": True} for entry in folders]
                    + [{"name": entry, "path": f"{normalized_path}/{entry}".strip("/"), "is_dir": False} for entry in files]
                )
    if entries_payload is None:
        raise HTTPException(status_code=502, detail="Obsidian 目录接口返回格式异常。")
    entries = [normalize_tree_entry(entry, normalized_path) for entry in entries_payload]
    return sorted(entries, key=lambda item: (not item["is_dir"], item["name"].lower()))
