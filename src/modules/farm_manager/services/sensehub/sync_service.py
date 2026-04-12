"""
SenseHub Sync Service

Once-per-day background sync that pulls equipment, alerts, and lab data from
all IoT-connected SenseHub instances and persists them to MongoDB.  When
SenseHub is offline, dashboards and AI tools fall back to cached data.

Follows the WeatherCacheService / WatchdogScheduler singleton pattern:
  - asyncio background task with configurable interval
  - Redis distributed lock to prevent duplicate runs across Uvicorn workers
  - Per-block error isolation (one failure doesn't stop the full sync)
  - 90-day TTL on all cached data
"""

import asyncio
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from ..database import farm_db
from .sensehub_connection_service import SenseHubConnectionService

logger = logging.getLogger(__name__)

# Redis lock key to prevent multiple workers from syncing simultaneously
LOCK_KEY = "sensehub:sync_lock"
LOCK_TTL_SECONDS = 600  # 10 minutes (sync can take a while)

# TTL for cached data in seconds (90 days)
CACHE_TTL_SECONDS = 90 * 24 * 60 * 60

# MCP call timeout
MCP_CALL_TIMEOUT = 10.0

# REST call timeout
REST_CALL_TIMEOUT = 5.0

# Delay between blocks to avoid overwhelming SenseHub
INTER_BLOCK_DELAY = 1.0

# Default sync interval (3 hours — must stay under the 4h watchdog stale threshold)
DEFAULT_SYNC_INTERVAL = 10800

# Startup delay before first sync (30 seconds)
STARTUP_DELAY = 30

# Snapshot cache TTL (180 days — images are larger, keep longer)
SNAPSHOT_TTL_SECONDS = 180 * 24 * 60 * 60

# Base directory for downloaded snapshot images
SNAPSHOT_STORAGE_DIR = Path("data/sensehub_images")

# Max snapshots to fetch per camera per sync (last 24h worth at 4h intervals = 6)
SNAPSHOTS_PER_CAMERA = 6


