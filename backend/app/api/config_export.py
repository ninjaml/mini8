"""
Configuration export API endpoints.
Provides endpoints to export MOSS, SuperAgent and scoped skill packages.
"""

"""
配置导出接口模块。

提供 MOSS、SuperAgent 以及单个工作事项/知识库的技能包导出端点，
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

from app.core.database import get_db
from app.models import WorkItem, WorkKnowledge

router = APIRouter(prefix="/config/export", tags=["config"])

BASE_DIR = Path(__file__).resolve().parent.parent


def _write_tree(
    zip_file: zipfile.ZipFile,
    source_dir: Path,
    arc_prefix: str | None = None,
    skill_suffix: str = "",
    skip_files: set[str] | None = None,
) -> None:
    """
    把模板目录递归写入 ZIP，保留相对路径结构。

    参数:
        zip_file: 目标 ZIP 文件对象。
        source_dir: 本地源目录。
        arc_prefix: ZIP 内的归档前缀路径。
        skill_suffix: 若为 SKILL.md 文件，则在尾部追加该字符串（用于注入上下文变量）。
        skip_files: 需要跳过的文件相对路径集合。
    """
    if not source_dir.exists():
        return
    skip_files = skip_files or set()
    for root, dirs, files in os.walk(source_dir):
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
        config = json.loads(knowledge.knowledge_json or "{}")
    except json.JSONDecodeError:
        config = {}
    return config if isinstance(config, dict) else {}


def _build_vaults_json(knowledge: WorkKnowledge) -> dict:
    """
    根据知识库配置生成 vaults.json 结构，供 Obsidian skill 使用。

    返回:
        包含 defaultVault 与 vaults 映射的字典。
    """
    config = _read_knowledge_config(knowledge)
    vault_name = config.get("vault_name") or knowledge.name or f"knowledge-{knowledge.id}"
    port = config.get("port") or ""
    rest_base_url = f"http://127.0.0.1:{port}" if port else ""
    return {
        "defaultVault": vault_name,
        "vaults": {
            vault_name: {
                "name": vault_name,
                "rest_base_url": rest_base_url,
                "api_key": config.get("api_key") or "",
                "omnisearch_url": config.get("omnisearch_url") or "",
                "vault_path": config.get("vault_path") or "",
            }
        },
    }


@router.get("/moss")
async def export_moss_config():
    """
    导出 MOSS 配置，包含 skills 与 prompt templates。

    返回 ZIP 文件，内含：
    - skill_templates/moss/
    - skill_templates/obsidian_tools/
    - prompt_templates/moss/
    """
    try:
        zip_buffer = BytesIO()

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            _write_tree(zip_file, BASE_DIR / "skill_templates" / "moss")
            _write_tree(zip_file, BASE_DIR / "skill_templates" / "obsidian_tools")
            _write_tree(zip_file, BASE_DIR / "prompt_templates" / "moss")

        return _stream_zip(zip_buffer, "moss_config.zip")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出配置失败: {str(e)}")


@router.get("/superagent")
async def export_superagent_config(workspace_id: int):
    """
    导出指定工作空间的 SuperAgent 管理技能包。

    参数:
        workspace_id: 目标工作空间 ID。

    返回 ZIP 文件，包含 item/knowledge/workagent/workspace 四个操作 skill。
    """
    try:
        zip_buffer = BytesIO()
        suffix = f"# 当前工作空间\n\n- workspace_id: {workspace_id}"
        skill_names = [
            "item-operation",
            "knowledge-operation",
            "workagent-operation",
            "workspace-operation",
        ]

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for skill_name in skill_names:
                _write_tree(
                    zip_file,
                    BASE_DIR / "skill_templates" / "superagent" / skill_name,
                    f"skills/{skill_name}",
                    skill_suffix=suffix,
                )

        return _stream_zip(zip_buffer, "superagent_config.zip")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出配置失败: {str(e)}")


@router.get("/items/{item_id}")
async def export_item_skill(item_id: int, db: Session = Depends(get_db)):
    """导出单个工作事项的管理 skill 包。"""
    item = db.get(WorkItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    try:
        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            _write_tree(
                zip_file,
                BASE_DIR / "skill_templates" / "superagent" / "item-operation",
                "skills/item-operation",
                skill_suffix=f"# 当前工作事项\n\n- work_item_id: {item.id}",
            )

        return _stream_zip(zip_buffer, f"work_item_{item.id}_skill.zip")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出事项 skill 失败: {str(e)}")


@router.get("/knowledge/{knowledge_id}")
async def export_knowledge_skill(knowledge_id: int, db: Session = Depends(get_db)):
    """导出单个知识库的管理 skill 包，并注入该知识库的 vault 配置。"""
    knowledge = db.get(WorkKnowledge, knowledge_id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")

    try:
        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            _write_tree(
                zip_file,
                BASE_DIR / "skill_templates" / "obsidian_tools",
                "skills/obsidian_tools",
                skip_files={"obsidian-control/references/vaults.example.json"},
            )
            vaults_json = _build_vaults_json(knowledge)
            zip_file.writestr(
                "skills/obsidian_tools/obsidian-control/references/vaults.json",
                json.dumps(vaults_json, ensure_ascii=False, indent=2),
            )

        return _stream_zip(zip_buffer, f"knowledge_{knowledge.id}_skill.zip")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出知识库 skill 失败: {str(e)}")
