"""
Watchdog Config Service - CRUD for watchdog configuration in system_config collection.
"""

import logging
from datetime import datetime
from typing import Optional

from ..database import farm_db
from .models import WatchdogConfig, WatchdogConfigUpdate

logger = logging.getLogger(__name__)

CONFIG_TYPE = "watchdog"
COLLECTION = "system_config"


class WatchdogConfigService:
    """CRUD service for watchdog configuration."""

    def __init__(self, db=None):
        self.db = db if db is not None else farm_db.get_database()
        self.collection = self.db[COLLECTION]

    async def get_config(self) -> WatchdogConfig:
        """Get the current watchdog configuration, creating defaults if not found."""
        doc = await self.collection.find_one({"configType": CONFIG_TYPE})
        if doc:
            return WatchdogConfig(
                botToken=doc.get("botToken", ""),
                chatId=doc.get("chatId", ""),
                enabled=doc.get("enabled", False),
                checkIntervalMinutes=doc.get("checkIntervalMinutes", 15),
                notificationCooldownMinutes=doc.get("notificationCooldownMinutes", 60),
                severityThreshold=doc.get("severityThreshold", "high_plus"),
                enabledChecks=doc.get("enabledChecks", [
                    "mcp_reachability", "late_items", "active_alerts",
                    "block_health", "system_health"
                ]),
                updatedAt=doc.get("updatedAt"),
                updatedBy=doc.get("updatedBy"),
                updatedByEmail=doc.get("updatedByEmail"),
            )

        # Create default config
        logger.info("No watchdog config found, creating defaults")
        default = WatchdogConfig()
        await self.collection.insert_one({
            "configType": CONFIG_TYPE,
            "botToken": "",
            "chatId": "",
            "enabled": False,
            "checkIntervalMinutes": 15,
            "notificationCooldownMinutes": 60,
            "severityThreshold": "high_plus",
            "enabledChecks": default.enabledChecks,
            "updatedAt": datetime.utcnow(),
        })
        return default

    async def update_config(
        self,
        update: WatchdogConfigUpdate,
        user_id: str,
        user_email: str,
    ) -> WatchdogConfig:
        """Update watchdog configuration. Only sets provided fields."""
        set_fields: dict = {
            "updatedAt": datetime.utcnow(),
            "updatedBy": user_id,
            "updatedByEmail": user_email,
        }

        if update.botToken is not None:
            # Encrypt the token before storing
            from src.utils.encryption import encrypt_telegram_token
            set_fields["botToken"] = encrypt_telegram_token(update.botToken)

        if update.chatId is not None:
            set_fields["chatId"] = update.chatId
        if update.enabled is not None:
            set_fields["enabled"] = update.enabled
        if update.checkIntervalMinutes is not None:
            set_fields["checkIntervalMinutes"] = update.checkIntervalMinutes
        if update.notificationCooldownMinutes is not None:
            set_fields["notificationCooldownMinutes"] = update.notificationCooldownMinutes
        if update.severityThreshold is not None:
            set_fields["severityThreshold"] = update.severityThreshold.value
        if update.enabledChecks is not None:
            set_fields["enabledChecks"] = update.enabledChecks

        await self.collection.update_one(
            {"configType": CONFIG_TYPE},
            {
                "$set": set_fields,
                "$setOnInsert": {"configType": CONFIG_TYPE},
            },
            upsert=True,
        )

        logger.info(f"Watchdog config updated by {user_email}")
        return await self.get_config()

    async def get_decrypted_bot_token(self) -> Optional[str]:
        """Get the decrypted bot token for use in API calls. Never expose via API."""
        doc = await self.collection.find_one({"configType": CONFIG_TYPE})
        if not doc or not doc.get("botToken"):
            return None

        try:
            from src.utils.encryption import decrypt_telegram_token
            return decrypt_telegram_token(doc["botToken"])
        except Exception as e:
            logger.error(f"Failed to decrypt Telegram token: {e}")
            return None

    def mask_token(self, config: WatchdogConfig) -> dict:
        """Return config dict with bot token masked for API responses."""
        data = config.model_dump()
        token = data.get("botToken", "")
        if token:
            # Show only first 5 and last 4 chars
            if len(token) > 12:
                data["botToken"] = token[:5] + "..." + token[-4:]
            else:
                data["botToken"] = "***configured***"
            data["botTokenConfigured"] = True
        else:
            data["botToken"] = ""
            data["botTokenConfigured"] = False
        return data
