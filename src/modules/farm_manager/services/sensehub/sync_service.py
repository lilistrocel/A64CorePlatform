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

Also runs crop-data reconciliation at the end of each sync cycle (and on
startup) via _reconcile_crop_data().  Reconciliation compares A64Core's
authoritative block state against what SenseHub holds and repushes on drift.
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

# Concurrency cap for crop-data reconciliation — SenseHub confirmed no rate
# limits but advised 5 concurrent sessions (SQLite WAL mode serialises writes).
RECONCILE_CONCURRENCY = 5

# Block states that indicate an active crop is expected on SenseHub.
# CLEANING means the harvest cycle just ended (complete_crop already fired in
# Phase 4's HARVESTING→CLEANING trigger); treat as no-active-crop here.
_ACTIVE_CROP_STATES = frozenset(["growing", "fruiting", "harvesting"])

# Marker string matching the operator-facing error logged by SenseHubCropSync
# when SenseHub returns HTTP 422 "No primary crop zone configured".
_ZONE_NOT_CONFIGURED_MARKER = "No primary crop zone configured"


# =============================================================================
# Module-level helpers used by _reconcile_crop_data's inner coroutine
# =============================================================================


def _record_error(counters: Dict[str, Any], sample: str) -> None:
    """
    Increment the error counter and append a sample (capped at 5).

    Args:
        counters: Mutable counters dict from _reconcile_crop_data.
        sample: Short human-readable description of the error.
    """
    counters["errors"] += 1
    if len(counters["error_samples"]) < 5:
        counters["error_samples"].append(sample)


def _zone_error_sample(block_id_str: str, tool: str) -> str:
    """
    Return the canonical error sample string for a primary-zone-not-configured
    failure so operators can identify it in the reconcile result.

    Args:
        block_id_str: UUID string of the affected block.
        tool: SenseHub MCP tool name that returned the 422.

    Returns:
        Error sample string containing the PRIMARY_ZONE_NOT_CONFIGURED marker.
    """
    return f"block={block_id_str} tool={tool} PRIMARY_ZONE_NOT_CONFIGURED"


