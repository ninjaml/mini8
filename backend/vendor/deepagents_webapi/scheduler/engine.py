"""定时任务调度引擎。"""

import time
from datetime import datetime
from typing import TYPE_CHECKING, Set

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.repositories.cron_job import CronJobStore
from app.services.cron_execution_service import execute_headless
from deepagents_webapi.api.cron_models import CronJob

if TYPE_CHECKING:
    from deepagents_webapi.session.session_manager import AsyncSessionManager


class CronEngine:
    """
    基于 APScheduler 的定时任务执行器。

    数据库存任务定义，APScheduler 只保存运行时触发器。
    """

    def __init__(
        self,
        store: CronJobStore,
        session_manager: "AsyncSessionManager",
    ) -> None:
        self.store = store
        self.session_manager = session_manager
        self.scheduler = AsyncIOScheduler()
        # 当前正在执行中的任务 id，仅保存在内存里。
        self._running_job_ids: Set[int] = set()

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #

    async def start(self) -> None:
        """启动调度器，并恢复所有已启用任务的触发器。"""
        jobs = await self.store.list_enabled_jobs()
        for job in jobs:
            self._register_job(job)
        self.scheduler.start()

    def shutdown(self) -> None:
        """停止调度器；不会等待已开始的任务执行完。"""
        self.scheduler.shutdown(wait=False)

    @staticmethod
    def validate_schedule(schedule: str) -> None:
        """校验 5 段 cron 表达式是否合法。"""
        CronTrigger.from_crontab(schedule)

    # ------------------------------------------------------------------ #
    # Job registration
    # ------------------------------------------------------------------ #

    def _register_job(self, job: CronJob) -> None:
        """把一条数据库任务注册为 APScheduler 触发器。"""
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
        """从 APScheduler 中移除触发器。"""
        try:
            self.scheduler.remove_job(str(job_id))
        except Exception:
            # 这里静默兜底，避免任务本来就不存在时影响上层流程。
            pass

    # ------------------------------------------------------------------ #
    # Execution callback
    # ------------------------------------------------------------------ #

    async def _execute_job(self, job_id: int, *, ignore_enabled: bool = False, preclaimed: bool = False) -> None:
        """
        执行一次任务，并把结果回写到 cron_jobs。

        ``ignore_enabled`` 用于手动执行时绕过 enabled 开关。
        ``preclaimed`` 表示外层已经先占用了 running 标记。
        """
        if not preclaimed:
            if job_id in self._running_job_ids:
                # 同一任务不并发执行；重复触发时记一次 skipped。
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
                # 调度触发时尊重 enabled；手动执行可绕过。
                return

            await execute_headless(
                agent_name=job.agent_name,
                prompt=job.prompt,
                thread_id=job.thread_id,
                agent_session_id=job.agent_session_id,
                working_dir=job.working_dir,
                session_manager=self.session_manager,
            )

            duration_ms = int((time.time() - start_time) * 1000)
            # 只有成功执行才累计 run_count。
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
                # 只保留错误摘要，避免写入过长内容。
                last_error=str(exc)[:500],
                last_duration_ms=duration_ms,
            )
        finally:
            self._running_job_ids.discard(job_id)

    async def _on_job_fire(self, job_id: int) -> None:
        """APScheduler 触发后调用的执行入口。"""
        await self._execute_job(job_id)

    @property
    def running_job_ids(self) -> Set[int]:
        """返回当前正在执行的任务 id 集合副本。"""
        return self._running_job_ids.copy()

    def is_running(self, job_id: int) -> bool:
        """判断某个任务当前是否正在执行。"""
        return job_id in self._running_job_ids

    # ------------------------------------------------------------------ #
    # Public helpers (used by API routes)
    # ------------------------------------------------------------------ #

    async def add_and_schedule(self, job: CronJob) -> None:
        """把新建任务加入调度器。"""
        self._register_job(job)

    async def reschedule(self, job: CronJob) -> None:
        """按最新配置重新注册任务触发器。"""
        self._remove_job(job.id)
        self._register_job(job)

    async def unschedule(self, job_id: int) -> None:
        """取消后续调度；不会中断已经开始的执行。"""
        self._remove_job(job_id)

    async def run_now(self, job_id: int) -> None:
        """同步执行一次任务，忽略 enabled 开关。"""
        await self._execute_job(job_id, ignore_enabled=True)

    def trigger_run_now(self, job_id: int) -> bool:
        """后台触发一次手动执行；若任务已在运行则返回 False。"""
        if job_id in self._running_job_ids:
            return False
        self._running_job_ids.add(job_id)
        import asyncio

        asyncio.create_task(self._execute_job(job_id, ignore_enabled=True, preclaimed=True))
        return True