class SenseHubSyncService:
    """
    Singleton background service that syncs SenseHub data to MongoDB.

    Usage::

        service = await SenseHubSyncService.initialize(db)
        await service.start_background_sync()

        # On shutdown:
        await SenseHubSyncService.get_instance().stop_background_sync()
    """

    _instance: Optional["SenseHubSyncService"] = None
    _db = None
    _task: Optional[asyncio.Task] = None
    _is_running: bool = False
    _last_sync: Optional[datetime] = None
    _last_sync_result: Optional[dict] = None

    @classmethod
    def get_instance(cls) -> "SenseHubSyncService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    async def initialize(cls, db) -> "SenseHubSyncService":
        instance = cls.get_instance()
        instance._db = db
        await instance._create_indexes()
        logger.info("[SenseHubSync] Initialized")
        return instance

    # =========================================================================
    # Index creation
    # =========================================================================

    async def _create_indexes(self) -> None:
        if self._db is None:
            return

        try:
            # --- sensehub_equipment_cache ---
            eq_col = self._db["sensehub_equipment_cache"]
            await eq_col.create_index(
                [("blockId", 1), ("equipmentId", 1)],
                unique=True,
                name="uniq_block_equipment",
            )
            await eq_col.create_index("farmId", name="idx_farmId")
            await eq_col.create_index(
                "syncedAt",
                expireAfterSeconds=CACHE_TTL_SECONDS,
                name="ttl_syncedAt",
            )
            await eq_col.create_index(
                [("blockId", 1), ("type", 1)],
                name="idx_block_type",
            )

            # --- sensehub_lab_cache ---
            lab_col = self._db["sensehub_lab_cache"]
            await lab_col.create_index(
                [("blockId", 1), ("nutrient", 1), ("zone", 1), ("timestamp", 1)],
                unique=True,
                name="uniq_block_nutrient_zone_ts",
            )
            await lab_col.create_index("farmId", name="idx_farmId")
            await lab_col.create_index(
                "syncedAt",
                expireAfterSeconds=CACHE_TTL_SECONDS,
                name="ttl_syncedAt",
            )
            await lab_col.create_index(
                [("blockId", 1), ("zone", 1), ("timestamp", -1)],
                name="idx_block_zone_ts",
            )

            # --- sensehub_alerts_cache ---
            alert_col = self._db["sensehub_alerts_cache"]
            await alert_col.create_index(
                [("blockId", 1), ("alertId", 1)],
                unique=True,
                name="uniq_block_alert",
            )
            await alert_col.create_index("farmId", name="idx_farmId")
            await alert_col.create_index(
                "syncedAt",
                expireAfterSeconds=CACHE_TTL_SECONDS,
                name="ttl_syncedAt",
            )
            await alert_col.create_index(
                [("blockId", 1), ("severity", 1)],
                name="idx_block_severity",
            )

            # --- sensehub_snapshots_cache ---
            snap_col = self._db["sensehub_snapshots_cache"]
            await snap_col.create_index(
                [("blockId", 1), ("cameraId", 1), ("snapshotId", 1)],
                unique=True,
                name="uniq_block_camera_snapshot",
            )
            await snap_col.create_index("farmId", name="idx_farmId")
            await snap_col.create_index(
                "syncedAt",
                expireAfterSeconds=SNAPSHOT_TTL_SECONDS,
                name="ttl_syncedAt",
            )
            await snap_col.create_index(
                [("blockId", 1), ("cameraId", 1), ("capturedAt", -1)],
                name="idx_block_camera_captured",
            )

            # --- sensehub_sync_log ---
            log_col = self._db["sensehub_sync_log"]
            await log_col.create_index("syncId", unique=True, name="uniq_syncId")
            await log_col.create_index(
                "startedAt",
                expireAfterSeconds=CACHE_TTL_SECONDS,
                name="ttl_startedAt",
            )

            logger.info("[SenseHubSync] MongoDB indexes created/verified")
        except Exception as e:
            logger.error(f"[SenseHubSync] Index creation error: {e}")

    # =========================================================================
    # Redis distributed lock
    # =========================================================================

    async def _acquire_lock(self) -> bool:
        try:
            from src.core.cache.redis_cache import get_redis_cache

            cache = await get_redis_cache()
            if not cache.is_available or not cache._redis:
                return True  # No Redis = fall back to running

            acquired = await cache._redis.set(
                LOCK_KEY, "1", nx=True, ex=LOCK_TTL_SECONDS
            )
            return bool(acquired)
        except Exception as e:
            logger.warning(f"[SenseHubSync] Lock acquire failed: {e}")
            return True

    async def _release_lock(self) -> None:
        try:
            from src.core.cache.redis_cache import get_redis_cache

            cache = await get_redis_cache()
            if cache.is_available and cache._redis:
                await cache._redis.delete(LOCK_KEY)
        except Exception:
            pass

    # =========================================================================
    # Background sync loop
    # =========================================================================

    async def start_background_sync(
        self, interval_seconds: int = DEFAULT_SYNC_INTERVAL
    ) -> None:
        if self._is_running:
            logger.warning("[SenseHubSync] Already running, skipping start()")
            return

        self._is_running = True

        async def sync_loop() -> None:
            logger.info("[SenseHubSync] Background sync started")
            await asyncio.sleep(STARTUP_DELAY)

            while self._is_running:
                try:
                    if not await self._acquire_lock():
                        logger.debug(
                            "[SenseHubSync] Another worker holds the lock, skipping"
                        )
                    else:
                        try:
                            await self.run_sync()
                        finally:
                            await self._release_lock()

                    await asyncio.sleep(interval_seconds)

                except asyncio.CancelledError:
                    logger.info("[SenseHubSync] Task cancelled")
                    break
                except Exception as exc:
                    logger.error(f"[SenseHubSync] Loop error: {exc}")
                    await asyncio.sleep(300)

        self._task = asyncio.create_task(sync_loop())
        logger.info("[SenseHubSync] Background task created")

    async def stop_background_sync(self) -> None:
        self._is_running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("[SenseHubSync] Stopped")

    # =========================================================================
    # Core sync logic
    # =========================================================================

    async def run_sync(self) -> dict:
        """
        Execute a full sync across all IoT-connected blocks.

        Returns:
            Summary dict with counts and timing.
        """
        sync_id = str(uuid4())
        started_at = datetime.utcnow()
        logger.info(f"[SenseHubSync] Starting sync {sync_id}")

        # Get all IoT-connected blocks
        iot_blocks = await self._get_iot_blocks()

        blocks_succeeded = 0
        blocks_failed = 0
        total_equipment = 0
        total_alerts = 0
        total_lab_readings = 0
        total_snapshots = 0
        errors: List[Dict[str, Any]] = []

        for block in iot_blocks:
            block_id_str = block.get("blockId", "")
            farm_id_str = block.get("farmId", "")
            block_name = block.get("name", block_id_str)

            try:
                eq_count, alert_count, lab_count, snap_count = await self._sync_block(
                    block, farm_id_str, block_id_str
                )
                total_equipment += eq_count
                total_alerts += alert_count
                total_lab_readings += lab_count
                total_snapshots += snap_count
                blocks_succeeded += 1
                logger.debug(
                    f"[SenseHubSync] Block '{block_name}': "
                    f"eq={eq_count}, alerts={alert_count}, lab={lab_count}, snapshots={snap_count}"
                )
            except Exception as exc:
                blocks_failed += 1
                errors.append({
                    "blockId": block_id_str,
                    "blockName": block_name,
                    "error": str(exc),
                })
                logger.warning(
                    f"[SenseHubSync] Block '{block_name}' failed: {exc}"
                )

            # Throttle between blocks
            await asyncio.sleep(INTER_BLOCK_DELAY)

        completed_at = datetime.utcnow()
        duration = (completed_at - started_at).total_seconds()

        result = {
            "syncId": sync_id,
            "startedAt": started_at,
            "completedAt": completed_at,
            "durationSeconds": round(duration, 2),
            "status": "completed",
            "blocksScanned": len(iot_blocks),
            "blocksSucceeded": blocks_succeeded,
            "blocksFailed": blocks_failed,
            "dataPoints": {
                "equipment": total_equipment,
                "alerts": total_alerts,
                "labReadings": total_lab_readings,
                "snapshots": total_snapshots,
            },
            "errors": errors[:20],  # Cap error list
        }

        # Persist sync log
        await self._write_sync_log(result)

        self._last_sync = completed_at
        self._last_sync_result = result

        logger.info(
            f"[SenseHubSync] Sync completed in {duration:.1f}s: "
            f"{blocks_succeeded}/{len(iot_blocks)} blocks, "
            f"eq={total_equipment}, alerts={total_alerts}, lab={total_lab_readings}, snapshots={total_snapshots}"
        )

        return result

    async def _get_iot_blocks(self) -> List[Dict[str, Any]]:
        db = self._db if self._db is not None else farm_db.get_database()
        cursor = db.blocks.find({
            "isActive": True,
            "iotController.enabled": True,
        })
        return await cursor.to_list(length=1000)

    async def _sync_block(
        self,
        block: Dict[str, Any],
        farm_id_str: str,
        block_id_str: str,
    ) -> tuple:
        """
        Sync a single block's data. Returns (eq_count, alert_count, lab_count, snap_count).
        """
        now = datetime.utcnow()
        farm_uuid = UUID(farm_id_str)
        block_uuid = UUID(block_id_str)

        eq_count = 0
        alert_count = 0
        lab_count = 0
        snap_count = 0

        # 1. Equipment via REST client
        try:
            client = await SenseHubConnectionService.get_client(farm_uuid, block_uuid)
            equipment_raw = await asyncio.wait_for(
                client.get_equipment(), timeout=REST_CALL_TIMEOUT
            )
            if isinstance(equipment_raw, list):
                eq_count = await self._upsert_equipment(
                    block_id_str, farm_id_str, equipment_raw, now
                )
                await SenseHubConnectionService._update_token_cache(
                    farm_uuid, block_uuid, client
                )
        except Exception as exc:
            logger.debug(f"[SenseHubSync] Equipment sync failed for {block_id_str}: {exc}")

        # 2. Alerts via REST client
        try:
            client = await SenseHubConnectionService.get_client(farm_uuid, block_uuid)
            alerts_raw = await asyncio.wait_for(
                client.get_alerts(), timeout=REST_CALL_TIMEOUT
            )
            if isinstance(alerts_raw, list):
                alert_count = await self._upsert_alerts(
                    block_id_str, farm_id_str, alerts_raw, now
                )
        except Exception as exc:
            logger.debug(f"[SenseHubSync] Alert sync failed for {block_id_str}: {exc}")

        # 3. Lab readings via MCP (if configured)
        iot_ctrl = block.get("iotController") or {}
        if iot_ctrl.get("mcpApiKey"):
            try:
                mcp_client = await SenseHubConnectionService.get_mcp_client(
                    farm_uuid, block_uuid
                )
                lab_raw = await asyncio.wait_for(
                    mcp_client.get_lab_latest(), timeout=MCP_CALL_TIMEOUT
                )
                if isinstance(lab_raw, list):
                    lab_count = await self._upsert_lab_readings(
                        block_id_str, farm_id_str, lab_raw, now
                    )
            except Exception as exc:
                logger.debug(
                    f"[SenseHubSync] Lab sync failed for {block_id_str}: {exc}"
                )

            # 4. Camera snapshots via MCP
            try:
                snap_count = await self._sync_block_snapshots(
                    block_id_str, farm_id_str, farm_uuid, block_uuid, now
                )
            except Exception as exc:
                logger.debug(
                    f"[SenseHubSync] Snapshot sync failed for {block_id_str}: {exc}"
                )

        # 5. Update lastSyncedAt on the block so the watchdog knows we synced
        if eq_count > 0 or alert_count > 0 or lab_count > 0 or snap_count > 0:
            try:
                db = self._db if self._db is not None else farm_db.get_database()
                await db.blocks.update_one(
                    {"blockId": block_id_str, "farmId": farm_id_str},
                    {"$set": {"iotController.lastSyncedAt": now}},
                )
            except Exception as exc:
                logger.debug(f"[SenseHubSync] Failed to update lastSyncedAt for {block_id_str}: {exc}")

        return eq_count, alert_count, lab_count, snap_count

    # =========================================================================
    # Upsert helpers
    # =========================================================================

    async def _upsert_equipment(
        self,
        block_id: str,
        farm_id: str,
        equipment_list: List[Dict[str, Any]],
        synced_at: datetime,
    ) -> int:
        db = self._db if self._db is not None else farm_db.get_database()
        col = db["sensehub_equipment_cache"]
        count = 0

        for eq in equipment_list:
            if not isinstance(eq, dict):
                continue

            equipment_id = eq.get("id") or eq.get("equipment_id") or eq.get("equipmentId")
            if equipment_id is None:
                continue

            doc = {
                "blockId": block_id,
                "farmId": farm_id,
                "equipmentId": str(equipment_id),
                "name": eq.get("name", ""),
                "type": eq.get("type", ""),
                "zone": eq.get("zone", ""),
                "status": eq.get("status", "unknown"),
                "lastReading": eq.get("last_reading") or eq.get("lastReading"),
                "metadata": {
                    k: v for k, v in eq.items()
                    if k not in ("id", "equipment_id", "equipmentId", "name",
                                 "type", "zone", "status", "last_reading", "lastReading")
                },
                "syncedAt": synced_at,
            }

            await col.update_one(
                {"blockId": block_id, "equipmentId": str(equipment_id)},
                {"$set": doc},
                upsert=True,
            )
            count += 1

        return count

    async def _upsert_alerts(
        self,
        block_id: str,
        farm_id: str,
        alerts_list: List[Dict[str, Any]],
        synced_at: datetime,
    ) -> int:
        db = self._db if self._db is not None else farm_db.get_database()
        col = db["sensehub_alerts_cache"]
        count = 0

        for alert in alerts_list:
            if not isinstance(alert, dict):
                continue

            alert_id = alert.get("id") or alert.get("alert_id") or alert.get("alertId")
            if alert_id is None:
                continue

            doc = {
                "blockId": block_id,
                "farmId": farm_id,
                "alertId": str(alert_id),
                "severity": alert.get("severity", "info"),
                "message": alert.get("message", ""),
                "acknowledged": alert.get("acknowledged", False),
                "alertData": {
                    k: v for k, v in alert.items()
                    if k not in ("id", "alert_id", "alertId", "severity",
                                 "message", "acknowledged")
                },
                "syncedAt": synced_at,
            }

            await col.update_one(
                {"blockId": block_id, "alertId": str(alert_id)},
                {"$set": doc},
                upsert=True,
            )
            count += 1

        return count

    async def _upsert_lab_readings(
        self,
        block_id: str,
        farm_id: str,
        lab_list: List[Dict[str, Any]],
        synced_at: datetime,
    ) -> int:
        db = self._db if self._db is not None else farm_db.get_database()
        col = db["sensehub_lab_cache"]
        count = 0

        for reading in lab_list:
            if not isinstance(reading, dict):
                continue

            nutrient = reading.get("nutrient", "unknown")
            zone = reading.get("zone", "unknown")
            timestamp = reading.get("timestamp")

            # Use a stable timestamp string for deduplication
            ts_str = str(timestamp) if timestamp else synced_at.isoformat()

            doc = {
                "blockId": block_id,
                "farmId": farm_id,
                "nutrient": nutrient,
                "value": reading.get("value"),
                "unit": reading.get("unit", ""),
                "zone": zone,
                "timestamp": ts_str,
                "syncedAt": synced_at,
            }

            await col.update_one(
                {
                    "blockId": block_id,
                    "nutrient": nutrient,
                    "zone": zone,
                    "timestamp": ts_str,
                },
                {"$set": doc},
                upsert=True,
            )
            count += 1

        return count

    # =========================================================================
    # Snapshot sync
    # =========================================================================

    async def _sync_block_snapshots(
        self,
        block_id: str,
        farm_id: str,
        farm_uuid: UUID,
        block_uuid: UUID,
        synced_at: datetime,
    ) -> int:
        """
        Sync camera snapshots for a block. Per-camera error isolation.

        Returns total number of new snapshots synced.
        """
        mcp_client = await SenseHubConnectionService.get_mcp_client(
            farm_uuid, block_uuid
        )

        # Get cameras list
        cameras = await asyncio.wait_for(
            mcp_client.get_cameras(), timeout=MCP_CALL_TIMEOUT
        )
        if not isinstance(cameras, list) or not cameras:
            return 0

        db = self._db if self._db is not None else farm_db.get_database()
        col = db["sensehub_snapshots_cache"]
        total_synced = 0

        for camera in cameras:
            camera_id = camera.get("id") or camera.get("camera_id")
            camera_name = camera.get("name", f"Camera {camera_id}")
            if camera_id is None:
                continue

            try:
                # Get recent snapshots from MCP
                snapshots = await asyncio.wait_for(
                    mcp_client.get_camera_snapshots(
                        int(camera_id), limit=SNAPSHOTS_PER_CAMERA
                    ),
                    timeout=MCP_CALL_TIMEOUT,
                )
                if not isinstance(snapshots, list):
                    continue

                for snap in snapshots:
                    if not isinstance(snap, dict):
                        continue

                    snapshot_id = snap.get("id") or snap.get("snapshot_id")
                    filename = snap.get("filename", "")
                    if snapshot_id is None or not filename:
                        continue

                    # Check if already synced
                    existing = await col.find_one({
                        "blockId": block_id,
                        "cameraId": int(camera_id),
                        "snapshotId": int(snapshot_id),
                    })
                    if existing:
                        continue

                    # Get image URL from MCP
                    try:
                        url_info = await asyncio.wait_for(
                            mcp_client.get_camera_snapshot_image(filename),
                            timeout=MCP_CALL_TIMEOUT,
                        )
                        image_url = url_info.get("url", "")
                        if not image_url:
                            continue
                    except Exception:
                        logger.debug(
                            f"[SenseHubSync] Failed to get URL for {filename}"
                        )
                        continue

                    # Download image
                    try:
                        image_bytes = await asyncio.wait_for(
                            mcp_client.download_snapshot(image_url),
                            timeout=30.0,
                        )
                    except Exception:
                        logger.debug(
                            f"[SenseHubSync] Failed to download {image_url}"
                        )
                        continue

                    # Save to filesystem
                    captured_at_str = snap.get("captured_at") or snap.get("capturedAt") or ""
                    try:
                        captured_dt = datetime.fromisoformat(
                            captured_at_str.replace("Z", "+00:00")
                        ) if captured_at_str else synced_at
                    except (ValueError, AttributeError):
                        captured_dt = synced_at

                    date_dir = captured_dt.strftime("%Y-%m-%d")
                    local_dir = SNAPSHOT_STORAGE_DIR / block_id / str(camera_id) / date_dir
                    local_dir.mkdir(parents=True, exist_ok=True)
                    local_path = local_dir / filename

                    local_path.write_bytes(image_bytes)

                    # Upsert metadata to MongoDB
                    doc = {
                        "blockId": block_id,
                        "farmId": farm_id,
                        "cameraId": int(camera_id),
                        "cameraName": camera_name,
                        "snapshotId": int(snapshot_id),
                        "filename": filename,
                        "localPath": str(local_path),
                        "fileSize": len(image_bytes),
                        "capturedAt": captured_dt,
                        "syncedAt": synced_at,
                    }

                    await col.update_one(
                        {
                            "blockId": block_id,
                            "cameraId": int(camera_id),
                            "snapshotId": int(snapshot_id),
                        },
                        {"$set": doc},
                        upsert=True,
                    )
                    total_synced += 1

            except Exception as exc:
                logger.debug(
                    f"[SenseHubSync] Camera {camera_id} snapshot sync failed "
                    f"for block {block_id}: {exc}"
                )

        return total_synced

    # =========================================================================
    # Sync log
    # =========================================================================

    async def _write_sync_log(self, result: dict) -> None:
        try:
            db = self._db if self._db is not None else farm_db.get_database()
            await db["sensehub_sync_log"].insert_one(result)
        except Exception as e:
            logger.error(f"[SenseHubSync] Failed to write sync log: {e}")

    # =========================================================================
    # Status
    # =========================================================================

    def get_status(self) -> dict:
        return {
            "isRunning": self._is_running,
            "lastSync": self._last_sync.isoformat() if self._last_sync else None,
            "lastSyncResult": self._last_sync_result,
        }
