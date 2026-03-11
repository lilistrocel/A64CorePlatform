"""
AI Dashboard Scheduler

Runs automated farm inspections every 4 hours in a background asyncio task.
Follows the singleton pattern established by WeatherCacheService.
"""

import asyncio
import logging
from typing import Optional

from .service import AIDashboardService

logger = logging.getLogger(__name__)


class AIDashboardScheduler:
    """
    Singleton background scheduler for periodic AI Dashboard inspections.

    Starts one asyncio task that waits 60 seconds after app startup (to allow
    full initialisation), runs an initial inspection, then repeats every 4 hours.

    Usage::

        # In app startup:
        scheduler = await AIDashboardScheduler.initialize(db)
        await scheduler.start()

        # In app shutdown:
        await AIDashboardScheduler.get_instance().stop()
    """

    INTERVAL_SECONDS: int = 4 * 3600  # 4 hours

    _instance: Optional["AIDashboardScheduler"] = None
    _db = None
    _task: Optional[asyncio.Task] = None
    _is_running: bool = False

    # -------------------------------------------------------------------------
    # Singleton access
    # -------------------------------------------------------------------------

    @classmethod
    def get_instance(cls) -> "AIDashboardScheduler":
        """
        Return the singleton AIDashboardScheduler instance.

        Returns:
            AIDashboardScheduler singleton.
        """
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    async def initialize(cls, db) -> "AIDashboardScheduler":
        """
        Initialise the scheduler with a database connection and create indexes.

        Args:
            db: Motor async MongoDB database instance.

        Returns:
            Initialised AIDashboardScheduler singleton.
        """
        instance = cls.get_instance()
        instance._db = db

        # Reason: Ensure collection indexes exist before first inspection run
        await AIDashboardService._create_indexes(db)

        logger.info("[AIDashboardScheduler] Initialised")
        return instance

    # -------------------------------------------------------------------------
    # Lifecycle
    # -------------------------------------------------------------------------

    async def start(self) -> None:
        """
        Start the background inspection loop.

        Idempotent — calling start() when already running has no effect.

        Returns:
            None
        """
        if self._is_running:
            logger.warning("[AIDashboardScheduler] Already running, skipping start()")
            return

        self._is_running = True

        async def run_loop() -> None:
            """
            Background loop: initial inspection after startup delay, then periodic.
            """
            logger.info(
                f"[AIDashboardScheduler] Started "
                f"(interval={self.INTERVAL_SECONDS}s)"
            )

            # Wait for the app to finish starting up before the first run
            await asyncio.sleep(60)

            # Initial inspection
            try:
                service = AIDashboardService(self._db)
                await service.run_inspection(triggered_by="scheduler_startup")
            except Exception as exc:
                logger.error(
                    f"[AIDashboardScheduler] Initial inspection failed: {exc}"
                )

            while self._is_running:
                try:
                    await asyncio.sleep(self.INTERVAL_SECONDS)

                    if not self._is_running:
                        break

                    service = AIDashboardService(self._db)
                    await service.run_inspection(triggered_by="scheduler")

                except asyncio.CancelledError:
                    logger.info("[AIDashboardScheduler] Task cancelled")
                    break
                except Exception as exc:
                    logger.error(
                        f"[AIDashboardScheduler] Inspection error: {exc}"
                    )
                    # Reason: Wait before retrying to avoid tight failure loops
                    await asyncio.sleep(300)

        self._task = asyncio.create_task(run_loop())
        logger.info("[AIDashboardScheduler] Background task created")

    async def stop(self) -> None:
        """
        Stop the background inspection loop gracefully.

        Returns:
            None
        """
        self._is_running = False

        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        logger.info("[AIDashboardScheduler] Stopped")
