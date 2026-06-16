import mimetypes
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import ResourceKey
from app.repositories.resource_key import create_resource_key, delete_resource_keys_by_target
from app.repositories.work_history import (
    create_work_history,
    delete_work_histories_by_item,
    delete_work_history,
    get_work_history,
    list_work_histories,
    update_work_history,
)
from app.repositories.work_item import (
    bind_agent_to_item,
    create_work_item,
    delete_agent_work_bindings,
    delete_work_item,
    get_bound_agent_id,
    get_item_current_status,
    get_work_item,
    get_work_item_by_name,
    list_work_items,
    update_work_item,
)
from app.repositories.workspace import get_workspace
from app.repositories.workspace_agent import get_workspace_agent
from app.schemas.work_history import WorkHistoryCreate, WorkHistoryFileRead, WorkHistoryRead, WorkHistoryReview
from app.schemas.work_item import AgentWorkBind, WorkItemCreate, WorkItemRead, WorkItemUpdate
from app.services.history_storage import (
    build_history_zip,
    delete_history_dir_and_prune,
    ensure_history_dir,
    list_history_files,
    prune_empty_item_dirs,
    read_preview_text,
    resolve_history_file,
    save_uploads,
    to_storage_path,
)


"""
工作事项（Work Item）与成果（Work History）接口模块。

提供事项的增删改查、WorkAgent 绑定、成果提交/下载/预览/审批等完整生命周期管理。
"""

router = APIRouter(tags=["work_items"])


def _serialize_item(db: Session, item) -> WorkItemRead:
    """
    序列化 WorkItem ORM 对象为响应模型。
    补充 current_status 与 agent_id 两个派生字段（不直接存于 work_item 表）。
    """
    data = WorkItemRead.model_validate(item)
    data.current_status = get_item_current_status(db, item.id)
    data.agent_id = get_bound_agent_id(db, item.id)
    return data


def _serialize_history(record) -> WorkHistoryRead:
    """
    序列化 WorkHistory ORM 对象为响应模型。
    自动聚合文件列表、文件数量与文本预览，减少前端二次请求。
    """
    files = [WorkHistoryFileRead(**item) for item in list_history_files(record.file_dir_path)]
    return WorkHistoryRead(
        id=record.id,
        work_space_id=record.work_space_id,
        work_item_id=record.work_item_id,
        title=record.title,
        summary=record.summary,
        submitted_by_user_id=record.submitted_by_user_id,
        submitted_by_name=record.submitted_by_name,
        status=record.status,
        started_at=record.started_at,
        ended_at=record.ended_at,
        created_at=record.created_at,
        superagent_review_status=record.superagent_review_status,
        superagent_review_note=record.superagent_review_note,
        superone_review_status=record.superone_review_status,
        superone_review_note=record.superone_review_note,
        file_dir_path=record.file_dir_path,
        file_count=len(files),
        files=files,
        preview_text=read_preview_text(record.file_dir_path),
    )


@router.get("/workspaces/{workspace_id}/items", response_model=list[WorkItemRead])
def read_work_items(workspace_id: int, db: Session = Depends(get_db)):
    """获取指定工作空间下的所有工作事项。"""
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return [_serialize_item(db, item) for item in list_work_items(db, workspace_id)]


