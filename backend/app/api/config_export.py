"""
配置导出接口模块。

提供 MOSS、知识库导出端点。
以 ZIP 流的形式返回，供外部 Agent 或用户下载导入。
"""

import json
import os
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import WorkKnowledge

router = APIRouter(prefix="/config/export", tags=["config"])

BASE_DIR = Path(__file__).resolve().parent.parent


def _write_tree(
    zip_file: zipfile.ZipFile,
    source_dir: Path,
    arc_prefix: str | None = None,
    skill_suffix: str = "",
    skip_files: set[str] | None = None,
) -> None:
    """把模板目录递归写入 ZIP，保留相对路径结构。"""
    if not source_dir.exists():
        return
    skip_files = skip_files or set()
    for root, _dirs, files in os.walk(source_dir):
        for file in files:
            file_path = Path(root) / file
            relative_path = file_path.relative_to(source_dir)
            if relative_path.as_posix() in skip_files:
                continue
            arcname = Path(arc_prefix) / relative_path if arc_prefix else file_path.relative_to(BASE_DIR)
            if file == "SKILL.md" and skill_suffix:
                content = file_path.read_text(encoding="utf-8")
                zip_file.writestr(arcname.as_posix(), f"{content.rstrip()}\n\n{skill_suffix.strip()}\n")
            else:
                zip_file.write(file_path, arcname.as_posix())


def _stream_zip(zip_buffer: BytesIO, filename: str) -> StreamingResponse:
    """把内存中的 ZIP 包装成 StreamingResponse，附带标准下载头。"""
    zip_buffer.seek(0)
    zip_data = zip_buffer.getvalue()
    return StreamingResponse(
        iter([zip_data]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{filename}',
            "Content-Length": str(len(zip_data)),
            "Content-Type": "application/zip",
        },
    )


def _read_knowledge_config(knowledge: WorkKnowledge) -> dict:
    """安全解析知识库的 JSON 配置，损坏时返回空字典。"""
    try:
        config = json.loads(knowledge.knowledge_json)
    except json.JSONDecodeError:
        config = {}
    return config if isinstance(config, dict) else {}


def _build_localhost_http_url(port: object) -> str:
    """把端口值规范化为 localhost HTTP 地址；无效值时返回空串。"""
    if port in (None, ""):
        return ""
    try:
        port_value = int(port)
    except (TypeError, ValueError):
        return ""
    return f"http://localhost:{port_value}"


def _build_vaults_json(knowledge: WorkKnowledge) -> dict:
    """根据知识库配置生成 vaults.json 结构，供 Obsidian skill 使用。"""
    config = _read_knowledge_config(knowledge)
    vault_name = config.get("vault_name") or knowledge.name or f"knowledge-{knowledge.id}"
    rest_base_url = _build_localhost_http_url(config.get("port"))
    omnisearch_url = config.get("omnisearch_url") or _build_localhost_http_url(config.get("omnisearch_port"))
    return {
        "defaultVault": vault_name,
        "vaults": {
            vault_name: {
                "name": vault_name,
                "rest_base_url": rest_base_url,
                "api_key": config.get("api_key") or "",
                "omnisearch_url": omnisearch_url,
                "vault_path": config.get("vault_path") or "",
            }
        },
    }


@router.get("/moss")
async def export_moss_config():
    """导出 MOSS 基础模板 ZIP。

    当前打包内容来自两个模板目录：
    - ``settings.MOSS_SKILL_TEMPLATE_DIR``
    - ``settings.MOSS_AGENT_TEMPLATE_DIR``

    它导出的不是运行时目录快照，而是平台内置的 MOSS 基础模板资源。
    """
    try:
        zip_buffer = BytesIO()

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            _write_tree(zip_file, settings.MOSS_SKILL_TEMPLATE_DIR, "agent_templates/moss/skills")
            _write_tree(zip_file, settings.MOSS_AGENT_TEMPLATE_DIR, "agent_templates/moss")

        return _stream_zip(zip_buffer, "moss_config.zip")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出配置失败: {str(e)}")


@router.get("/knowledge/{knowledge_id}")
async def export_knowledge_skill(knowledge_id: int, db: Session = Depends(get_db)):
    """导出单个知识库对应的 Obsidian skill ZIP。

    真实行为是：
    1. 复制 ``obsidian_tools`` 模板技能目录
    2. 跳过示例配置 ``vaults.example.json``
    3. 按当前 ``WorkKnowledge.knowledge_json`` 生成实际 ``vaults.json`` 注入 ZIP

    因此下载结果不是“知识正文备份”，而是一个带好连接配置的 skill 包。
    """
    knowledge = db.get(WorkKnowledge, knowledge_id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")

    try:
        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            _write_tree(
                zip_file,
                settings.MOSS_SKILL_TEMPLATE_DIR / "obsidian_tools",
                "agent_templates/moss/skills/obsidian_tools",
                skip_files={"obsidian-control/references/vaults.example.json"},
            )
            vaults_json = _build_vaults_json(knowledge)
            zip_file.writestr(
                "agent_templates/moss/skills/obsidian_tools/obsidian-control/references/vaults.json",
                json.dumps(vaults_json, ensure_ascii=False, indent=2),
            )

        return _stream_zip(zip_buffer, f"knowledge_{knowledge.id}_skill.zip")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出知识库 skill 失败: {str(e)}")
