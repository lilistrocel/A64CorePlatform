"""
Alert Checker - Finds active HIGH/CRITICAL alerts.
"""

import logging
from datetime import datetime
from typing import List

from ..models import WatchdogIssue, CheckType, Severity

logger = logging.getLogger(__name__)


class AlertChecker:
    """Check for active alerts above severity threshold."""

    def __init__(self, db):
        self.db = db

    async def run(self) -> List[WatchdogIssue]:
        """Query alerts collection for active high/critical alerts."""
        cursor = self.db["alerts"].find({
            "status": "active",
            "severity": {"$in": ["high", "critical"]},
        })

        alerts = await cursor.to_list(length=200)
        if not alerts:
            return []

        # Collect block IDs for name lookups
        block_ids = list({a.get("blockId") for a in alerts if a.get("blockId")})
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

        for alert in alerts:
            alert_severity = alert.get("severity", "high")
            severity = Severity.CRITICAL if alert_severity == "critical" else Severity.HIGH

            block_id = alert.get("blockId", "")
            block_info = blocks_map.get(block_id, {})
            block_name = block_info.get("name", "Unknown Block")
            farm_name = farms_map.get(block_info.get("farmId"), "Unknown Farm")

            # Calculate "since" time
            created = alert.get("createdAt")
            since_str = ""
            if created:
                delta = datetime.utcnow() - created
                hours = int(delta.total_seconds() / 3600)
                if hours < 1:
                    since_str = f"{int(delta.total_seconds() / 60)}m ago"
                elif hours < 24:
                    since_str = f"{hours}h ago"
                else:
                    since_str = f"{hours // 24}d ago"

            alert_type = alert.get("alertType", alert.get("type", "Unknown"))

            issues.append(WatchdogIssue(
                checkType=CheckType.ACTIVE_ALERTS,
                severity=severity,
                title=f"Active Alert: {alert_type}",
                description=f"Farm: {farm_name} > Block {block_name}\nSeverity: {alert_severity.upper()} | Since: {since_str}",
                entityId=alert.get("alertId", block_id),
                farmName=farm_name,
                blockName=block_name,
            ))

        return issues