@router.post("/workspaces/{workspace_id}/items", response_model=WorkItemRead)
def create_work_item_endpoint(workspace_id: int, payload: WorkItemCreate, db: Session = Depends(get_db)):
    """
    在工作空间下创建新事项，名称不允许重复。
    创建成功后自动生成 resource key，供后续 Skill 注入使用。
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    item_name = (payload.name or "").strip()
    if not item_name:
        raise HTTPException(status_code=400, detail="Item name is required")
    if get_work_item_by_name(db, workspace_id, item_name):
        raise HTTPException(status_code=400, detail="同一个工作空间中事项名称不能重复")
    item = create_work_item(
        db,
        {
            "user_id": payload.user_id,
            "work_space_id": workspace_id,
            "name": item_name,
            "description": payload.description,
            "work_requirement": payload.work_requirement,
            "delivery_requirement": payload.delivery_requirement,
            "need_superagent_review": int(bool(payload.need_superagent_review)) if payload.need_superagent_review is not None else None,
            "need_superone_review": int(bool(payload.need_superone_review)) if payload.need_superone_review is not None else None,
            "allow_auto_complete": int(bool(payload.allow_auto_complete)) if payload.allow_auto_complete is not None else None,
        },
    )
    # 每个事项创建后立刻生成一条 resource key，后续 Skill 注入和权限判断都通过它定位事项。
    create_resource_key(
        db,
        ResourceKey(
            key=str(uuid4()),
            resource_type="work_item",
            resource_identity=str(item.id),
        ),
    )
    return _serialize_item(db, item)


@router.get("/items/{item_id}", response_model=WorkItemRead)
def read_work_item(item_id: int, db: Session = Depends(get_db)):
    """获取单个工作事项详情。"""
    item = get_work_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _serialize_item(db, item)


@router.patch("/items/{item_id}", response_model=WorkItemRead)
def update_work_item_endpoint(item_id: int, payload: WorkItemUpdate, db: Session = Depends(get_db)):
    """
    更新工作事项字段，支持部分更新（PATCH 语义）。
    名称变更时需再次校验同空间唯一性。
    """
    item = get_work_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "name" and value is not None:
            value = value.strip()
            if not value:
                raise HTTPException(status_code=400, detail="Item name is required")
            if get_work_item_by_name(db, item.work_space_id, value, exclude_item_id=item.id):
                raise HTTPException(status_code=400, detail="同一个工作空间中事项名称不能重复")
        if field in {"need_superagent_review", "need_superone_review", "allow_auto_complete"} and value is not None:
            value = int(bool(value))
        setattr(item, field, value)
    return _serialize_item(db, update_work_item(db, item))


@router.post("/items/{item_id}/bind-agent", response_model=WorkItemRead)
def bind_work_item_agent(item_id: int, payload: AgentWorkBind, db: Session = Depends(get_db)):
    """
    将 WorkAgent 绑定到工作事项（或解绑）。
    绑定的 agent 必须与事项属于同一工作空间。
    """
    item = get_work_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if payload.agent_id is not None:
        agent = get_workspace_agent(db, payload.agent_id)
        if not agent or agent.work_space_id != item.work_space_id:
            raise HTTPException(status_code=404, detail="Agent not found")
    bind_agent_to_item(db, item_id, payload.agent_id)
    return _serialize_item(db, item)


@router.delete("/items/{item_id}", status_code=204)
def delete_work_item_endpoint(item_id: int, db: Session = Depends(get_db)):
    """
    删除工作事项及其所有成果、绑定关系、资源密钥。
    先清理物理文件再删数据库，最后兜底清理空目录。
    """
    item = get_work_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    histories = list_work_histories(db, item_id)
    # 删除事项时，先把成果目录物理删掉，再清数据库，避免留下孤儿文件。
    for record in histories:
        delete_history_dir_and_prune(record.file_dir_path, item.work_space_id, item.id)
    delete_work_histories_by_item(db, item_id)
    delete_agent_work_bindings(db, item_id)
    delete_resource_keys_by_target(db, "work_item", str(item_id))
    delete_work_item(db, item)
    # 最后再兜底清一次空目录，处理“无成果但目录已创建”的情况。
    prune_empty_item_dirs(item.work_space_id, item_id)


@router.get("/items/{item_id}/histories", response_model=list[WorkHistoryRead])
def read_work_histories(item_id: int, db: Session = Depends(get_db)):
    """获取指定事项下的所有成果历史记录。"""
    if not get_work_item(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return [_serialize_history(record) for record in list_work_histories(db, item_id)]


@router.post("/items/{item_id}/histories", response_model=WorkHistoryRead)
def create_work_history_endpoint(item_id: int, payload: WorkHistoryCreate, db: Session = Depends(get_db)):
    """
    手动创建一条成果记录（通常由系统或管理员直接写入，不走文件上传）。
    """
    item = get_work_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    summary = (payload.summary or "").strip()
    if not summary:
        raise HTTPException(status_code=400, detail="Summary is required")
    record = create_work_history(
        db,
        {
            "work_space_id": item.work_space_id,
            "work_item_id": item_id,
            "title": payload.title,
            "summary": summary,
            "submitted_by_user_id": payload.submitted_by_user_id,
            "submitted_by_name": payload.submitted_by_name,
            "status": payload.status,
            "file_dir_path": payload.file_dir_path,
            "superagent_review_status": payload.superagent_review_status,
            "superagent_review_note": payload.superagent_review_note,
            "superone_review_status": payload.superone_review_status,
            "superone_review_note": payload.superone_review_note,
        },
    )
    return _serialize_history(record)


@router.post("/items/{item_id}/histories/upload", response_model=WorkHistoryRead)
async def upload_work_history_result(
    item_id: int,
    title: str = Form(...),
    summary: str = Form(""),
    submitted_by_user_id: str | None = Form(None),
    submitted_by_name: str | None = Form(None),
    files: list[UploadFile] | None = File(None),
    db: Session = Depends(get_db),
):
    """
    上传成果文件并创建历史记录。

    参数:
        title: 成果标题。
        summary: 成果摘要（必填）。
        submitted_by_user_id: 提交人用户 ID。
        submitted_by_name: 提交人姓名。
        files: 上传文件列表。

    返回:
        创建后的 WorkHistory 详情。
    """
    item = get_work_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    summary = summary.strip()
    if not summary:
        raise HTTPException(status_code=400, detail="Summary is required")

    needs_superagent = bool(item.need_superagent_review)
    needs_superone = bool(item.need_superone_review)
    # 第一版先按“是否需要审核”推导成果状态，不单独建执行态机。
    status = "reviewing" if (needs_superagent or needs_superone) else "completed"

    record = create_work_history(
        db,
        {
            "work_space_id": item.work_space_id,
            "work_item_id": item_id,
            "title": title,
            "summary": summary,
            "submitted_by_user_id": submitted_by_user_id,
            "submitted_by_name": submitted_by_name or "Admin",
            "status": status,
            "file_dir_path": None,
            "superagent_review_status": "pending" if needs_superagent else ("passed" if not needs_superone else None),
            "superagent_review_note": None,
            "superone_review_status": "pending" if needs_superone else ("passed" if not needs_superagent else None),
            "superone_review_note": None,
        },
    )
    if files:
        history_dir = ensure_history_dir(item.work_space_id, item_id, record.id)
        await save_uploads(history_dir, files)
        # 目录真正创建并写入文件后，再把物理路径回填到历史记录里。
        record.file_dir_path = to_storage_path(history_dir)
        update_work_history(db, record)
    return _serialize_history(record)


@router.get("/histories/{history_id}/download")
def download_work_history(history_id: int, db: Session = Depends(get_db)):
    """
    下载指定成果的所有文件（打包为 ZIP）。
    """
    record = get_work_history(db, history_id)
    if not record:
        raise HTTPException(status_code=404, detail="History not found")
    try:
        zip_buffer = build_history_zip(record.file_dir_path)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    filename = f"{record.title or f'history-{record.id}'}.zip"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)


@router.get("/histories/{history_id}/files/{file_name:path}")
def preview_work_history_file(history_id: int, file_name: str, db: Session = Depends(get_db)):
    """
    预览（或 inline 下载）成果历史中的单个文件。
    自动检测 MIME 类型，并处理非 ASCII 文件名（RFC 5987）。
    """
    record = get_work_history(db, history_id)
    if not record:
        raise HTTPException(status_code=404, detail="History not found")

    try:
        file_path = resolve_history_file(record.file_dir_path, file_name)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    # 使用 RFC 5987 编码格式处理非 ASCII 文件名
    try:
        # 尝试 ASCII 编码
        file_path.name.encode('ascii')
        filename_header = f'inline; filename="{file_path.name}"'
    except UnicodeEncodeError:
        # 如果包含非 ASCII 字符，使用 RFC 5987 格式
        from urllib.parse import quote
        encoded_filename = quote(file_path.name)
        filename_header = f"inline; filename*=UTF-8''{encoded_filename}"

    headers = {"Content-Disposition": filename_header}
    return FileResponse(file_path, media_type=media_type, headers=headers)


@router.post("/histories/{history_id}/review", response_model=WorkHistoryRead)
def review_work_history(history_id: int, payload: WorkHistoryReview, db: Session = Depends(get_db)):
    """
    对成果进行审批（SuperAgent / SuperOne）。

    审批字段支持部分更新；status 若未显式指定，则根据审批状态自动推导：
    - 任一拒绝 → rejected
    - 全部通过 → completed
    - 仍有 pending → reviewing
    """
    record = get_work_history(db, history_id)
    if not record:
        raise HTTPException(status_code=404, detail="History not found")

    # 更新审批字段
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field != "status":  # status 需要特殊处理
            setattr(record, field, value)

    # 智能更新 status：根据审批状态自动判断
    # 如果 payload 中明确指定了 status，使用指定的值
    if "status" in payload.model_dump(exclude_unset=True):
        record.status = payload.status
    else:
        # 否则根据审批状态自动判断
        superagent_status = record.superagent_review_status
        superone_status = record.superone_review_status

        # 任何一方拒绝，整体状态为 rejected
        if superagent_status == "rejected" or superone_status == "rejected":
            record.status = "rejected"
        # 所有需要审批的都通过了，状态为 completed
        elif (superagent_status == "passed" or superagent_status is None) and \
             (superone_status == "passed" or superone_status is None) and \
             (superagent_status == "passed" or superone_status == "passed"):
            record.status = "completed"
        # 还有待审批的，状态为 reviewing
        elif superagent_status == "pending" or superone_status == "pending":
            record.status = "reviewing"

    return _serialize_history(update_work_history(db, record))


@router.delete("/histories/{history_id}", status_code=204)
def delete_work_history_endpoint(history_id: int, db: Session = Depends(get_db)):
    """
    删除单条成果记录及其物理文件，并清理可能产生的空父目录。
    """
    record = get_work_history(db, history_id)
    if not record:
        raise HTTPException(status_code=404, detail="History not found")
    # 单条成果删除也要顺手收掉空父目录，避免 items/<id>/histories 留壳子。
    delete_history_dir_and_prune(record.file_dir_path, record.work_space_id, record.work_item_id)
    delete_work_history(db, record)
