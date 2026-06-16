# sqlite 上下文管理器
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

class AsyncSessionManager:
    def __init__(self):
        """同步初始化，只设置基本属性"""
        self.db_path = None
        self._checkpointers = []  # 跟踪所有创建的checkpointer

    @classmethod
    async def create(cls, db_path: Optional[Path] = None) -> 'AsyncSessionManager':
        """异步工厂方法替代 __init__"""
        instance = cls()
        if db_path is None:
            # CamphorOS 统一把运行时会话放在 data/runtime/sessions 下
            from app.core.config import settings as camphor_settings
            db_path = camphor_settings.RUNTIME_SESSIONS_DIR / "sessions.db"
            db_path.parent.mkdir(parents=True, exist_ok=True)
        instance.db_path = db_path
        await instance._init_metadata_db()
        return instance

    async def _init_metadata_db(self):
        """初始化元数据数据库（用于会话列表管理）"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        # 会话元数据表（与SqliteSaver的checkpoints表分开）
        await cursor.execute('''
            CREATE TABLE IF NOT EXISTS session_metadata (
                thread_id TEXT PRIMARY KEY,
                agent_name TEXT NOT NULL,
                name TEXT DEFAULT '',
                working_dir TEXT,
                history_turn_limit INTEGER DEFAULT 20,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                first_message_preview TEXT DEFAULT ''
                )
        ''')

        # 数据库迁移：检查并添加缺失的字段
        await cursor.execute("PRAGMA table_info(session_metadata)")
        columns = await cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        if 'working_dir' not in column_names:
            await cursor.execute('ALTER TABLE session_metadata ADD COLUMN working_dir TEXT')
            from app.core.config import settings as camphor_settings
            default_dir = str(camphor_settings.PROJECT_ROOT)
            await cursor.execute('UPDATE session_metadata SET working_dir = ? WHERE working_dir IS NULL', (default_dir,))
        
        if 'name' not in column_names:
            await cursor.execute('ALTER TABLE session_metadata ADD COLUMN name TEXT DEFAULT \'\'')

        if 'history_turn_limit' not in column_names:
            await cursor.execute('ALTER TABLE session_metadata ADD COLUMN history_turn_limit INTEGER')
            await cursor.execute(
                'UPDATE session_metadata SET history_turn_limit = 20 WHERE history_turn_limit IS NULL'
            )

        await cursor.execute('''
            CREATE TABLE IF NOT EXISTS session_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                event_index INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                metadata_json TEXT,
                attachments_json TEXT,
                message_index INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        await cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_session_events_thread_id_id
            ON session_events(thread_id, id DESC)
        ''')
        await cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_session_events_thread_group
            ON session_events(thread_id, group_id)
        ''')

        await conn.commit()
        await conn.close()

    async def _table_exists(self, table_name: str) -> bool:
        """检查表是否存在"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()
        await cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", 
            (table_name,)
        )
        result = await cursor.fetchone() is not None
        await conn.close()
        return result

    async def create_sqlite_saver(self) -> AsyncSqliteSaver:
        """创建AsyncSqliteSaver实例"""
        # 将Windows路径转换为SQLite连接字符串格式
        db_path_str = str(self.db_path.absolute()).replace('\\', '/')
        conn = await aiosqlite.connect(db_path_str)
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()  # 创建 checkpoints / writes 表
        self._checkpointers.append(checkpointer)
        return checkpointer

    async def create_session(
        self,
        thread_id: str,
        agent_name: str,
        working_dir: Optional[str] = None,
        name: Optional[str] = None,
        history_turn_limit: int = 20,
    ) -> str:
        """创建新会话元数据"""
        # 如果没有提供working_dir，使用用户home目录
        if working_dir is None:
            from app.core.config import settings as camphor_settings
            working_dir = str(camphor_settings.PROJECT_ROOT)

        # 如果没有提供name，自动生成基于时间的名字
        if not name:
            from datetime import datetime
            name = f"会话 {datetime.now().strftime('%m-%d %H:%M')}"

        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute('''
            INSERT OR IGNORE INTO session_metadata (
                thread_id, agent_name, name, working_dir, history_turn_limit
            )
            VALUES (?, ?, ?, ?, ?)
        ''', (thread_id, agent_name, name, working_dir, history_turn_limit))

        await conn.commit()
        await conn.close()
        return thread_id

    async def update_session_preview(self, thread_id: str, first_message: str):
        """更新会话预览"""
        preview = first_message[:20] if first_message else ""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute('''
            UPDATE session_metadata
            SET first_message_preview = ?, updated_at = CURRENT_TIMESTAMP
            WHERE thread_id = ?
        ''', (preview, thread_id))

        await conn.commit()
        await conn.close()

    async def update_session_metadata(
        self,
        thread_id: str,
        *,
        agent_name: Optional[str] = None,
        name: Optional[str] = None,
        working_dir: Optional[str] = None,
        history_turn_limit: Optional[int] = None,
    ):
        """按需更新会话元数据，保证固定 thread_id 的上下文可以同步最新配置。"""
        updates = []
        params = []

        if agent_name is not None:
            updates.append("agent_name = ?")
            params.append(agent_name)
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        if working_dir is not None:
            updates.append("working_dir = ?")
            params.append(working_dir)
        if history_turn_limit is not None:
            updates.append("history_turn_limit = ?")
            params.append(history_turn_limit)

        if not updates:
            return

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(thread_id)

        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()
        await cursor.execute(
            f"""
            UPDATE session_metadata
            SET {", ".join(updates)}
            WHERE thread_id = ?
            """,
            tuple(params),
        )
        await conn.commit()
        await conn.close()

    async def get_session_list(self, agent_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取会话列表，agent_name 为 None 时返回所有会话"""
        conn = await aiosqlite.connect(self.db_path)
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()

        if agent_name:
            where_clause = "WHERE sm.agent_name = ?"
            params = (agent_name,)
        else:
            where_clause = ""
            params = ()

        if await self._table_exists('checkpoints'):
            await cursor.execute(f'''
                SELECT
                    sm.thread_id,
                    sm.agent_name,
                    sm.name,
                    sm.working_dir,
                    sm.history_turn_limit,
                    sm.created_at,
                    sm.updated_at,
                    sm.first_message_preview,
                    COUNT(c.thread_id) as message_count
                FROM session_metadata sm
                LEFT JOIN checkpoints c ON sm.thread_id = c.thread_id
                {where_clause}
                GROUP BY sm.thread_id
                ORDER BY sm.updated_at DESC
            ''', params)
        else:
            if agent_name:
                simple_where = "WHERE agent_name = ?"
            else:
                simple_where = ""
            await cursor.execute(f'''
                SELECT
                    thread_id,
                    agent_name,
                    name,
                    working_dir,
                    history_turn_limit,
                    created_at,
                    updated_at,
                    first_message_preview,
                    0 as message_count
                FROM session_metadata
                {simple_where}
                ORDER BY updated_at DESC
            ''', params)

        sessions = [dict(row) for row in await cursor.fetchall()]
        await conn.close()
        return sessions

    async def delete_session(self, thread_id: str):
        """删除会话"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute('DELETE FROM session_metadata WHERE thread_id = ?', (thread_id,))
        await cursor.execute('DELETE FROM checkpoints WHERE thread_id = ?', (thread_id,))
        await cursor.execute('DELETE FROM writes WHERE thread_id = ?', (thread_id,))
        await cursor.execute('DELETE FROM session_events WHERE thread_id = ?', (thread_id,))

        await conn.commit()
        await conn.close()


    async def clear_session(self, thread_id: str):
        """删除会话"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute('DELETE FROM checkpoints WHERE thread_id = ?', (thread_id,))
        await cursor.execute('DELETE FROM writes WHERE thread_id = ?', (thread_id,))
        await cursor.execute('DELETE FROM session_events WHERE thread_id = ?', (thread_id,))

        await conn.commit()
        await conn.close()

    async def delete_session_checkpoints(self, thread_id: str) -> None:
        """清空 LangGraph checkpoint 状态，但保留 CamphorOS session 元数据。"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute('DELETE FROM checkpoints WHERE thread_id = ?', (thread_id,))
        await cursor.execute('DELETE FROM writes WHERE thread_id = ?', (thread_id,))

        await conn.commit()
        await conn.close()

    async def repair_incomplete_tool_call_checkpoint(self, thread_id: str) -> bool:
        """移除 checkpoint 尾部不完整的 tool_call，避免下一轮模型请求 400。"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute(
            '''
            SELECT thread_id, checkpoint_ns, checkpoint_id, type, checkpoint
            FROM checkpoints
            WHERE thread_id = ?
            ORDER BY checkpoint_id DESC LIMIT 1
            ''',
            (thread_id,),
        )
        row = await cursor.fetchone()
        if not row:
            await conn.close()
            return False

        thread_id_db, checkpoint_ns, checkpoint_id, checkpoint_type, checkpoint_blob = row
        serializer = JsonPlusSerializer()
        checkpoint = serializer.loads_typed((checkpoint_type, checkpoint_blob))
        messages = checkpoint.get("channel_values", {}).get("messages", [])
        truncate_index = self._find_incomplete_tool_call_index(messages)
        if truncate_index is None:
            await conn.close()
            return False

        checkpoint["channel_values"]["messages"] = messages[:truncate_index]
        checkpoint["pending_sends"] = []
        new_type, new_blob = serializer.dumps_typed(checkpoint)

        await cursor.execute(
            '''
            UPDATE checkpoints
            SET type = ?, checkpoint = ?
            WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
            ''',
            (new_type, new_blob, thread_id_db, checkpoint_ns, checkpoint_id),
        )
        await cursor.execute('DELETE FROM writes WHERE thread_id = ?', (thread_id,))

        await conn.commit()
        await conn.close()
        return True

    @staticmethod
    def _find_incomplete_tool_call_index(messages: list[Any]) -> Optional[int]:
        for index, message in enumerate(messages):
            tool_calls = getattr(message, "tool_calls", None) or []
            if not tool_calls:
                additional_kwargs = getattr(message, "additional_kwargs", {}) or {}
                tool_calls = additional_kwargs.get("tool_calls") or []
            if not tool_calls:
                continue

            pending_ids = {
                call.get("id") if isinstance(call, dict) else getattr(call, "id", None)
                for call in tool_calls
            }
            pending_ids.discard(None)
            if not pending_ids:
                continue

            next_index = index + 1
            while pending_ids and next_index < len(messages):
                next_message = messages[next_index]
                tool_call_id = getattr(next_message, "tool_call_id", None)
                if tool_call_id:
                    pending_ids.discard(tool_call_id)
                    next_index += 1
                    continue
                return index

            if pending_ids:
                return index

        return None


    async def append_session_event(
        self,
        thread_id: str,
        group_id: str,
        event_type: str,
        content: str,
        *,
        metadata: Optional[Dict[str, Any]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        message_index: Optional[int] = None,
    ) -> int:
        """追加会话事件历史。"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute(
            'SELECT COALESCE(MAX(event_index), 0) + 1 FROM session_events WHERE thread_id = ?',
            (thread_id,),
        )
        next_index_row = await cursor.fetchone()
        next_index = next_index_row[0] if next_index_row else 1

        await cursor.execute(
            '''
            INSERT INTO session_events (
                thread_id, group_id, event_index, event_type, content,
                metadata_json, attachments_json, message_index
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                thread_id,
                group_id,
                next_index,
                event_type,
                content,
                json.dumps(metadata or {}, ensure_ascii=False),
                json.dumps(attachments or [], ensure_ascii=False),
                message_index,
            ),
        )
        event_id = cursor.lastrowid

        await conn.commit()
        await conn.close()
        return int(event_id)

    async def update_session_event_message_index(self, event_id: int, message_index: int) -> None:
        """补写用户事件对应的 checkpoint message index。"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()
        await cursor.execute(
            'UPDATE session_events SET message_index = ? WHERE id = ?',
            (message_index, event_id),
        )
        await conn.commit()
        await conn.close()

    async def _get_session_history_turn_limit(self, cursor, thread_id: str) -> int:
        await cursor.execute(
            'SELECT history_turn_limit FROM session_metadata WHERE thread_id = ?',
            (thread_id,),
        )
        row = await cursor.fetchone()
        if not row or row[0] is None:
            return 20
        try:
            limit = int(row[0])
        except (TypeError, ValueError):
            return 20
        return max(limit, 0)

    async def _trim_session_events_to_history_turn_limit(self, cursor, thread_id: str) -> None:
        turn_limit = await self._get_session_history_turn_limit(cursor, thread_id)
        if turn_limit <= 0:
            return

        await cursor.execute(
            '''
            SELECT group_id
            FROM session_events
            WHERE thread_id = ?
            GROUP BY group_id
            ORDER BY MAX(id) DESC
            LIMIT ?
            ''',
            (thread_id, turn_limit),
        )
        keep_group_rows = await cursor.fetchall()
        keep_group_ids = [row[0] for row in keep_group_rows]
        if not keep_group_ids:
            return

        placeholders = ','.join('?' for _ in keep_group_ids)
        await cursor.execute(
            f'''
            DELETE FROM session_events
            WHERE thread_id = ? AND group_id NOT IN ({placeholders})
            ''',
            (thread_id, *keep_group_ids),
        )

    async def list_session_events(
        self, thread_id: str, *, limit: int = 20, before_id: Optional[int] = None
    ) -> tuple[List[Dict[str, Any]], bool, Optional[int]]:
        """分页获取会话事件历史。"""
        conn = await aiosqlite.connect(self.db_path)
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()

        query = '''
            SELECT id, thread_id, group_id, event_index, event_type, content,
                   metadata_json, attachments_json, message_index, created_at
            FROM session_events
            WHERE thread_id = ?
        '''
        params: list[Any] = [thread_id]
        if before_id is not None:
            query += ' AND id < ?'
            params.append(before_id)
        query += ' ORDER BY id DESC LIMIT ?'
        params.append(limit + 1)

        await cursor.execute(query, params)
        rows = await cursor.fetchall()
        await conn.close()

        has_more = len(rows) > limit
        page_rows = list(reversed(rows[:limit])) if rows else []
        oldest_id = page_rows[0]['id'] if page_rows else None

        events = []
        for row in page_rows:
            events.append(
                {
                    'id': row['id'],
                    'thread_id': row['thread_id'],
                    'group_id': row['group_id'],
                    'event_index': row['event_index'],
                    'type': row['event_type'],
                    'content': row['content'],
                    'metadata': json.loads(row['metadata_json'] or '{}'),
                    'attachments': json.loads(row['attachments_json'] or '[]'),
                    'message_index': row['message_index'],
                    'created_at': row['created_at'],
                }
            )

        return events, has_more, oldest_id

    async def delete_session_events_from_message_index(self, thread_id: str, message_index: int) -> None:
        """删除指定 message_index 及之后所有 run 的事件。"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()
        await cursor.execute(
            '''
            SELECT DISTINCT group_id
            FROM session_events
            WHERE thread_id = ? AND message_index >= ?
            ''',
            (thread_id, message_index),
        )
        group_rows = await cursor.fetchall()
        group_ids = [row[0] for row in group_rows]

        if group_ids:
            placeholders = ','.join('?' for _ in group_ids)
            await cursor.execute(
                f'DELETE FROM session_events WHERE thread_id = ? AND group_id IN ({placeholders})',
                (thread_id, *group_ids),
            )

        await conn.commit()
        await conn.close()

    async def close(self):
        """关闭所有数据库连接"""
        for checkpointer in self._checkpointers:
            try:
                if hasattr(checkpointer, 'conn') and checkpointer.conn:
                    await checkpointer.conn.close()
            except Exception as e:
                print(f"Warning: Failed to close database connection: {e}")
        self._checkpointers.clear()


    async def get_session_working_dir(self, thread_id: str) -> Optional[str]:
        """获取会话的工作目录"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute('''
            SELECT working_dir FROM session_metadata WHERE thread_id = ?
        ''', (thread_id,))

        row = await cursor.fetchone()
        await conn.close()
        
        if row and row[0]:
            return row[0]
        return None

    async def get_session_agent_name(self, thread_id: str) -> Optional[str]:
        """获取会话绑定的 agent_name"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()

        await cursor.execute('''
            SELECT agent_name FROM session_metadata WHERE thread_id = ?
        ''', (thread_id,))

        row = await cursor.fetchone()
        await conn.close()
        
        if row and row[0]:
            return row[0]
        return None

    async def session_exists(self, thread_id: str) -> bool:
        """检查会话是否存在"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()
        await cursor.execute(
            'SELECT 1 FROM session_metadata WHERE thread_id = ?', 
            (thread_id,)
        )
        exists = await cursor.fetchone() is not None
        await conn.close()
        return exists

    async def rename_session(self, thread_id: str, name: str) -> None:
        """重命名会话"""
        conn = await aiosqlite.connect(self.db_path)
        cursor = await conn.cursor()
        await cursor.execute('''
            UPDATE session_metadata SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE thread_id = ?
        ''', (name, thread_id))
        await conn.commit()
        await conn.close()

    # ------------------------------------------------------------------ #
    # Cron history helpers (read-only)
    # ------------------------------------------------------------------ #

    async def get_latest_group_snapshot(self, thread_id: str) -> dict | None:
        """Return the latest group's last meaningful event for summary extraction.

        Strategy:
        1. Find the latest group_id by max(id).
        2. Within that group, return the last assistant event;
           fall back to the last error event, then the very last event.
        """
        conn = await aiosqlite.connect(self.db_path)
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()

        # 1. Latest group_id
        await cursor.execute(
            "SELECT group_id FROM session_events WHERE thread_id = ? ORDER BY id DESC LIMIT 1",
            (thread_id,),
        )
        row = await cursor.fetchone()
        if not row:
            await conn.close()
            return None

        latest_group_id = row["group_id"]

        # 2. Last assistant in this group
        await cursor.execute(
            """
            SELECT id, event_type, content, metadata_json, created_at
            FROM session_events
            WHERE thread_id = ? AND group_id = ? AND event_type = 'assistant'
            ORDER BY id DESC LIMIT 1
            """,
            (thread_id, latest_group_id),
        )
        assistant_row = await cursor.fetchone()

        # 3. Fallback: last error in this group
        if not assistant_row:
            await cursor.execute(
                """
                SELECT id, event_type, content, metadata_json, created_at
                FROM session_events
                WHERE thread_id = ? AND group_id = ? AND event_type = 'error'
                ORDER BY id DESC LIMIT 1
                """,
                (thread_id, latest_group_id),
            )
            assistant_row = await cursor.fetchone()

        # 4. Final fallback: last event in this group
        if not assistant_row:
            await cursor.execute(
                """
                SELECT id, event_type, content, metadata_json, created_at
                FROM session_events
                WHERE thread_id = ? AND group_id = ?
                ORDER BY id DESC LIMIT 1
                """,
                (thread_id, latest_group_id),
            )
            assistant_row = await cursor.fetchone()

        await conn.close()

        if not assistant_row:
            return None

        return {
            "group_id": latest_group_id,
            "event_type": assistant_row["event_type"],
            "content": assistant_row["content"],
            "metadata": json.loads(assistant_row["metadata_json"] or "{}"),
            "created_at": assistant_row["created_at"],
        }

    async def list_session_events_by_groups(
        self,
        thread_id: str,
        *,
        limit_groups: int = 20,
        before_cursor: int | None = None,
    ) -> tuple[list[dict], list[str], int | None]:
        """Fetch events grouped by group_id with pagination.

        Returns:
            (events, group_ids_in_order, next_cursor)
            - events: flat list of event dicts for the returned groups
            - group_ids_in_order: group_ids ordered by MIN(id) DESC
            - next_cursor: MIN(id) of the oldest group, or None if no more
        """
        conn = await aiosqlite.connect(self.db_path)
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()

        # 1. Get group_ids for this page, ordered by group_min_id DESC
        await cursor.execute(
            """
            SELECT group_id, MIN(id) as group_min_id
            FROM session_events
            WHERE thread_id = ?
            GROUP BY group_id
            HAVING (? IS NULL OR group_min_id < ?)
            ORDER BY group_min_id DESC
            LIMIT ?
            """,
            (thread_id, before_cursor, before_cursor, limit_groups + 1),
        )
        group_rows = await cursor.fetchall()

        has_more = len(group_rows) > limit_groups
        page_group_rows = group_rows[:limit_groups]
        group_ids = [r["group_id"] for r in page_group_rows]
        next_cursor = page_group_rows[-1]["group_min_id"] if page_group_rows and has_more else None

        if not group_ids:
            await conn.close()
            return [], [], None

        # 2. Fetch all events for these groups
        placeholders = ",".join("?" for _ in group_ids)
        await cursor.execute(
            f"""
            SELECT id, thread_id, group_id, event_index, event_type, content,
                   metadata_json, attachments_json, message_index, created_at
            FROM session_events
            WHERE thread_id = ? AND group_id IN ({placeholders})
            ORDER BY id ASC
            """,
            (thread_id, *group_ids),
        )
        event_rows = await cursor.fetchall()
        await conn.close()

        events = []
        for row in event_rows:
            events.append(
                {
                    "id": row["id"],
                    "thread_id": row["thread_id"],
                    "group_id": row["group_id"],
                    "event_index": row["event_index"],
                    "type": row["event_type"],
                    "content": row["content"],
                    "metadata": json.loads(row["metadata_json"] or "{}"),
                    "attachments": json.loads(row["attachments_json"] or "[]"),
                    "message_index": row["message_index"],
                    "created_at": row["created_at"],
                }
            )

        return events, group_ids, next_cursor
