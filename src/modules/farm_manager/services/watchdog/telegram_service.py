"""
Telegram Service - httpx-based Telegram Bot API client.

Only uses sendMessage and getMe endpoints. No external Telegram library needed.
"""

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org/bot"


class TelegramService:
    """Sends messages via the Telegram Bot API using httpx."""

    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"{TELEGRAM_API_BASE}{bot_token}"

    async def send_message(self, text: str, parse_mode: str = "HTML") -> Optional[int]:
        """
        Send a message to the configured chat.

        Args:
            text: Message content (HTML supported)
            parse_mode: Telegram parse mode (HTML or Markdown)

        Returns:
            Telegram message_id on success, None on failure
        """
        url = f"{self.base_url}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                data = resp.json()

            if data.get("ok"):
                msg_id = data["result"]["message_id"]
                logger.info(f"[Telegram] Message sent (id={msg_id})")
                return msg_id

            logger.error(f"[Telegram] API error: {data.get('description', 'unknown')}")
            return None

        except Exception as e:
            logger.error(f"[Telegram] Failed to send message: {e}")
            return None

    async def test_connection(self) -> dict:
        """
        Test the bot token and chat ID by calling getMe + sending a test message.

        Returns:
            Dict with 'success', 'botName', and 'message' keys.
        """
        # Step 1: Verify bot token via getMe
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.base_url}/getMe")
                data = resp.json()

            if not data.get("ok"):
                return {
                    "success": False,
                    "botName": None,
                    "message": f"Invalid bot token: {data.get('description', 'unknown error')}",
                }

            bot_name = data["result"].get("first_name", "Unknown Bot")
            bot_username = data["result"].get("username", "")

        except Exception as e:
            return {
                "success": False,
                "botName": None,
                "message": f"Connection failed: {str(e)}",
            }

        # Step 2: Send a test message
        msg_id = await self.send_message(
            "<b>A64 Watchdog Test</b>\n\n"
            "This is a test notification from the A64 Core Platform watchdog service.\n"
            "If you received this, your Telegram integration is working correctly."
        )

        if msg_id:
            return {
                "success": True,
                "botName": f"{bot_name} (@{bot_username})" if bot_username else bot_name,
                "message": "Test message sent successfully",
                "messageId": msg_id,
            }

        return {
            "success": False,
            "botName": f"{bot_name} (@{bot_username})" if bot_username else bot_name,
            "message": "Bot token is valid but failed to send message. Check chat ID.",
        }
