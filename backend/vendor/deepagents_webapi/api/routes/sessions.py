import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from app.core.sqlite_connection import connect_aiosqlite

from deepagents_webapi.api.models import (
    CreateSessionRequest, CreateSessionResponse,
    ListSessionsRequest, SessionInfo, ListSessionsResponse,
    DeleteSessionRequest, RenameSessionRequest, RenameSessionResponse,
    ClearSessionRequest, ClearSessionResponse,
    AttachmentInfo,
    FetchEventsRequest, EventHistoryItem, FetchEventsResponse,
    FetchGroupedReplayRequest, FetchGroupedReplayResponse,
    FetchReplayGroupResponse,
    ReplayTraceBranchNode, ReplayTraceEvent, ReplayTraceGroup, ReplayTraceInstance,
    RollbackRequest, RollbackResponse,
)
from deepagents_webapi.config import settings
from app.services.runtime_replay_trace_service import build_replay_trace

router = APIRouter()

session_manager: Optional["AsyncSessionManager"] = None
active_connections: dict[str, dict] = {}


def set_session_manager(manager: "AsyncSessionManager"):
    global session_manager
    session_manager = manager


def _build_replay_group_response(group: dict) -> ReplayTraceGroup:
    # grouped replay 和单 group 直取都走同一套组装逻辑，避免两条接口的返回形状漂移。
    return ReplayTraceGroup(
        group_id=group["group_id"],
        root_events=[ReplayTraceEvent(**event) for event in group["root_events"]],
        invocations=[
            ReplayTraceInstance(
                subagent_invocation_id=invocation["subagent_invocation_id"],
                subagent_type=invocation.get("subagent_type"),
                description=invocation.get("description"),
                # 这里暴露的是“这次 invocation 背后落到哪个长期 child thread”，
                # 方便前端保留观察锚点；它还不是独立 child-session 历史接口。
                child_thread_id=invocation.get("child_thread_id"),
                namespace_key=invocation.get("namespace_key"),
                events=[ReplayTraceEvent(**event) for event in invocation.get("events", [])],
                first_event_id=invocation.get("first_event_id"),
                last_event_id=invocation.get("last_event_id"),
                started_at=invocation.get("started_at"),
                finished_at=invocation.get("finished_at"),
                status=invocation.get("status"),
                preview=invocation.get("preview"),
                branch_tree=ReplayTraceBranchNode(**invocation["branch_tree"]),
            )
            for invocation in group["invocations"]
        ],
    )


@router.post("/api/runtime/sessions/create", response_model=CreateSessionResponse)
async def create_session(request: CreateSessionRequest):
    """创建新会话"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")
    
    thread_id = str(uuid.uuid4())
    
    # 如果没有提供working_dir，使用用户home目录
    working_dir = request.working_dir
    if not working_dir:
        working_dir = str(settings.project_root or settings.user_deepagents_dir.parent)
    
    # 创建会话（会自动生成名字如果没有提供）
    await session_manager.create_session(
        thread_id,
        request.agent_name,
        working_dir,
        request.name,
        request.history_turn_limit,
    )

    # 如果没有提供 name，使用默认名称
    name = request.name
    if not name:
        name = f"会话 {datetime.now().strftime('%m-%d %H:%M')}"

    return CreateSessionResponse(
        thread_id=thread_id,
        agent_name=request.agent_name,
        name=name,
        working_dir=working_dir,
        history_turn_limit=request.history_turn_limit,
        message="Session created successfully"
    )


@router.post("/api/runtime/sessions/list", response_model=ListSessionsResponse)
async def list_sessions(request: ListSessionsRequest):
    """获取会话列表（包含 model_provider）"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")
    
    sessions = await session_manager.get_session_list(request.agent_name)
    
    # 为每个会话添加 model_provider
    sessions_with_provider = []
    for session in sessions:
        agent_name = session.get('agent_name', '')
        # 从 agent 目录的 model_config.json 读取完整的模型信息
        agent_dir = settings.user_deepagents_dir / agent_name
        model_config_path = agent_dir / "model_config.json"
        model_provider = None
        if model_config_path.exists():
            try:
                config_data = json.loads(model_config_path.read_text(encoding='utf-8'))
                model_provider = config_data.get("provider")
            except Exception:
                pass  # 读取失败忽略
        
        session['model_provider'] = model_provider
        sessions_with_provider.append(session)
    
    return ListSessionsResponse(
        sessions=[SessionInfo(**session) for session in sessions_with_provider]
    )


@router.delete("/api/runtime/sessions/delete")
async def delete_session(request: DeleteSessionRequest):
    """删除会话"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")
    
    if request.thread_id in active_connections:
        conn = active_connections.pop(request.thread_id)
        try:
            await conn["websocket"].close(code=1000, reason="Session deleted")
        except Exception:
            pass
    
    await session_manager.delete_session(request.thread_id)
    
    return {"message": "Session deleted successfully"}


@router.post("/api/runtime/sessions/rename", response_model=RenameSessionResponse)
async def rename_session_endpoint(request: RenameSessionRequest):
    """重命名会话"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")
    
    await session_manager.rename_session(request.thread_id, request.name)
    
    return RenameSessionResponse(
        success=True,
        message="Session renamed successfully"
    )


