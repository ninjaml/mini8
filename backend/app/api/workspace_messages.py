from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.agent import get_agent
from app.repositories.agent_session import get_agent_session
from app.repositories.workspace import get_workspace
from app.repositories.workspace_message import create_workspace_message, list_workspace_messages
from app.schemas.workspace_message import WorkspaceMessageCreate, WorkspaceMessageRead
from app.services.cron_execution_service import execute_headless
from app.services.session_runtime_service import build_agent_runtime_name


router = APIRouter(prefix="/workspaces/{workspace_id}/messages", tags=["workspace_messages"])


def _join_text_chunks(results: list[dict[str, object]], *, preferred_types: tuple[str, ...]) -> str:
    """把流式文本片段按原顺序无缝拼回完整回复。

    这里不能用换行去拼，否则会把 Markdown 语法和自然段打散。
    """
    pieces: list[str] = []
    for chunk in results:
        if chunk.get("type") not in preferred_types:
            continue
        content = chunk.get("content", "")
        if isinstance(content, str) and content.strip():
            pieces.append(content)
    return "".join(pieces).strip()


async def _run_workspace_agent_and_fillback(
    *,
    workspace_id: int,
    human_message,
    db: Session,
    session_manager,
):
    """触发一次 workspace 群聊里的 headless 执行，并把最终可见回复回填为 workspace_message。

    分层边界：
    - human_message.request_id 第一阶段直接保存目标 AgentSession.id
    - workspace_message 只保存群聊可见历史，不保存完整 session event 流
    - thread_id / group_id 只是回溯内部执行链的关联信息，不是 workspace 群聊主语
    """
    agent_session_id = human_message.request_id
    if agent_session_id is None:
        return

    agent_session = get_agent_session(db, agent_session_id)
    if agent_session is None:
        raise HTTPException(status_code=400, detail="Target AgentSession not found")
    if agent_session.session_type != "workspace":
        raise HTTPException(status_code=400, detail="Target AgentSession must be a workspace session")
    if agent_session.workspace_id != workspace_id:
        raise HTTPException(status_code=400, detail="Target AgentSession does not belong to this workspace")

    agent = get_agent(db, agent_session.agent_id)
    if agent is None:
        raise HTTPException(status_code=400, detail="Target agent not found")

    agent_name = build_agent_runtime_name(agent.id)
    thread_id = agent_session.thread_id
    if session_manager is not None:
        if not await session_manager.session_exists(thread_id):
            await session_manager.create_session(
                thread_id=thread_id,
                agent_name=agent_name,
                working_dir=None,
                name=agent_session.display_name,
                history_turn_limit=20,
            )
        else:
            await session_manager.update_session_metadata(
                thread_id,
                agent_name=agent_name,
                name=agent_session.display_name,
                history_turn_limit=20,
            )

    latest_group_id = None
    try:
        results = await execute_headless(
            agent_name=agent_name,
            prompt=human_message.content,
            thread_id=thread_id,
            agent_session_id=agent_session.id,
            working_dir=None,
            session_manager=session_manager,
        )

        if session_manager is not None:
            snapshot = await session_manager.get_latest_group_snapshot(thread_id)
            if snapshot is not None:
                latest_group_id = snapshot.get("group_id")

        final_content = _join_text_chunks(results, preferred_types=("text",))
        if not final_content:
            final_content = _join_text_chunks(results, preferred_types=("assistant",))
        if not final_content:
            final_content = "执行完成，但没有生成可见回复。"
    except Exception as exc:
        if session_manager is not None:
            snapshot = await session_manager.get_latest_group_snapshot(thread_id)
            if snapshot is not None:
                latest_group_id = snapshot.get("group_id")
        final_content = f"执行失败：{str(exc).strip() or '未知错误'}"

    if latest_group_id is None:
        latest_group_id = f"workspace-msg-{human_message.id}"

    return create_workspace_message(
        db,
        workspace_id=workspace_id,
        type="agent",
        content=final_content,
        agent_session_id=agent_session.id,
        agent_id=agent.id,
        agent_name_snapshot=agent.name,
        thread_id=thread_id,
        group_id=latest_group_id,
    )


@router.get("", response_model=list[WorkspaceMessageRead])
def read_workspace_messages(
    workspace_id: int,
    before: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """读取 workspace 群聊可见历史。

    这里返回的是 workspace_message，不是某个 agent session 的内部事件流。
    ``before`` 分页锚点对应的是 ``workspace_message.id``。
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return list_workspace_messages(db, workspace_id, limit=limit, before_id=before)


@router.post("", response_model=WorkspaceMessageRead)
async def create_workspace_message_endpoint(
    workspace_id: int,
    payload: WorkspaceMessageCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """写入一条 workspace 群聊消息。

    第一阶段语义：
    - public API 只允许 human message 进入
    - 若 request_id 不为空，则它直接表示目标 AgentSession.id
    - 这条 human message 会触发对应 workspace session 的一次 headless 执行
    - 执行完成后，agent 的最终可见回复会另外回填成一条 agent message

    因此这个接口的同步返回值始终是“刚写进去的 human message”，
    不是 agent 后续补写的那条回复。
    """
    if not get_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")

    human_message = create_workspace_message(
        db,
        workspace_id=workspace_id,
        type=payload.type,
        content=payload.content.strip(),
        request_id=payload.request_id,
        agent_session_id=payload.agent_session_id,
        agent_id=payload.agent_id,
        agent_name_snapshot=payload.agent_name_snapshot,
        thread_id=payload.thread_id,
        group_id=payload.group_id,
    )

    if payload.type == "human" and payload.request_id is not None:
        session_manager = getattr(request.app.state, "runtime_session_manager", None)
        await _run_workspace_agent_and_fillback(
            workspace_id=workspace_id,
            human_message=human_message,
            db=db,
            session_manager=session_manager,
        )

    return human_message
