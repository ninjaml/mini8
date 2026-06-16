"""APScheduler-based cron engine for headless agent execution."""

import time
from datetime import datetime
from typing import TYPE_CHECKING, Set

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from deepagents_webapi.scheduler.executor import execute_headless
from deepagents_webapi.scheduler.models import CronJob
from deepagents_webapi.scheduler.store import CronJobStore

if TYPE_CHECKING:
    from deepagents_webapi.session.session_manager import AsyncSessionManager


class CronEngine:
    """Wraps APScheduler AsyncIOScheduler with cron job persistence.

    Lifecycle:
        1. ``await engine.start()`` — loads enabled jobs from store and registers triggers.
        2. Scheduler fires -> ``_on_job_fire(job_id)`` -> ``execute_headless()``.
        3. ``engine.shutdown()`` on FastAPI shutdown.
    """

    def __init__(
        self,
        store: CronJobStore,
        session_manager: "AsyncSessionManager",
    ) -> None:
        self.store = store
        self.session_manager = session_manager
        self.scheduler = AsyncIOScheduler()
        self._running_job_ids: Set[int] = set()

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #

    async def start(self) -> None:
        """Load enabled jobs from DB and start the scheduler."""
        jobs = await self.store.list_enabled_jobs()
        for job in jobs:
            self._register_job(job)
        self.scheduler.start()

    def shutdown(self) -> None:
        """Gracefully stop the scheduler (non-blocking)."""
        self.scheduler.shutdown(wait=False)

    @staticmethod
    def validate_schedule(schedule: str) -> None:
        """Validate a crontab expression and raise on invalid input."""
        CronTrigger.from_crontab(schedule)

    # ------------------------------------------------------------------ #
    # Job registration
    # ------------------------------------------------------------------ #

    def _register_job(self, job: CronJob) -> None:
        """Add (or replace) an APScheduler job for the given cron job row."""
        self.validate_schedule(job.schedule)
        trigger = CronTrigger.from_crontab(job.schedule)
        self.scheduler.add_job(
            self._on_job_fire,
            trigger=trigger,
            id=str(job.id),
            args=(job.id,),
            replace_existing=True,
        )

    def _remove_job(self, job_id: int) -> None:
        """Remove a scheduled APScheduler job by id."""
        try:
            self.scheduler.remove_job(str(job_id))
        except Exception:
            pass

    # ------------------------------------------------------------------ #
    # Execution callback
    # ------------------------------------------------------------------ #

    async def _execute_job(self, job_id: int, *, ignore_enabled: bool = False) -> None:
        """Execute a job once, optionally bypassing the enabled switch."""
        if job_id in self._running_job_ids:
            await self.store.update_job(
                job_id,
                last_run_at=datetime.utcnow(),
                last_status="skipped",
                last_duration_ms=0,
            )
            return

        self._running_job_ids.add(job_id)
        start_time = time.time()

        try:
            job = await self.store.get_job(job_id)
            if job is None:
                return
            if not ignore_enabled and not job.enabled:
                return

            await execute_headless(
                agent_name=job.agent_name,
                prompt=job.prompt,
                thread_id=job.thread_id,
                working_dir=job.working_dir,
                session_manager=self.session_manager,
            )

            duration_ms = int((time.time() - start_time) * 1000)
            await self.store.update_job(
                job_id,
                last_run_at=datetime.utcnow(),
                last_status="success",
                last_error=None,
                last_duration_ms=duration_ms,
                run_count=job.run_count + 1,
            )
        except Exception as exc:
            duration_ms = int((time.time() - start_time) * 1000)
            await self.store.update_job(
                job_id,
                last_run_at=datetime.utcnow(),
                last_status="error",
                last_error=str(exc)[:500],
                last_duration_ms=duration_ms,
            )
        finally:
            self._running_job_ids.discard(job_id)

    async def _on_job_fire(self, job_id: int) -> None:
        """Called by APScheduler when a cron expression fires."""
        await self._execute_job(job_id)

    @property
    def running_job_ids(self) -> Set[int]:
        """Return the set of job ids currently being executed."""
        return self._running_job_ids.copy()

    def is_running(self, job_id: int) -> bool:
        """Return whether the given job is currently being executed."""
        return job_id in self._running_job_ids

    # ------------------------------------------------------------------ #
    # Public helpers (used by API routes)
    # ------------------------------------------------------------------ #

    async def add_and_schedule(self, job: CronJob) -> None:
        """Register a newly-created job in the running scheduler."""
        self._register_job(job)

    async def reschedule(self, job: CronJob) -> None:
        """Update the schedule of an existing job."""
        self._remove_job(job.id)
        self._register_job(job)

    async def unschedule(self, job_id: int) -> None:
        """Remove a job from the scheduler."""
        self._remove_job(job_id)

    async def run_now(self, job_id: int) -> None:
        """Manually execute a job once, regardless of enabled state."""
        await self._execute_job(job_id, ignore_enabled=True)