@router.post("/api/runtime/sessions/clear", response_model=ClearSessionResponse)
async def clear_session_endpoint(request: ClearSessionRequest):
    """清空会话消息历史"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")
    
    await session_manager.clear_session(request.thread_id)
    
    return ClearSessionResponse(
        success=True,
        message="Session cleared successfully"
    )


@router.post("/api/runtime/sessions/{thread_id}/events", response_model=FetchEventsResponse)
async def fetch_session_events(thread_id: str, request: FetchEventsRequest):
    """获取会话完整事件历史。"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")

    if not await session_manager.session_exists(thread_id):
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        events, has_more, oldest_id = await session_manager.list_session_events(
            thread_id, limit=request.limit, before_id=request.before_id
        )
        return FetchEventsResponse(
            events=[
                EventHistoryItem(
                    id=event["id"],
                    thread_id=event["thread_id"],
                    group_id=event["group_id"],
                    event_index=event["event_index"],
                    type=event["type"],
                    content=event["content"],
                    metadata=event.get("metadata") or {},
                    attachments=[AttachmentInfo(**attachment) for attachment in event.get("attachments", [])],
                    message_index=event.get("message_index"),
                    created_at=event.get("created_at"),
                )
                for event in events
            ],
            has_more=has_more,
            oldest_id=oldest_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {str(e)}")


@router.post("/api/runtime/sessions/{thread_id}/events/grouped", response_model=FetchGroupedReplayResponse)
async def fetch_grouped_session_events(thread_id: str, request: FetchGroupedReplayRequest):
    """获取按完整 run group 聚合的回放视图。"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")

    if not await session_manager.session_exists(thread_id):
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        events, group_ids_in_order, next_cursor = await session_manager.list_replay_session_events_by_groups(
            thread_id,
            limit_groups=request.limit_groups,
            before_cursor=request.before_cursor,
        )
        groups = build_replay_trace(events, group_ids_in_order)
        return FetchGroupedReplayResponse(
            groups=[_build_replay_group_response(group) for group in groups],
            has_more=next_cursor is not None,
            next_cursor=next_cursor,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch grouped replay events: {str(e)}")


@router.get("/api/runtime/sessions/{thread_id}/events/grouped/{group_id}", response_model=FetchReplayGroupResponse)
async def fetch_single_replay_group(thread_id: str, group_id: str):
    """按 group_id 直取单次执行的完整回放。"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")

    if not await session_manager.session_exists(thread_id):
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        events = await session_manager.get_replay_session_events_group(thread_id, group_id)
        if not events:
            return FetchReplayGroupResponse(group=None)
        groups = build_replay_trace(events, [group_id])
        group = groups[0] if groups else None
        return FetchReplayGroupResponse(
            group=_build_replay_group_response(group) if group else None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch replay group: {str(e)}")


@router.post("/api/runtime/sessions/{thread_id}/rollback", response_model=RollbackResponse)
async def rollback_session_messages(thread_id: str, request: RollbackRequest):
    """回退会话到指定消息索引（删除该索引之后的所有消息）"""
    if not session_manager:
        raise HTTPException(status_code=500, detail="Session manager not initialized")
    
    if not await session_manager.session_exists(thread_id):
        raise HTTPException(status_code=404, detail="Session not found")
    
    try:
        if request.message_index <= 0:
            await session_manager.delete_session_checkpoints(thread_id)
            await session_manager.delete_session_events_from_message_index(
                thread_id, request.message_index
            )
            return RollbackResponse(
                message="Rollback successful",
                new_message_count=0
            )

        checkpointer = await session_manager.create_sqlite_saver()
        config = {"configurable": {"thread_id": thread_id}}
        checkpoint_tuple = await checkpointer.aget_tuple(config)
        
        if not checkpoint_tuple or not checkpoint_tuple.checkpoint:
            raise HTTPException(status_code=404, detail="No messages found")
        
        state = checkpoint_tuple.checkpoint
        raw_messages = state.get("channel_values", {}).get("messages", [])
        
        if not raw_messages:
            raise HTTPException(status_code=404, detail="No messages found")
        
        if request.message_index < 0 or request.message_index >= len(raw_messages):
            raise HTTPException(status_code=400, detail=f"Invalid message index: {request.message_index}")
        
        truncated_messages = raw_messages[:request.message_index]
        
        state["channel_values"]["messages"] = truncated_messages
        
        conn = await connect_aiosqlite(session_manager.db_path)
        cursor = await conn.cursor()
        
        await cursor.execute('''
            SELECT thread_id, checkpoint_ns, checkpoint_id FROM checkpoints 
            WHERE thread_id = ?
            ORDER BY checkpoint_id DESC LIMIT 1
        ''', (thread_id,))
        
        row = await cursor.fetchone()
        if row:
            thread_id_db, checkpoint_ns, checkpoint_id = row

            serializer = JsonPlusSerializer()
            checkpoint_type, checkpoint_data = serializer.dumps_typed(state)

            await cursor.execute('''
                UPDATE checkpoints
                SET checkpoint = ?
                WHERE thread_id = ? AND checkpoint_id = ?
            ''', (checkpoint_data, thread_id_db, checkpoint_id))

            await conn.commit()

        await conn.close()

        await session_manager.delete_session_events_from_message_index(
            thread_id, request.message_index
        )

        return RollbackResponse(
            message="Rollback successful",
            new_message_count=len(truncated_messages)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rollback failed: {str(e)}")

