"""定时任务表的 SQLite 读写封装。"""

from datetime import datetime
from pathlib import Path
from typing import List, Optional

import aiosqlite

from app.core.sqlite_connection import connect_aiosqlite
from deepagents_webapi.api.cron_models import AgentKind, CronJob


_UNSET = object()
# 用于区分“字段未传入”和“字段明确要写入 None”。


_INIT_SQL = """
CREATE TABLE IF NOT EXISTS cron_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    agent_session_id INTEGER,
    agent_name TEXT NOT NULL,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    thread_id TEXT NOT NULL,
    working_dir TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_run_at TIMESTAMP,
    last_status TEXT,
    last_error TEXT,
    last_duration_ms INTEGER,
    run_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent ON cron_jobs(agent_name);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON cron_jobs(enabled);
"""


class CronJobStore:
    """
    ``cron_jobs`` 表的异步存储层。

    这里只负责基础读写，不负责调度校验、执行控制等业务逻辑。
    """

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    async def init(self) -> None:
        """初始化表结构，并补齐兼容旧库所需的字段。"""
        conn = await connect_aiosqlite(self.db_path)
        try:
            await conn.executescript(_INIT_SQL)
            cursor = await conn.execute("PRAGMA table_info(cron_jobs)")
            columns = await cursor.fetchall()
            column_names = {row[1] for row in columns}
            if "agent_session_id" not in column_names:
                await conn.execute("ALTER TABLE cron_jobs ADD COLUMN agent_session_id INTEGER")
            await conn.commit()
        finally:
            await conn.close()

    @staticmethod
    def _row_to_job(row: aiosqlite.Row) -> CronJob | None:
        # 遇到当前代码无法识别的 kind 时，直接跳过这行数据。
        try:
            kind = AgentKind(row["kind"])
        except ValueError:
            return None
        return CronJob(
            id=row["id"],
            kind=kind,
            agent_session_id=row["agent_session_id"] if "agent_session_id" in row.keys() else None,
            agent_name=row["agent_name"],
            name=row["name"],
            schedule=row["schedule"],
            prompt=row["prompt"],
            thread_id=row["thread_id"],
            working_dir=row["working_dir"],
            enabled=bool(row["enabled"]),
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            last_run_at=(
                datetime.fromisoformat(row["last_run_at"])
                if row["last_run_at"] else None
            ),
            last_status=row["last_status"],
            last_error=row["last_error"],
            last_duration_ms=row["last_duration_ms"],
            run_count=row["run_count"],
        )

    async def create_job(
        self,
        *,
        kind: AgentKind,
        agent_session_id: Optional[int],
        agent_name: str,
        name: str,
        schedule: str,
        prompt: str,
        thread_id: str,
        working_dir: Optional[str],
    ) -> CronJob:
        """创建一条定时任务定义，并返回完整任务对象。"""
        conn = await connect_aiosqlite(self.db_path)
        try:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                """
                INSERT INTO cron_jobs (
                    kind, agent_session_id, agent_name, name, schedule, prompt,
                    thread_id, working_dir
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    kind.value,
                    agent_session_id,
                    agent_name,
                    name,
                    schedule,
                    prompt,
                    thread_id,
                    working_dir,
                ),
            )
            await conn.commit()
            job_id = cursor.lastrowid
            assert job_id is not None

            row = await conn.execute("SELECT * FROM cron_jobs WHERE id = ?", (job_id,))
            row_data = await row.fetchone()
            assert row_data is not None
            return self._row_to_job(row_data)
        finally:
            await conn.close()

    async def get_job(self, job_id: int) -> Optional[CronJob]:
        """按主键读取单个任务。"""
        conn = await connect_aiosqlite(self.db_path)
        try:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute("SELECT * FROM cron_jobs WHERE id = ?", (job_id,))
            row = await cursor.fetchone()
            if row is None:
                return None
            return self._row_to_job(row)
        finally:
            await conn.close()

    async def list_jobs(self, agent_name: Optional[str] = None) -> List[CronJob]:
        """查询任务列表；可按 agent_name 过滤。"""
        conn = await connect_aiosqlite(self.db_path)
        try:
            conn.row_factory = aiosqlite.Row
            if agent_name:
                cursor = await conn.execute(
                    "SELECT * FROM cron_jobs WHERE agent_name = ? ORDER BY id DESC",
                    (agent_name,),
                )
            else:
                cursor = await conn.execute("SELECT * FROM cron_jobs ORDER BY id DESC")
            rows = await cursor.fetchall()
            jobs = [self._row_to_job(r) for r in rows]
            return [job for job in jobs if job is not None]
        finally:
            await conn.close()

    async def list_jobs_by_agent_session_ids(self, agent_session_ids: List[int]) -> List[CronJob]:
        """查询绑定到一组 AgentSession 的所有任务。"""
        if not agent_session_ids:
            return []
        placeholders = ",".join("?" for _ in agent_session_ids)
        conn = await connect_aiosqlite(self.db_path)
        try:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                f"SELECT * FROM cron_jobs WHERE agent_session_id IN ({placeholders}) ORDER BY id DESC",
                tuple(agent_session_ids),
            )
            rows = await cursor.fetchall()
            jobs = [self._row_to_job(r) for r in rows]
            return [job for job in jobs if job is not None]
        finally:
            await conn.close()

    async def list_jobs_by_agent_session_id(self, agent_session_id: int) -> List[CronJob]:
        """查询绑定到单个 AgentSession 的任务。"""
        conn = await connect_aiosqlite(self.db_path)
        try:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                "SELECT * FROM cron_jobs WHERE agent_session_id = ? ORDER BY id DESC",
                (agent_session_id,),
            )
            rows = await cursor.fetchall()
            jobs = [self._row_to_job(r) for r in rows]
            return [job for job in jobs if job is not None]
        finally:
            await conn.close()

    async def list_enabled_jobs(self) -> List[CronJob]:
        """查询所有已启用任务，供调度器启动时恢复注册。"""
        conn = await connect_aiosqlite(self.db_path)
        try:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute("SELECT * FROM cron_jobs WHERE enabled = 1 ORDER BY id")
            rows = await cursor.fetchall()
            jobs = [self._row_to_job(r) for r in rows]
            return [job for job in jobs if job is not None]
        finally:
            await conn.close()

    async def update_job(
        self,
        job_id: int,
        *,
        name: Optional[str] = None,
        schedule: Optional[str] = None,
        prompt: Optional[str] = None,
        enabled: Optional[bool] = None,
        working_dir: Optional[str] = None,
        last_run_at: Optional[datetime] | object = _UNSET,
        last_status: Optional[str] | object = _UNSET,
        last_error: Optional[str] | object = _UNSET,
        last_duration_ms: Optional[int] | object = _UNSET,
        run_count: Optional[int] | object = _UNSET,
    ) -> Optional[CronJob]:
        """
        按传入字段局部更新任务。

        运行结果相关字段使用 ``_UNSET`` 区分“未传入”和“明确写空”。
        """
        fields: List[str] = []
        values: List[object] = []

        if name is not None:
            fields.append("name = ?")
            values.append(name)
        if schedule is not None:
            fields.append("schedule = ?")
            values.append(schedule)
        if prompt is not None:
            fields.append("prompt = ?")
            values.append(prompt)
        if enabled is not None:
            fields.append("enabled = ?")
            values.append(1 if enabled else 0)
        # 这里只支持更新为非空路径，不支持显式清空为 NULL。
        if working_dir is not None:
            fields.append("working_dir = ?")
            values.append(working_dir)
        if last_run_at is not _UNSET:
            fields.append("last_run_at = ?")
            values.append(last_run_at.isoformat() if last_run_at is not None else None)
        if last_status is not _UNSET:
            fields.append("last_status = ?")
            values.append(last_status)
        if last_error is not _UNSET:
            fields.append("last_error = ?")
            values.append(last_error)
        if last_duration_ms is not _UNSET:
            fields.append("last_duration_ms = ?")
            values.append(last_duration_ms)
        if run_count is not _UNSET:
            fields.append("run_count = ?")
            values.append(run_count)

        if not fields:
            return await self.get_job(job_id)

        # 只要有任何字段发生更新，就刷新 updated_at。
        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(job_id)

        conn = await connect_aiosqlite(self.db_path)
        try:
            await conn.execute(
                f"UPDATE cron_jobs SET {', '.join(fields)} WHERE id = ?",
                tuple(values),
            )
            await conn.commit()
        finally:
            await conn.close()

        return await self.get_job(job_id)

    async def delete_job(self, job_id: int) -> bool:
        """删除任务定义；只影响 cron_jobs 表。"""
        conn = await connect_aiosqlite(self.db_path)
        try:
            cursor = await conn.execute("DELETE FROM cron_jobs WHERE id = ?", (job_id,))
            await conn.commit()
            return cursor.rowcount > 0
        finally:
            await conn.close()
