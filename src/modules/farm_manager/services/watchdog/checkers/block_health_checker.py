"""
Block Health Checker - Blocks in ALERT status or stale IoT sync.
"""

import logging
from datetime import datetime, timedelta
from typing import List

from ..models import WatchdogIssue, CheckType, Severity

logger = logging.getLogger(__name__)

STALE_IOT_THRESHOLD_HOURS = 4


class BlockHealthChecker:
    """Check for blocks in ALERT state or with stale IoT sync."""

    def __init__(self, db):
        self.db = db

    async def run(self) -> List[WatchdogIssue]:
        """Check block health conditions."""
        issues: List[WatchdogIssue] = []

        stale_cutoff = datetime.utcnow() - timedelta(hours=STALE_IOT_THRESHOLD_HOURS)

        # Find blocks in ALERT state OR with stale IoT sync
        cursor = self.db["blocks"].find({
            "$or": [
                {"currentState": "ALERT"},
                {
                    "iotController.enabled": True,
                    "iotController.lastSyncedAt": {"$lt": stale_cutoff},
                },
            ],
        }, {
            "blockId": 1,
            "name": 1,
            "farmId": 1,
            "currentState": 1,
            "iotController": 1,
        })

        blocks = await cursor.to_list(length=500)
        if not blocks:
            return []

        # Farm name lookup
        farm_ids = list({b.get("farmId") for b in blocks if b.get("farmId")})
        farms_map = {}
        if farm_ids:
            farms_cursor = self.db["farms"].find(
                {"farmId": {"$in": farm_ids}},
                {"farmId": 1, "name": 1},
            )
            async for farm in farms_cursor:
                farms_map[farm["farmId"]] = farm.get("name", "Unknown Farm")

        for block in blocks:
            block_id = block.get("blockId", "")
            block_name = block.get("name", "Unknown Block")
            farm_name = farms_map.get(block.get("farmId"), "Unknown Farm")

            # Block in ALERT state
            if block.get("currentState") == "ALERT":
                issues.append(WatchdogIssue(
                    checkType=CheckType.BLOCK_HEALTH,
                    severity=Severity.HIGH,
                    title="Block in ALERT State",
                    description=f"Farm: {farm_name} > Block {block_name}\nState: ALERT",
                    entityId=f"{block_id}:alert_state",
                    farmName=farm_name,
                    blockName=block_name,
                ))

            # Stale IoT sync
            iot = block.get("iotController", {})
            if iot.get("enabled") and iot.get("lastSyncedAt"):
                last_sync = iot["lastSyncedAt"]
                if isinstance(last_sync, datetime) and last_sync < stale_cutoff:
                    hours_stale = int((datetime.utcnow() - last_sync).total_seconds() / 3600)
                    issues.append(WatchdogIssue(
                        checkType=CheckType.BLOCK_HEALTH,
                        severity=Severity.MEDIUM,
                        title="Stale IoT Sync",
                        description=f"Farm: {farm_name} > Block {block_name}\nLast sync: {hours_stale}h ago (threshold: {STALE_IOT_THRESHOLD_HOURS}h)",
                        entityId=f"{block_id}:stale_iot",
                        farmName=farm_name,
                        blockName=block_name,
                        extra={"hoursStale": hours_stale},
                    ))

        return issues
