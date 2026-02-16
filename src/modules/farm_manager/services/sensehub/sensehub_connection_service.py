"""
SenseHub Connection Service

Manages connecting and disconnecting blocks to SenseHub instances.
Handles credential storage, token caching, and client creation.
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import HTTPException

from ..database import farm_db
from .sensehub_client import SenseHubClient
from src.utils.encryption import encrypt_sensehub_password, decrypt_sensehub_password

logger = logging.getLogger(__name__)


class SenseHubConnectionService:
    """Manages SenseHub connection lifecycle for blocks."""

    @staticmethod
    async def connect(
        farm_id: UUID,
        block_id: UUID,
        address: str,
        port: int,
        email: str,
        password: str,
    ) -> dict:
        """
        Test connection, authenticate, store encrypted credentials, update block.

        Returns connection status, SenseHub version, and equipment count.
        """
        # Create a temporary client to test the connection
        client = SenseHubClient(
            address=address,
            port=port,
            email=email,
            password=password,
        )

        # 1. Health check (no auth needed)
        try:
            health = await client.health_check()
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"SenseHub unreachable at {address}:{port}: {str(e)}",
            )

        # 2. Check setup status
        # SenseHub returns {"needsSetup": false, "userCount": N}
        # Also handle legacy format {"setupCompleted": true}
        try:
            setup = await client.get_setup_status()
            needs_setup = setup.get("needsSetup", not setup.get("setupCompleted", False))
            if needs_setup:
                raise HTTPException(
                    status_code=400,
                    detail="SenseHub instance has not completed initial setup. "
                    "Please complete setup on the device first.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not check setup status: {e}")

        # 3. Login to get token
        try:
            token = await client._login()
        except Exception as e:
            raise HTTPException(
                status_code=401,
                detail=f"SenseHub authentication failed: {str(e)}. "
                "Check email and password.",
            )

        # 4. Get equipment count for status response
        equipment_count = 0
        try:
            equipment = await client.get_equipment()
            equipment_count = len(equipment)
        except Exception:
            pass

        # 5. Encrypt password
        encrypted_pw = encrypt_sensehub_password(password)

        # 6. Update block in database
        db = farm_db.get_database()
        now = datetime.utcnow()

        update_data = {
            "iotController": {
                "address": address,
                "port": port,
                "enabled": True,
                "controllerType": "sensehub",
                "senseHubCredentials": {
                    "email": email,
                    "encryptedPassword": encrypted_pw,
                    "token": token,
                    "tokenExpiresAt": client.cached_token_expires,
                },
                "connectionStatus": "connected",
                "lastConnected": now,
                "lastSyncedAt": now,
            },
            "updatedAt": now,
        }

        result = await db.blocks.update_one(
            {"blockId": str(block_id), "farmId": str(farm_id), "isActive": True},
            {"$set": update_data},
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Block not found")

        version = health.get("version", "unknown")

        return {
            "status": "connected",
            "address": address,
            "port": port,
            "senseHubVersion": version,
            "equipmentCount": equipment_count,
            "lastConnected": now.isoformat(),
        }

    @staticmethod
    async def disconnect(farm_id: UUID, block_id: UUID) -> dict:
        """Clear stored credentials and token from block."""
        db = farm_db.get_database()

        update_data = {
            "iotController.senseHubCredentials": None,
            "iotController.connectionStatus": "disconnected",
            "iotController.enabled": False,
            "updatedAt": datetime.utcnow(),
        }

        result = await db.blocks.update_one(
            {"blockId": str(block_id), "farmId": str(farm_id), "isActive": True},
            {"$set": update_data},
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Block not found")

        return {"status": "disconnected"}

    @staticmethod
    async def get_status(farm_id: UUID, block_id: UUID) -> dict:
        """Return connection status, last connected time, SenseHub health."""
        db = farm_db.get_database()

        block = await db.blocks.find_one(
            {"blockId": str(block_id), "farmId": str(farm_id), "isActive": True}
        )
        if not block:
            raise HTTPException(status_code=404, detail="Block not found")

        iot = block.get("iotController")
        if not iot:
            return {
                "connected": False,
                "connectionStatus": "unknown",
                "lastConnected": None,
                "lastSyncedAt": None,
                "senseHubVersion": None,
            }

        creds = iot.get("senseHubCredentials")
        result = {
            "connected": iot.get("connectionStatus") == "connected",
            "connectionStatus": iot.get("connectionStatus", "unknown"),
            "lastConnected": iot.get("lastConnected"),
            "lastSyncedAt": iot.get("lastSyncedAt"),
            "senseHubVersion": None,
            "address": iot.get("address"),
            "port": iot.get("port"),
            "controllerType": iot.get("controllerType", "sensehub"),
        }

        # Try to get live health if connected
        if creds and iot.get("enabled") and iot.get("address"):
            try:
                temp_client = SenseHubClient(
                    address=iot["address"],
                    port=iot.get("port", 3000),
                    email="",
                    password="",
                )
                health = await temp_client.health_check()
                result["senseHubVersion"] = health.get("version")
                result["senseHubHealth"] = health
            except Exception:
                # SenseHub might be offline - that's fine
                pass

        return result

    @staticmethod
    async def get_client(farm_id: UUID, block_id: UUID) -> SenseHubClient:
        """
        Get an authenticated SenseHubClient for a block's SenseHub instance.

        Loads block from DB, decrypts password, creates client with cached token.
        """
        db = farm_db.get_database()

        block = await db.blocks.find_one(
            {"blockId": str(block_id), "farmId": str(farm_id), "isActive": True}
        )
        if not block:
            raise HTTPException(status_code=404, detail="Block not found")

        iot = block.get("iotController")
        if not iot:
            raise HTTPException(
                status_code=400,
                detail="No IoT controller configured for this block",
            )

        if not iot.get("enabled"):
            raise HTTPException(
                status_code=400,
                detail="IoT controller is disabled for this block",
            )

        creds = iot.get("senseHubCredentials")
        if not creds:
            raise HTTPException(
                status_code=400,
                detail="No SenseHub credentials configured. Use /sensehub/connect first.",
            )

        # Decrypt password
        try:
            password = decrypt_sensehub_password(creds["encryptedPassword"])
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to decrypt SenseHub credentials: {str(e)}",
            )

        client = SenseHubClient(
            address=iot["address"],
            port=iot.get("port", 3000),
            email=creds["email"],
            password=password,
            token=creds.get("token"),
            token_expires_at=creds.get("tokenExpiresAt"),
        )

        return client

    @staticmethod
    async def _update_token_cache(
        farm_id: UUID, block_id: UUID, client: SenseHubClient
    ):
        """Persist refreshed token back to the database."""
        if not client.cached_token:
            return

        db = farm_db.get_database()
        await db.blocks.update_one(
            {"blockId": str(block_id), "farmId": str(farm_id)},
            {
                "$set": {
                    "iotController.senseHubCredentials.token": client.cached_token,
                    "iotController.senseHubCredentials.tokenExpiresAt": client.cached_token_expires,
                    "iotController.lastConnected": datetime.utcnow(),
                }
            },
        )
