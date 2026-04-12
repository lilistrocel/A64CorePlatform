"""
Watchdog Scheduler - Singleton asyncio background loop with dynamic interval from DB config.

Uses a Redis distributed lock so only ONE Uvicorn worker runs the check
per cycle (multiple workers each start their own scheduler instance).
"""

import asyncio
import logging
import os
from datetime import datetime
from typing import Optional

from .config_service import WatchdogConfigService
from .service import WatchdogService

logger = logging.getLogger(__name__)

LOCK_KEY = "watchdog:scheduler_lock"
LOCK_TTL_SECONDS = 120  # Lock auto-expires in 2 minutes (safety net)


class WatchdogScheduler:
    """
    Singleton background scheduler for periodic watchdog checks.

    Re-reads checkIntervalMinutes from DB each cycle so admin changes
    take effect without restart.

    Usage::

        scheduler = await WatchdogScheduler.initialize(db)
        await scheduler.start()

        # On shutdown:
        await WatchdogScheduler.get_instance().stop()
    """

    _instance: Optional["WatchdogScheduler"] = None
    _db = None
    _task: Optional[asyncio.Task] = None
    _is_running: bool = False
    _last_run: Optional[datetime] = None
    _last_result: Optional[dict] = None

    @classmethod
    def get_instance(cls) -> "WatchdogScheduler":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    async def initialize(cls, db) -> "WatchdogScheduler":
        instance = cls.get_instance()
        instance._db = db

        # Ensure indexes
        service = WatchdogService(db)
        await service.create_indexes()

        logger.info("[WatchdogScheduler] Initialised")
        return instance

    async def _acquire_lock(self, interval: int) -> bool:
        """Try to acquire a Redis distributed lock. Returns True if acquired."""
        try:
            from src.core.cache.redis_cache import get_redis_cache

            cache = await get_redis_cache()
            if not cache.is_available or not cache._redis:
                # Redis unavailable — fall back to running (better noisy than silent)
                return True

            # SET NX with TTL = lock duration (interval or fallback)
            ttl = min(interval, LOCK_TTL_SECONDS)
            acquired = await cache._redis.set(LOCK_KEY, "1", nx=True, ex=ttl)
            return bool(acquired)
        except Exception as e:
            logger.warning(f"[WatchdogScheduler] Lock acquire failed: {e}")
            return True  # Fall back to running if Redis errors

    async def start(self) -> None:
        """Start the background watchdog loop. Idempotent."""
        if self._is_running:
            logger.warning("[WatchdogScheduler] Already running, skipping start()")
            return

        self._is_running = True

        async def run_loop() -> None:
            logger.info("[WatchdogScheduler] Started")

            # Wait for app to finish starting up
            await asyncio.sleep(30)

            while self._is_running:
                try:
                    # Read interval from DB each cycle
                    config_svc = WatchdogConfigService(self._db)
                    config = await config_svc.get_config()
                    interval = config.checkIntervalMinutes * 60

                    if config.enabled:
                        # Acquire distributed lock so only 1 worker runs per cycle
                        if not await self._acquire_lock(interval):
                            logger.debug("[WatchdogScheduler] Another worker holds the lock, skipping")
                        else:
                            service = WatchdogService(self._db)
                            result = await service.run_check(triggered_by="scheduler")
                            self._last_run = datetime.utcnow()
                            self._last_result = result.model_dump()
                    else:
                        logger.debug("[WatchdogScheduler] Watchdog disabled, sleeping")

                    await asyncio.sleep(interval)

                except asyncio.CancelledError:
                    logger.info("[WatchdogScheduler] Task cancelled")
                    break
                except Exception as exc:
                    logger.error(f"[WatchdogScheduler] Error: {exc}")
                    await asyncio.sleep(300)  # Wait before retry

        self._task = asyncio.create_task(run_loop())
        logger.info("[WatchdogScheduler] Background task created")

    async def stop(self) -> None:
        """Stop the background loop gracefully."""
        self._is_running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("[WatchdogScheduler] Stopped")

    def get_status(self) -> dict:
        """Return scheduler status for the API."""
        return {
            "isRunning": self._is_running,
            "lastRun": self._last_run.isoformat() if self._last_run else None,
            "lastResult": self._last_result,
        }
