"""
工作历史（WorkHistory）相关的 Pydantic 模式定义。

本模块定义了工作项历史记录（成果、审核等）的创建、审核与读取等数据模型，
用于 API 请求/响应的校验与序列化。
"""

from pydantic import BaseModel


class WorkHistoryFileRead(BaseModel):
    """工作历史关联文件读取模型。

    Attributes:
        name: 文件名称。
        size: 文件大小（字节）。
    """

    name: str
    size: int


class WorkHistoryCreate(BaseModel):
    """工作历史创建请求模型。

    Attributes:
        work_space_id: 所属工作空间 ID（必填）。
        work_item_id: 所属工作项 ID（必填）。
        status: 当前状态（必填）。
        title: 历史记录标题，可选。
        summary: 摘要说明，可选。
        submitted_by_user_id: 提交者用户 ID，可选。
        submitted_by_name: 提交者姓名，可选。
        file_dir_path: 关联文件目录路径，可选。
        superagent_review_status: 超级智能体审核状态，可选。
        superagent_review_note: 超级智能体审核备注，可选。
        superone_review_status: 超级用户审核状态，可选。
        superone_review_note: 超级用户审核备注，可选。
    """

    work_space_id: int
    work_item_id: int
    status: str
    title: str | None = None
    summary: str | None = None
    submitted_by_user_id: str | None = None
    submitted_by_name: str | None = None
    file_dir_path: str | None = None
    superagent_review_status: str | None = None
    superagent_review_note: str | None = None
    superone_review_status: str | None = None
    superone_review_note: str | None = None


class WorkHistoryReview(BaseModel):
    """工作历史审核请求模型。

    用于对某条工作历史进行审核结果提交。

    Attributes:
        status: 更新后的状态（必填）。
        superagent_review_status: 超级智能体审核状态，可选。
        superagent_review_note: 超级智能体审核备注，可选。
        superone_review_status: 超级用户审核状态，可选。
        superone_review_note: 超级用户审核备注，可选。
    """

    status: str
    superagent_review_status: str | None = None
    superagent_review_note: str | None = None
    superone_review_status: str | None = None
    superone_review_note: str | None = None


class WorkHistoryRead(BaseModel):
    """工作历史读取响应模型。

    Attributes:
        id: 历史记录唯一标识。
        work_space_id: 所属工作空间 ID。
        work_item_id: 所属工作项 ID。
        title: 历史记录标题。
        summary: 摘要说明。
        submitted_by_user_id: 提交者用户 ID。
        submitted_by_name: 提交者姓名。
        status: 当前状态。
        started_at: 开始时间戳（毫秒级）。
        ended_at: 结束时间戳（毫秒级）。
        created_at: 创建时间戳（毫秒级）。
        superagent_review_status: 超级智能体审核状态。
        superagent_review_note: 超级智能体审核备注。
        superone_review_status: 超级用户审核状态。
        superone_review_note: 超级用户审核备注。
        file_dir_path: 关联文件目录路径。
        file_count: 关联文件数量，默认为 0。
        files: 关联文件详情列表，默认为空列表。
        preview_text: 预览文本内容。
    """

    id: int
    work_space_id: int | None = None
    work_item_id: int | None = None
    title: str | None = None
    summary: str | None = None
    submitted_by_user_id: str | None = None
    submitted_by_name: str | None = None
    status: str | None = None
    started_at: int | None = None
    ended_at: int | None = None
    created_at: int | None = None
    superagent_review_status: str | None = None
    superagent_review_note: str | None = None
    superone_review_status: str | None = None
    superone_review_note: str | None = None
    file_dir_path: str | None = None
    file_count: int = 0
    files: list[WorkHistoryFileRead] = []
    preview_text: str | None = None

    model_config = {"from_attributes": True}
