"""SQLite-backed cron job store using aiosqlite."""

from datetime import datetime
from pathlib import Path
from typing import List, Optional

import aiosqlite

from deepagents_webapi.scheduler.models import AgentKind, CronJob


_UNSET = object()


_INIT_SQL = """
CREATE TABLE IF NOT EXISTS cron_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    target_id INTEGER,
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
    """Async SQLite store for cron job definitions.

    Uses its own aiosqlite connection (separate from AsyncSessionManager)
    but points to the same ``sessions.db`` file.
    """

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    async def init(self) -> None:
        """Create tables and indexes if they don't exist."""
        async with aiosqlite.connect(self.db_path) as conn:
            await conn.executescript(_INIT_SQL)
            await conn.commit()

    @staticmethod
    def _row_to_job(row: aiosqlite.Row) -> CronJob:
        return CronJob(
            id=row["id"],
            kind=AgentKind(row["kind"]),
            target_id=row["target_id"],
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
        target_id: Optional[int],
        agent_name: str,
        name: str,
        schedule: str,
        prompt: str,
        thread_id: str,
        working_dir: Optional[str],
    ) -> CronJob:
        """Insert a new cron job and return it."""
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                """
                INSERT INTO cron_jobs (
                    kind, target_id, agent_name, name, schedule, prompt,
                    thread_id, working_dir
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (kind.value, target_id, agent_name, name, schedule, prompt,
                 thread_id, working_dir),
            )
            await conn.commit()
            job_id = cursor.lastrowid
            assert job_id is not None

            row = await conn.execute(
                "SELECT * FROM cron_jobs WHERE id = ?", (job_id,)
            )
            row_data = await row.fetchone()
            assert row_data is not None
            return self._row_to_job(row_data)

    async def get_job(self, job_id: int) -> Optional[CronJob]:
        """Fetch a single job by id."""
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                "SELECT * FROM cron_jobs WHERE id = ?", (job_id,)
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            return self._row_to_job(row)

    async def list_jobs(self, agent_name: Optional[str] = None) -> List[CronJob]:
        """List all jobs, optionally filtered by agent_name."""
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            if agent_name:
                cursor = await conn.execute(
                    "SELECT * FROM cron_jobs WHERE agent_name = ? ORDER BY id DESC",
                    (agent_name,),
                )
            else:
                cursor = await conn.execute(
                    "SELECT * FROM cron_jobs ORDER BY id DESC"
                )
            rows = await cursor.fetchall()
            return [self._row_to_job(r) for r in rows]

    async def list_enabled_jobs(self) -> List[CronJob]:
        """List only enabled jobs."""
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                "SELECT * FROM cron_jobs WHERE enabled = 1 ORDER BY id"
            )
            rows = await cursor.fetchall()
            return [self._row_to_job(r) for r in rows]

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
        """Partial update of a cron job. Returns the updated job or None."""
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

        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(job_id)

        async with aiosqlite.connect(self.db_path) as conn:
            await conn.execute(
                f"UPDATE cron_jobs SET {', '.join(fields)} WHERE id = ?",
                tuple(values),
            )
            await conn.commit()

        return await self.get_job(job_id)

    async def delete_job(self, job_id: int) -> bool:
        """Delete a job by id. Returns True if a row was deleted."""
        async with aiosqlite.connect(self.db_path) as conn:
            cursor = await conn.execute(
                "DELETE FROM cron_jobs WHERE id = ?", (job_id,)
            )
            await conn.commit()
            return cursor.rowcount > 0