async def _safe_set_crop_data(
    sync: Any,
    block: Any,
    planting_id: UUID,
    stage: Any,
    plant_data: Any,
    counters: Dict[str, Any],
    block_id_str: str,
) -> bool:
    """
    Call set_crop_data with timeout and unified error accounting.

    Returns True on success, False on any failure (error already recorded
    in counters).

    Args:
        sync: SenseHubCropSync instance.
        block: Block model instance.
        planting_id: A64Core planting UUID.
        stage: SenseHubStage enum value.
        plant_data: PlantDataEnhanced instance.
        counters: Mutable counters dict.
        block_id_str: UUID string for log context.

    Returns:
        True if set_crop_data returned a non-None result, False otherwise.
    """
    try:
        result = await asyncio.wait_for(
            sync.set_crop_data(
                block=block,
                planting_id=planting_id,
                current_stage=stage,
                plant_data_enhanced=plant_data,
            ),
            timeout=MCP_CALL_TIMEOUT,
        )
    except Exception as exc:
        _record_error(
            counters,
            f"block={block_id_str} set_crop_data failed: {str(exc)[:200]}",
        )
        return False

    if result is None:
        # set_crop_data returned None — either zone-not-configured (already
        # logged as WARNING by SenseHubCropSync) or another transient failure.
        _record_error(counters, _zone_error_sample(block_id_str, "set_crop_data"))
        return False

    return True


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
    _last_reconcile_result: Optional[dict] = None

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

        # Run crop-data reconciliation as a second pass over the same block list.
        # We reuse the already-fetched iot_blocks to avoid a duplicate DB query.
        reconcile_result = await self._reconcile_crop_data(iot_blocks)
        result["reconcile"] = reconcile_result

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
    # Crop-data reconciliation
    # =========================================================================

    async def _reconcile_crop_data(
        self, iot_blocks: List[Dict[str, Any]]
    ) -> dict:
        """
        Compare A64Core's authoritative block state against SenseHub's stored
        crop data and repush on drift.

        Called at the end of each sync cycle (and therefore on startup, since
        run_sync is invoked after STARTUP_DELAY).  Uses option (a): runs as a
        second sequential pass over the same block list already fetched by
        run_sync, avoiding a duplicate DB query.

        Drift cases handled
        -------------------
        1. A64Core expects active crop, SenseHub has None       → set_crop_data
        2. A64Core expects active crop, SenseHub matches        → check stage;
           update_growth_stage if stages differ, no-op otherwise
        3. A64Core expects active crop, SenseHub has stale id   → set_crop_data
        4. A64Core expects no active crop, SenseHub has None    → no-op
        5. A64Core expects no active crop, SenseHub has orphan  → complete_crop

        Concurrency: up to RECONCILE_CONCURRENCY (5) blocks run in parallel.
        SenseHub confirmed no rate limits and no 429s.

        Args:
            iot_blocks: List of raw block dicts already retrieved from MongoDB
                by the surrounding run_sync call.  Each dict has at minimum
                'blockId', 'farmId', 'state', 'plantedDate', 'targetCrop',
                and 'iotController'.

        Returns:
            Aggregated result dict with counts and timing.
        """
        # Import here to avoid circular imports at module load time.
        from ...models.block import Block, BlockStatus
        from ..plant_data.plant_data_enhanced_repository import PlantDataEnhancedRepository
        from ..planting.planting_repository import PlantingRepository
        from .sensehub_crop_sync import SenseHubCropSync
        from .sensehub_stage_mapper import compute_stage

        started_at = datetime.utcnow()
        logger.info(
            "[SenseHubSync:Reconcile] Starting crop-data reconciliation "
            "for %d IoT block(s)",
            len(iot_blocks),
        )

        counters: Dict[str, Any] = {
            "blocks_checked": 0,
            "in_sync": 0,
            "drift_resolved_by_repush": 0,
            "drift_resolved_by_stage_update": 0,
            "drift_resolved_by_complete": 0,
            "errors": 0,
            "error_samples": [],
        }

        semaphore = asyncio.Semaphore(RECONCILE_CONCURRENCY)

        async def _reconcile_one(raw_block: Dict[str, Any]) -> None:
            """
            Reconcile a single block's crop data against SenseHub.

            Never raises — any exception is caught, counted as an error, and
            the loop continues with the next block.
            """
            block_id_str = raw_block.get("blockId", "<unknown>")

            async with semaphore:
                try:
                    # Parse raw MongoDB dict into a typed Block model so we can
                    # reuse the same SenseHubCropSync.from_block() factory.
                    # _id is not a valid Block field so we strip it first.
                    block_doc = {k: v for k, v in raw_block.items() if k != "_id"}
                    block = Block(**block_doc)
                except Exception as exc:
                    _record_error(
                        counters,
                        f"block={block_id_str} parse_error={str(exc)[:200]}",
                    )
                    return

                counters["blocks_checked"] += 1
                block_id_str = str(block.blockId)

                # ── 1. Determine A64Core's expected state ────────────────────
                block_state_value = block.state.value if block.state else ""
                active_crop_expected = (
                    block_state_value in _ACTIVE_CROP_STATES
                    and block.plantedDate is not None
                    and block.targetCrop is not None
                )

                # ── 2. Build crop-sync client (returns None when no MCP) ─────
                sync = SenseHubCropSync.from_block(block)
                if sync is None:
                    # No iotController or missing mcpApiKey — from_block already
                    # logged a WARNING; we count this as in-sync (nothing to do).
                    counters["in_sync"] += 1
                    return

                # ── 3. Query SenseHub for current crop ───────────────────────
                try:
                    sh_crop = await asyncio.wait_for(
                        sync.get_crop_data(block), timeout=MCP_CALL_TIMEOUT
                    )
                except Exception as exc:
                    _record_error(
                        counters,
                        f"block={block_id_str} get_crop_data failed: {str(exc)[:200]}",
                    )
                    return

                # ── 4. No-op: both sides agree there is no active crop ───────
                if not active_crop_expected and sh_crop is None:
                    counters["in_sync"] += 1
                    return

                # ── 5. Orphan on SenseHub: complete it ──────────────────────
                if not active_crop_expected and sh_crop is not None:
                    logger.warning(
                        "[SenseHubSync:Reconcile] drift resolved: SenseHub has "
                        "orphan active crop on block %s (block state=%s) — "
                        "marking complete with zero yield",
                        block_id_str,
                        block_state_value,
                    )
                    # Reason: During reconciliation we don't have historical
                    # harvest data readily available.  We use zero yield and "A"
                    # grade as a safe best-effort to close the orphan record.
                    # Phase 4 triggers handle the real complete_crop call when
                    # the operator transitions HARVESTING→CLEANING in normal flow.
                    try:
                        ok = await asyncio.wait_for(
                            sync.complete_crop(
                                block=block,
                                harvested_at=datetime.utcnow(),
                                total_yield_kg=0.0,
                                average_quality_grade="A",
                                harvest_count=0,
                            ),
                            timeout=MCP_CALL_TIMEOUT,
                        )
                    except Exception as exc:
                        _record_error(
                            counters,
                            f"block={block_id_str} complete_crop(orphan) failed: {str(exc)[:200]}",
                        )
                        return

                    if ok:
                        counters["drift_resolved_by_complete"] += 1
                    else:
                        # complete_crop returned False — already logged inside
                        # SenseHubCropSync.  Check if it was a zone-config error.
                        _record_error(
                            counters,
                            _zone_error_sample(block_id_str, "complete_crop"),
                        )
                    return

                # ── 6. Active crop expected — resolve deps ───────────────────
                # Resolve planting record to get the stable a64core_planting_id.
                try:
                    planting = await PlantingRepository.get_by_block_id(block.blockId)
                except Exception as exc:
                    _record_error(
                        counters,
                        f"block={block_id_str} planting_lookup failed: {str(exc)[:200]}",
                    )
                    return

                if planting is None:
                    logger.warning(
                        "[SenseHubSync:Reconcile] block %s has state=%s with "
                        "plantedDate set but no active planting record found — "
                        "skipping reconciliation for this block",
                        block_id_str,
                        block_state_value,
                    )
                    # Do not count as error — this is a data-integrity edge case
                    # (T-003 planting flow bug may contribute).
                    counters["in_sync"] += 1
                    return

                # Resolve plant data to compute current stage.
                try:
                    plant_data = await PlantDataEnhancedRepository.get_by_id(
                        block.targetCrop  # type: ignore[arg-type]
                    )
                except Exception as exc:
                    _record_error(
                        counters,
                        f"block={block_id_str} plant_data_lookup failed: {str(exc)[:200]}",
                    )
                    return

                if plant_data is None:
                    logger.warning(
                        "[SenseHubSync:Reconcile] block %s targetCrop=%s not found "
                        "in plant_data_enhanced — skipping",
                        block_id_str,
                        block.targetCrop,
                    )
                    counters["in_sync"] += 1
                    return

                # Compute A64Core's current stage.
                try:
                    a64_stage = compute_stage(
                        planted_date=block.plantedDate,  # type: ignore[arg-type]
                        plant_data_enhanced=plant_data,
                        block_state=block.state,
                    )
                except Exception as exc:
                    _record_error(
                        counters,
                        f"block={block_id_str} compute_stage failed: {str(exc)[:200]}",
                    )
                    return

                planting_id_str = str(planting.plantingId)

                # ── 7. SenseHub has no record → repush full crop data ────────
                if sh_crop is None:
                    logger.info(
                        "[SenseHubSync:Reconcile] drift resolved: SenseHub had "
                        "no crop record for block %s — repushing",
                        block_id_str,
                    )
                    ok = await _safe_set_crop_data(
                        sync, block, planting.plantingId, a64_stage, plant_data,
                        counters, block_id_str,
                    )
                    if ok:
                        counters["drift_resolved_by_repush"] += 1
                    return

                # ── 8. SenseHub has a record — check planting_id correlation ─
                sh_planting_id = sh_crop.get("a64core_planting_id", "")

                if sh_planting_id != planting_id_str:
                    # Stale planting_id on SenseHub — atomic replace via set_crop_data.
                    logger.warning(
                        "[SenseHubSync:Reconcile] drift resolved: SenseHub had "
                        "stale a64core_planting_id=%s for block %s, repushing "
                        "with current id=%s",
                        sh_planting_id,
                        block_id_str,
                        planting_id_str,
                    )
                    ok = await _safe_set_crop_data(
                        sync, block, planting.plantingId, a64_stage, plant_data,
                        counters, block_id_str,
                    )
                    if ok:
                        counters["drift_resolved_by_repush"] += 1
                    return

                # ── 9. Planting_id matches — check stage drift ───────────────
                sh_stage = sh_crop.get("current_stage", "")
                if sh_stage == a64_stage.value:
                    counters["in_sync"] += 1
                    return

                # Stage drift — push correction.
                logger.info(
                    "[SenseHubSync:Reconcile] drift resolved: SenseHub stage=%s "
                    "differs from A64Core stage=%s for block %s — updating",
                    sh_stage,
                    a64_stage.value,
                    block_id_str,
                )
                try:
                    now = datetime.utcnow()
                    days_since = (
                        (now - block.plantedDate).days  # type: ignore[operator]
                        if block.plantedDate
                        else 0
                    )
                    ok = await asyncio.wait_for(
                        sync.update_growth_stage(
                            block=block,
                            stage=a64_stage,
                            transitioned_at=now,
                            days_since_planting=days_since,
                        ),
                        timeout=MCP_CALL_TIMEOUT,
                    )
                except Exception as exc:
                    _record_error(
                        counters,
                        f"block={block_id_str} update_growth_stage failed: {str(exc)[:200]}",
                    )
                    return

                if ok:
                    counters["drift_resolved_by_stage_update"] += 1
                else:
                    _record_error(
                        counters,
                        _zone_error_sample(block_id_str, "update_growth_stage"),
                    )

        # ── Execute all reconciliations with bounded concurrency ─────────────
        await asyncio.gather(*[_reconcile_one(b) for b in iot_blocks])

        finished_at = datetime.utcnow()
        duration = (finished_at - started_at).total_seconds()

        result: dict = {
            "reconcile_started_at": started_at.isoformat(),
            "reconcile_finished_at": finished_at.isoformat(),
            "blocks_checked": counters["blocks_checked"],
            "in_sync": counters["in_sync"],
            "drift_resolved_by_repush": counters["drift_resolved_by_repush"],
            "drift_resolved_by_stage_update": counters["drift_resolved_by_stage_update"],
            "drift_resolved_by_complete": counters["drift_resolved_by_complete"],
            "errors": counters["errors"],
            "error_samples": counters["error_samples"][:5],
        }

        self._last_reconcile_result = result

        total_drift = (
            counters["drift_resolved_by_repush"]
            + counters["drift_resolved_by_stage_update"]
            + counters["drift_resolved_by_complete"]
        )
        logger.info(
            "[SenseHubSync:Reconcile] Reconciliation completed in %.1fs: "
            "checked=%d in_sync=%d drift_repush=%d drift_stage=%d drift_complete=%d errors=%d",
            duration,
            result["blocks_checked"],
            result["in_sync"],
            result["drift_resolved_by_repush"],
            result["drift_resolved_by_stage_update"],
            result["drift_resolved_by_complete"],
            result["errors"],
        )

        return result

    # =========================================================================
    # Status
    # =========================================================================

    def get_status(self) -> dict:
        return {
            "isRunning": self._is_running,
            "lastSync": self._last_sync.isoformat() if self._last_sync else None,
            "lastSyncResult": self._last_sync_result,
            "lastReconcileResult": self._last_reconcile_result,
        }
