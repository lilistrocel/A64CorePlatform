"""
Late Items Checker - Finds block cycles past estimated harvest date without actual harvest.
"""

import logging
from datetime import datetime
from typing import List

from ..models import WatchdogIssue, CheckType, Severity

logger = logging.getLogger(__name__)


class LateItemsChecker:
    """Check for overdue harvests based on block_cycles collection."""

    def __init__(self, db):
        self.db = db

    async def run(self) -> List[WatchdogIssue]:
        """Query block_cycles for late harvests."""
        now = datetime.utcnow()

        cursor = self.db["block_cycles"].find({
            "status": "active",
            "estimatedHarvestStartDate": {"$lt": now},
            "$or": [
                {"actualHarvestStartDate": None},
                {"actualHarvestStartDate": {"$exists": False}},
            ],
        })

        cycles = await cursor.to_list(length=200)
        if not cycles:
            return []

        # Collect block IDs and farm IDs for name lookups
        block_ids = list({c.get("blockId") for c in cycles if c.get("blockId")})
        blocks_map = {}
        farms_map = {}

        if block_ids:
            blocks_cursor = self.db["blocks"].find(
                {"blockId": {"$in": block_ids}},
                {"blockId": 1, "name": 1, "farmId": 1},
            )
            async for block in blocks_cursor:
                blocks_map[block["blockId"]] = block

            farm_ids = list({b.get("farmId") for b in blocks_map.values() if b.get("farmId")})
            if farm_ids:
                farms_cursor = self.db["farms"].find(
                    {"farmId": {"$in": farm_ids}},
                    {"farmId": 1, "name": 1},
                )
                async for farm in farms_cursor:
                    farms_map[farm["farmId"]] = farm.get("name", "Unknown Farm")

        issues: List[WatchdogIssue] = []

        for cycle in cycles:
            est = cycle.get("estimatedHarvestStartDate")
            if not est:
                continue

            delay_days = (now - est).days
            if delay_days < 1:
                continue

            # Severity by delay
            if delay_days >= 15:
                severity = Severity.CRITICAL
            elif delay_days >= 8:
                severity = Severity.HIGH
            else:
                severity = Severity.MEDIUM

            block_id = cycle.get("blockId", "")
            block_info = blocks_map.get(block_id, {})
            block_name = block_info.get("name", "Unknown Block")
            farm_name = farms_map.get(block_info.get("farmId"), "Unknown Farm")
            stage = cycle.get("currentStage", "unknown")
            est_str = est.strftime("%b %d") if est else "N/A"

            issues.append(WatchdogIssue(
                checkType=CheckType.LATE_ITEMS,
                severity=severity,
                title=f"Late Harvest ({delay_days} days)",
                description=f"Farm: {farm_name} > Block {block_name}\nExpected: {est_str} | Status: {stage.upper()}",
                entityId=cycle.get("cycleId", block_id),
                farmName=farm_name,
                blockName=block_name,
                extra={"delayDays": delay_days, "stage": stage},
            ))

        return issues
