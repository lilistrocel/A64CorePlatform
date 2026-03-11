"""
AI Dashboard Data Collector

Runs 8 parallel inspection tasks to collect raw farm data for AI analysis.
Each task is isolated with its own try/except so a single failure does not
prevent the rest of the inspection from completing.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException

from ..database import farm_db
from ..farm.farm_repository import FarmRepository
from ..block.block_repository_new import BlockRepository
from ..block.harvest_repository import HarvestRepository
from ..block.alert_repository import AlertRepository
from ..farm.farm_analytics_service import FarmAnalyticsService
from ..sensehub.sensehub_connection_service import SenseHubConnectionService
from .models import (
    AutomationAuditResult,
    AutomationBlockEntry,
    EquipmentBlockEntry,
    EquipmentHealthResult,
    FarmCensusResult,
    GrowthTimelineResult,
    HarvestProgressResult,
    InspectionRawData,
    PlatformAlertResult,
    SenseHubAlertEntry,
    SenseHubAlertResult,
    YieldAssessmentResult,
    YieldFarmEntry,
)

logger = logging.getLogger(__name__)

# States considered "active" for utilisation calculation
ACTIVE_STATES = {"growing", "fruiting", "harvesting", "alert"}

# States where growth timeline analysis is relevant
GROWING_STATES = {"growing", "fruiting"}

# Typical expected duration in days per state (used for timeline heuristic)
EXPECTED_DURATION_BY_STATE: Dict[str, int] = {
    "growing": 21,
    "fruiting": 14,
}

# Per-block SenseHub call timeout
SENSEHUB_CALL_TIMEOUT = 5.0


class DataCollector:
    """
    Collects raw platform data for the AI Dashboard inspection.

    Runs 8 inspection tasks in parallel using asyncio.gather.  Tasks that
    raise exceptions set their corresponding InspectionRawData field to None
    rather than aborting the whole inspection.
    """

    async def collect_all(self) -> InspectionRawData:
        """
        Run all 8 inspection tasks in parallel and return the aggregated result.

        Returns:
            InspectionRawData with all fields populated where collection
            succeeded, None for any that failed.
        """
        logger.info("[DataCollector] Starting parallel inspection tasks")

        # Fetch IoT-connected blocks once and share among tasks 4-6
        iot_blocks = await self._get_iot_connected_blocks()

        tasks = [
            self._farm_census(),
            self._yield_assessment(),
            self._growth_timeline(),
            self._sensehub_alert_scan(iot_blocks),
            self._equipment_health(iot_blocks),
            self._automation_audit(iot_blocks),
            self._harvest_progress(),
            self._platform_alerts(),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        task_names = [
            "farmCensus",
            "yieldAssessment",
            "growthTimeline",
            "senseHubAlerts",
            "equipmentHealth",
            "automationAudit",
            "harvestProgress",
            "platformAlerts",
        ]

        raw_data_kwargs: Dict[str, Any] = {}
        for name, result in zip(task_names, results):
            if isinstance(result, Exception):
                logger.error(f"[DataCollector] Task '{name}' failed: {result}", exc_info=False)
                raw_data_kwargs[name] = None
            else:
                raw_data_kwargs[name] = result

        logger.info("[DataCollector] All inspection tasks completed")
        return InspectionRawData(**raw_data_kwargs)

    # -------------------------------------------------------------------------
    # Helper: Get IoT-connected blocks
    # -------------------------------------------------------------------------

    async def _get_iot_connected_blocks(self) -> List[Dict[str, Any]]:
        """
        Retrieve all active blocks that have an IoT controller enabled.

        Returns:
            List of raw block documents from MongoDB.
        """
        try:
            db = farm_db.get_database()
            cursor = db.blocks.find({
                "isActive": True,
                "iotController.enabled": True,
            })
            blocks = await cursor.to_list(length=1000)
            logger.info(f"[DataCollector] Found {len(blocks)} IoT-connected blocks")
            return blocks
        except Exception as exc:
            logger.error(f"[DataCollector] Failed to fetch IoT blocks: {exc}")
            return []

    # -------------------------------------------------------------------------
    # Task 1: Farm Census
    # -------------------------------------------------------------------------

    async def _farm_census(self) -> FarmCensusResult:
        """
        Count farms, blocks, and compute utilisation.

        Returns:
            FarmCensusResult with totals and utilisation ratio.

        Raises:
            Exception: If database queries fail.
        """
        db = farm_db.get_database()

        total_farms = await db.farms.count_documents({"isActive": True})
        total_blocks = await db.blocks.count_documents({"isActive": True})

        # Aggregate block counts by state
        pipeline = [
            {"$match": {"isActive": True}},
            {"$group": {"_id": "$state", "count": {"$sum": 1}}},
        ]
        state_docs = await db.blocks.aggregate(pipeline).to_list(length=20)
        blocks_by_state: Dict[str, int] = {
            doc["_id"]: doc["count"] for doc in state_docs if doc.get("_id")
        }

        # Utilisation = active blocks / total blocks
        active_count = sum(
            blocks_by_state.get(s, 0) for s in ACTIVE_STATES
        )
        utilization = (active_count / total_blocks) if total_blocks > 0 else 0.0

        logger.info(
            f"[DataCollector] Farm census: {total_farms} farms, "
            f"{total_blocks} blocks, utilisation={utilization:.2%}"
        )

        return FarmCensusResult(
            totalFarms=total_farms,
            totalBlocks=total_blocks,
            blocksByState=blocks_by_state,
            utilization=round(utilization, 4),
        )

    # -------------------------------------------------------------------------
    # Task 2: Yield Assessment
    # -------------------------------------------------------------------------

    async def _yield_assessment(self) -> YieldAssessmentResult:
        """
        Retrieve yield analytics for every active farm via FarmAnalyticsService.

        Returns:
            YieldAssessmentResult with per-farm and global yield figures.

        Raises:
            Exception: If the farm list cannot be fetched.
        """
        farm_repo = FarmRepository()
        farms, _ = await farm_repo.get_all(skip=0, limit=500, is_active=True)

        entries: List[YieldFarmEntry] = []
        global_predicted = 0.0
        global_actual = 0.0

        for farm in farms:
            farm_id: UUID = farm.farmId
            farm_name: str = farm.name
            try:
                analytics = await FarmAnalyticsService.get_farm_analytics(
                    farm_id=farm_id,
                    period="all",
                )
                metrics = analytics.aggregatedMetrics

                predicted = float(metrics.predictedYieldKg or 0.0)
                actual = float(metrics.totalYieldKg or 0.0)
                efficiency = (
                    float(metrics.avgYieldEfficiency or 0.0)
                    if metrics.avgYieldEfficiency
                    else (
                        (actual / predicted * 100.0) if predicted > 0 else 0.0
                    )
                )

                entries.append(YieldFarmEntry(
                    farmId=str(farm_id),
                    farmName=farm_name,
                    predictedYieldKg=round(predicted, 2),
                    actualYieldKg=round(actual, 2),
                    efficiency=round(efficiency, 2),
                ))
                global_predicted += predicted
                global_actual += actual

            except Exception as exc:
                logger.warning(
                    f"[DataCollector] Yield assessment skipped for farm "
                    f"'{farm_name}' ({farm_id}): {exc}"
                )
                # Include zero-entry so the farm is still visible in the report
                entries.append(YieldFarmEntry(
                    farmId=str(farm_id),
                    farmName=farm_name,
                    predictedYieldKg=0.0,
                    actualYieldKg=0.0,
                    efficiency=0.0,
                ))

        global_efficiency = (
            (global_actual / global_predicted * 100.0)
            if global_predicted > 0
            else 0.0
        )

        logger.info(
            f"[DataCollector] Yield assessment: {len(entries)} farms, "
            f"global predicted={global_predicted:.2f} kg, "
            f"actual={global_actual:.2f} kg"
        )

        return YieldAssessmentResult(
            farms=entries,
            globalPredicted=round(global_predicted, 2),
            globalActual=round(global_actual, 2),
            globalEfficiency=round(global_efficiency, 2),
        )

    # -------------------------------------------------------------------------
    # Task 3: Growth Timeline
    # -------------------------------------------------------------------------

    async def _growth_timeline(self) -> GrowthTimelineResult:
        """
        Analyse blocks in growing/fruiting states against expected durations.

        Heuristics:
          - actual days < expected * 0.8  -> ahead
          - actual days > expected * 1.2  -> behind
          - otherwise                     -> on-time

        Returns:
            GrowthTimelineResult with counts and per-block details.

        Raises:
            Exception: If the block query fails.
        """
        db = farm_db.get_database()

        # Fetch blocks currently in growing or fruiting states
        cursor = db.blocks.find({
            "isActive": True,
            "state": {"$in": list(GROWING_STATES)},
        })
        blocks = await cursor.to_list(length=2000)

        ahead = 0
        behind = 0
        on_time = 0
        details: List[Dict[str, Any]] = []

        now = datetime.utcnow()

        for block in blocks:
            state = block.get("state", "")
            block_id = block.get("blockId", "")
            block_name = block.get("name", block_id)
            farm_id = block.get("farmId", "")

            # Determine days in current state from statusChanges
            status_changes = block.get("statusChanges", [])
            last_change_at: Optional[datetime] = None
            if status_changes:
                last_change = status_changes[-1]
                raw_dt = last_change.get("changedAt")
                if isinstance(raw_dt, datetime):
                    last_change_at = raw_dt

            days_in_state: Optional[int] = None
            if last_change_at:
                days_in_state = max(0, (now - last_change_at).days)

            # Get expected duration (from block field or fallback default)
            expected_days = block.get(
                "expectedDurationDays",
                EXPECTED_DURATION_BY_STATE.get(state, 21),
            )

            # Classify
            category: str
            if days_in_state is None:
                category = "on-time"
                on_time += 1
            elif days_in_state < expected_days * 0.8:
                category = "ahead"
                ahead += 1
            elif days_in_state > expected_days * 1.2:
                category = "behind"
                behind += 1
            else:
                category = "on-time"
                on_time += 1

            details.append({
                "blockId": block_id,
                "blockName": block_name,
                "farmId": farm_id,
                "state": state,
                "daysInState": days_in_state,
                "expectedDays": expected_days,
                "category": category,
            })

        logger.info(
            f"[DataCollector] Growth timeline: ahead={ahead}, "
            f"behind={behind}, on-time={on_time}"
        )

        return GrowthTimelineResult(
            blocksAhead=ahead,
            blocksBehind=behind,
            blocksOnTime=on_time,
            details=details,
        )

    # -------------------------------------------------------------------------
    # Task 4: SenseHub Alert Scan
    # -------------------------------------------------------------------------

    async def _sensehub_alert_scan(
        self, iot_blocks: List[Dict[str, Any]]
    ) -> SenseHubAlertResult:
        """
        Scan active SenseHub blocks for alerts.

        Args:
            iot_blocks: Pre-fetched list of IoT-connected block documents.

        Returns:
            SenseHubAlertResult with per-block alert entries.

        Raises:
            Exception: If the aggregation fails unexpectedly.
        """
        entries: List[SenseHubAlertEntry] = []
        total_alerts = 0
        critical_count = 0

        for block in iot_blocks:
            block_id_str = block.get("blockId", "")
            farm_id_str = block.get("farmId", "")
            block_name = block.get("name", block_id_str)

            # Resolve farm name (best effort)
            farm_name = await self._get_farm_name(farm_id_str)

            try:
                block_uuid = UUID(block_id_str)
                farm_uuid = UUID(farm_id_str)
                client = await SenseHubConnectionService.get_client(
                    farm_uuid, block_uuid
                )
                alerts_raw = await asyncio.wait_for(
                    client.get_alerts(),
                    timeout=SENSEHUB_CALL_TIMEOUT,
                )
                if not isinstance(alerts_raw, list):
                    alerts_raw = []

                block_critical = sum(
                    1 for a in alerts_raw
                    if isinstance(a, dict) and a.get("severity") == "critical"
                )
                total_alerts += len(alerts_raw)
                critical_count += block_critical

                entries.append(SenseHubAlertEntry(
                    blockId=block_id_str,
                    blockName=block_name,
                    farmName=farm_name,
                    alerts=alerts_raw,
                ))

            except HTTPException:
                # Block has no IoT credentials — skip silently
                logger.debug(
                    f"[DataCollector] Skipping SenseHub alert scan for "
                    f"block {block_id_str}: no credentials"
                )
            except asyncio.TimeoutError:
                logger.warning(
                    f"[DataCollector] SenseHub alert scan timed out for "
                    f"block {block_id_str}"
                )
            except Exception as exc:
                logger.warning(
                    f"[DataCollector] SenseHub alert scan error for "
                    f"block {block_id_str}: {exc}"
                )

        blocks_with_alerts = sum(1 for e in entries if e.alerts)

        logger.info(
            f"[DataCollector] SenseHub alert scan: scanned={len(entries)}, "
            f"with_alerts={blocks_with_alerts}, total={total_alerts}, "
            f"critical={critical_count}"
        )

        return SenseHubAlertResult(
            blocksScanned=len(entries),
            blocksWithAlerts=blocks_with_alerts,
            totalAlerts=total_alerts,
            criticalCount=critical_count,
            entries=entries,
        )

    # -------------------------------------------------------------------------
    # Task 5: Equipment Health
    # -------------------------------------------------------------------------

    async def _equipment_health(
        self, iot_blocks: List[Dict[str, Any]]
    ) -> EquipmentHealthResult:
        """
        Check equipment online/offline status for all IoT-connected blocks.

        Args:
            iot_blocks: Pre-fetched list of IoT-connected block documents.

        Returns:
            EquipmentHealthResult with per-block equipment status.

        Raises:
            Exception: If the aggregation fails unexpectedly.
        """
        entries: List[EquipmentBlockEntry] = []
        total_online = 0
        total_offline = 0

        for block in iot_blocks:
            block_id_str = block.get("blockId", "")
            farm_id_str = block.get("farmId", "")
            block_name = block.get("name", block_id_str)
            farm_name = await self._get_farm_name(farm_id_str)

            try:
                block_uuid = UUID(block_id_str)
                farm_uuid = UUID(farm_id_str)
                client = await SenseHubConnectionService.get_client(
                    farm_uuid, block_uuid
                )
                equipment_raw = await asyncio.wait_for(
                    client.get_equipment(),
                    timeout=SENSEHUB_CALL_TIMEOUT,
                )
                if not isinstance(equipment_raw, list):
                    equipment_raw = []

                online = sum(
                    1 for e in equipment_raw
                    if isinstance(e, dict) and e.get("status") == "online"
                )
                offline = sum(
                    1 for e in equipment_raw
                    if isinstance(e, dict) and e.get("status") != "online"
                )
                total_online += online
                total_offline += offline

                entries.append(EquipmentBlockEntry(
                    blockId=block_id_str,
                    blockName=block_name,
                    farmName=farm_name,
                    onlineCount=online,
                    offlineCount=offline,
                    equipment=equipment_raw,
                ))

            except HTTPException:
                logger.debug(
                    f"[DataCollector] Skipping equipment health for "
                    f"block {block_id_str}: no credentials"
                )
            except asyncio.TimeoutError:
                logger.warning(
                    f"[DataCollector] Equipment health timed out for "
                    f"block {block_id_str}"
                )
            except Exception as exc:
                logger.warning(
                    f"[DataCollector] Equipment health error for "
                    f"block {block_id_str}: {exc}"
                )

        logger.info(
            f"[DataCollector] Equipment health: scanned={len(entries)}, "
            f"online={total_online}, offline={total_offline}"
        )

        return EquipmentHealthResult(
            blocksScanned=len(entries),
            totalOnline=total_online,
            totalOffline=total_offline,
            entries=entries,
        )

    # -------------------------------------------------------------------------
    # Task 6: Automation Audit
    # -------------------------------------------------------------------------

    async def _automation_audit(
        self, iot_blocks: List[Dict[str, Any]]
    ) -> AutomationAuditResult:
        """
        Audit automation enable/disable status for all IoT-connected blocks.

        Args:
            iot_blocks: Pre-fetched list of IoT-connected block documents.

        Returns:
            AutomationAuditResult with per-block automation counts.

        Raises:
            Exception: If the aggregation fails unexpectedly.
        """
        entries: List[AutomationBlockEntry] = []
        total_enabled = 0
        total_disabled = 0

        for block in iot_blocks:
            block_id_str = block.get("blockId", "")
            farm_id_str = block.get("farmId", "")
            block_name = block.get("name", block_id_str)
            farm_name = await self._get_farm_name(farm_id_str)

            try:
                block_uuid = UUID(block_id_str)
                farm_uuid = UUID(farm_id_str)
                client = await SenseHubConnectionService.get_client(
                    farm_uuid, block_uuid
                )
                automations_raw = await asyncio.wait_for(
                    client.get_automations(),
                    timeout=SENSEHUB_CALL_TIMEOUT,
                )
                if not isinstance(automations_raw, list):
                    automations_raw = []

                enabled = sum(
                    1 for a in automations_raw
                    if isinstance(a, dict) and a.get("enabled") is True
                )
                disabled = len(automations_raw) - enabled
                total_enabled += enabled
                total_disabled += disabled

                entries.append(AutomationBlockEntry(
                    blockId=block_id_str,
                    blockName=block_name,
                    farmName=farm_name,
                    enabledCount=enabled,
                    disabledCount=disabled,
                    automations=automations_raw,
                ))

            except HTTPException:
                logger.debug(
                    f"[DataCollector] Skipping automation audit for "
                    f"block {block_id_str}: no credentials"
                )
            except asyncio.TimeoutError:
                logger.warning(
                    f"[DataCollector] Automation audit timed out for "
                    f"block {block_id_str}"
                )
            except Exception as exc:
                logger.warning(
                    f"[DataCollector] Automation audit error for "
                    f"block {block_id_str}: {exc}"
                )

        logger.info(
            f"[DataCollector] Automation audit: scanned={len(entries)}, "
            f"enabled={total_enabled}, disabled={total_disabled}"
        )

        return AutomationAuditResult(
            blocksScanned=len(entries),
            totalEnabled=total_enabled,
            totalDisabled=total_disabled,
            entries=entries,
        )

    # -------------------------------------------------------------------------
    # Task 7: Harvest Progress
    # -------------------------------------------------------------------------

    async def _harvest_progress(self) -> HarvestProgressResult:
        """
        Aggregate harvest records from the last 7 days.

        Returns:
            HarvestProgressResult with totals and grade distribution.

        Raises:
            Exception: If the database query fails.
        """
        db = farm_db.get_database()
        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        query = {"harvestDate": {"$gte": seven_days_ago}}

        total_harvests = await db.block_harvests.count_documents(query)

        # Aggregate total kg and grade distribution
        pipeline = [
            {"$match": query},
            {
                "$group": {
                    "_id": "$qualityGrade",
                    "count": {"$sum": 1},
                    "totalKg": {"$sum": "$quantityKg"},
                }
            },
        ]
        grade_docs = await db.block_harvests.aggregate(pipeline).to_list(length=20)

        grade_distribution: Dict[str, int] = {}
        total_kg = 0.0
        for doc in grade_docs:
            grade = doc.get("_id") or "unknown"
            grade_distribution[str(grade)] = doc.get("count", 0)
            total_kg += float(doc.get("totalKg", 0.0))

        # Fetch up to 20 most recent harvests as detail rows
        cursor = (
            db.block_harvests.find(query)
            .sort("harvestDate", -1)
            .limit(20)
        )
        recent_docs = await cursor.to_list(length=20)
        recent_harvests: List[Dict[str, Any]] = []
        for doc in recent_docs:
            doc.pop("_id", None)
            # Serialise UUIDs and datetimes to strings
            for key, val in list(doc.items()):
                if isinstance(val, datetime):
                    doc[key] = val.isoformat()
            recent_harvests.append(doc)

        logger.info(
            f"[DataCollector] Harvest progress: {total_harvests} harvests "
            f"in 7 days, {total_kg:.2f} kg"
        )

        return HarvestProgressResult(
            totalHarvests7Days=total_harvests,
            totalKg7Days=round(total_kg, 2),
            gradeDistribution=grade_distribution,
            recentHarvests=recent_harvests,
        )

    # -------------------------------------------------------------------------
    # Task 8: Platform Alerts
    # -------------------------------------------------------------------------

    async def _platform_alerts(self) -> PlatformAlertResult:
        """
        Aggregate active alerts from the platform-level alerts collection.

        Returns:
            PlatformAlertResult with counts by severity and top alerts.

        Raises:
            Exception: If the database query fails.
        """
        db = farm_db.get_database()

        active_count = await db.alerts.count_documents({"status": "active"})

        # Group active alerts by severity
        pipeline = [
            {"$match": {"status": "active"}},
            {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
        ]
        severity_docs = await db.alerts.aggregate(pipeline).to_list(length=20)
        by_severity: Dict[str, int] = {
            doc["_id"]: doc["count"]
            for doc in severity_docs
            if doc.get("_id")
        }

        # Fetch top 10 most severe/recent active alerts
        cursor = (
            db.alerts.find({"status": "active"})
            .sort([("severity", 1), ("triggeredAt", -1)])
            .limit(10)
        )
        top_docs = await cursor.to_list(length=10)
        top_alerts: List[Dict[str, Any]] = []
        for doc in top_docs:
            doc.pop("_id", None)
            for key, val in list(doc.items()):
                if isinstance(val, datetime):
                    doc[key] = val.isoformat()
            top_alerts.append(doc)

        logger.info(
            f"[DataCollector] Platform alerts: {active_count} active, "
            f"by severity={by_severity}"
        )

        return PlatformAlertResult(
            activeCount=active_count,
            bySeverity=by_severity,
            topAlerts=top_alerts,
        )

    # -------------------------------------------------------------------------
    # Internal helper
    # -------------------------------------------------------------------------

    _farm_name_cache: Dict[str, str] = {}

    async def _get_farm_name(self, farm_id_str: str) -> str:
        """
        Look up a farm name by farmId string (in-process cache to reduce DB hits).

        Args:
            farm_id_str: String representation of the farm UUID.

        Returns:
            Farm name string, or the farmId itself if lookup fails.
        """
        if farm_id_str in self._farm_name_cache:
            return self._farm_name_cache[farm_id_str]
        try:
            db = farm_db.get_database()
            farm_doc = await db.farms.find_one(
                {"farmId": farm_id_str}, {"name": 1}
            )
            name = farm_doc.get("name", farm_id_str) if farm_doc else farm_id_str
            self._farm_name_cache[farm_id_str] = name
            return name
        except Exception:
            return farm_id_str
