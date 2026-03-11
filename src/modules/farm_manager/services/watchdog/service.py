"""
Watchdog Service - Orchestrates checkers, applies cooldown, sends Telegram notifications.
"""

import logging
from datetime import datetime, timedelta
from typing import List

from .models import (
    WatchdogIssue,
    WatchdogRunResult,
    WatchdogConfig,
    CheckType,
    NotificationLog,
    meets_threshold,
)
from .config_service import WatchdogConfigService
from .telegram_service import TelegramService
from .checkers.mcp_checker import MCPChecker
from .checkers.late_items_checker import LateItemsChecker
from .checkers.alert_checker import AlertChecker
from .checkers.block_health_checker import BlockHealthChecker
from .checkers.system_health_checker import SystemHealthChecker

logger = logging.getLogger(__name__)

CHECKERS = {
    "mcp_reachability": MCPChecker,
    "late_items": LateItemsChecker,
    "active_alerts": AlertChecker,
    "block_health": BlockHealthChecker,
    "system_health": SystemHealthChecker,
}

NOTIFICATIONS_COLLECTION = "watchdog_notifications"
MAX_MESSAGE_LENGTH = 4096


class WatchdogService:
    """Main orchestrator: run checks, filter by cooldown, send notifications."""

    def __init__(self, db):
        self.db = db
        self.config_service = WatchdogConfigService(db)

    async def create_indexes(self):
        """Ensure required indexes exist on watchdog_notifications."""
        col = self.db[NOTIFICATIONS_COLLECTION]
        await col.create_index(
            [("issueKey", 1), ("cooldownExpiresAt", 1)],
            name="issueKey_cooldown",
        )
        await col.create_index(
            "sentAt",
            name="sentAt_ttl",
            expireAfterSeconds=7 * 24 * 3600,  # 7 days TTL
        )

    async def run_check(self, triggered_by: str = "scheduler") -> WatchdogRunResult:
        """Execute all enabled checkers, apply cooldown, send Telegram notification."""
        result = WatchdogRunResult(
            startedAt=datetime.utcnow(),
            triggeredBy=triggered_by,
        )

        config = await self.config_service.get_config()

        if not config.enabled and triggered_by == "scheduler":
            logger.debug("[Watchdog] Disabled, skipping scheduled run")
            result.completedAt = datetime.utcnow()
            return result

        # Collect issues from enabled checkers
        all_issues: List[WatchdogIssue] = []

        for check_name in config.enabledChecks:
            checker_cls = CHECKERS.get(check_name)
            if not checker_cls:
                continue

            try:
                checker = checker_cls(self.db)
                issues = await checker.run()
                all_issues.extend(issues)
            except Exception as e:
                logger.error(f"[Watchdog] Checker '{check_name}' failed: {e}")
                result.errors.append(f"{check_name}: {str(e)}")

        # Filter by severity threshold
        all_issues = [
            i for i in all_issues
            if meets_threshold(i.severity, config.severityThreshold)
        ]

        result.totalIssues = len(all_issues)

        if not all_issues:
            result.completedAt = datetime.utcnow()
            logger.info(f"[Watchdog] Run complete. No issues above threshold.")
            return result

        # Apply cooldown filter
        issues_to_send: List[WatchdogIssue] = []
        now = datetime.utcnow()
        col = self.db[NOTIFICATIONS_COLLECTION]

        for issue in all_issues:
            key = issue.issue_key
            existing = await col.find_one({
                "issueKey": key,
                "cooldownExpiresAt": {"$gt": now},
            })
            if existing:
                result.skippedByCooldown += 1
            else:
                issues_to_send.append(issue)

        if not issues_to_send:
            result.completedAt = datetime.utcnow()
            logger.info(
                f"[Watchdog] Run complete. {result.totalIssues} issues, "
                f"all on cooldown."
            )
            return result

        # Format and send Telegram message
        bot_token = await self.config_service.get_decrypted_bot_token()
        if not bot_token or not config.chatId:
            result.errors.append("Bot token or chat ID not configured")
            result.completedAt = datetime.utcnow()
            return result

        telegram = TelegramService(bot_token, config.chatId)
        message = self._format_message(issues_to_send, now)
        msg_id = await telegram.send_message(message)

        # Log each issue
        cooldown_expires = now + timedelta(minutes=config.notificationCooldownMinutes)

        for issue in issues_to_send:
            log_entry = NotificationLog(
                issueKey=issue.issue_key,
                checkType=issue.checkType.value,
                severity=issue.severity.value,
                title=issue.title,
                description=issue.description,
                telegramMessageId=msg_id,
                sentAt=now,
                cooldownExpiresAt=cooldown_expires,
            )
            await col.update_one(
                {"issueKey": issue.issue_key},
                {"$set": log_entry.model_dump()},
                upsert=True,
            )

        result.sentIssues = len(issues_to_send)
        result.completedAt = datetime.utcnow()

        logger.info(
            f"[Watchdog] Run complete. {result.totalIssues} issues, "
            f"{result.sentIssues} sent, {result.skippedByCooldown} on cooldown."
        )
        return result

    def _format_message(self, issues: List[WatchdogIssue], now: datetime) -> str:
        """Format issues into a Telegram HTML message."""
        lines = [
            "<b>A64 Watchdog Alert</b>",
            f"<i>{len(issues)} issue{'s' if len(issues) != 1 else ''} detected</i>",
            "",
        ]

        remaining = MAX_MESSAGE_LENGTH - 200  # Reserve space for footer

        for i, issue in enumerate(issues):
            block = f"<b>{issue.title}</b>\n{issue.description}\n"
            if len("\n".join(lines)) + len(block) + 2 > remaining:
                lines.append(f"...and {len(issues) - i} more issues")
                break
            lines.append(block)

        lines.append(f"Checked: {now.strftime('%Y-%m-%d %H:%M')} UTC")

        return "\n".join(lines)

    async def get_history(self, limit: int = 50) -> List[dict]:
        """Get recent notification log entries."""
        col = self.db[NOTIFICATIONS_COLLECTION]
        cursor = col.find(
            {},
            {"_id": 0},
        ).sort("sentAt", -1).limit(limit)
        return await cursor.to_list(length=limit)
