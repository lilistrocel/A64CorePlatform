"""
Farm AI Chat - Pending Actions Store

Redis-backed store for write actions awaiting user confirmation.
Actions expire after 5 minutes (300s TTL).
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from src.core.cache.redis_cache import get_redis_cache

logger = logging.getLogger(__name__)

PENDING_ACTION_TTL = 300  # 5 minutes
PENDING_ACTION_PREFIX = "farm_ai:pending"


async def store_pending_action(
    tool_name: str,
    tool_input: dict,
    description: str,
    risk_level: str,
    farm_id: str,
    block_id: str,
) -> dict:
    """
    Store a pending write action in Redis.

    Returns:
        Dict with action_id and expiry info for the response.
    """
    action_id = str(uuid4())
    expires_at = datetime.utcnow() + timedelta(seconds=PENDING_ACTION_TTL)

    action_data = {
        "action_id": action_id,
        "tool_name": tool_name,
        "tool_input": tool_input,
        "description": description,
        "risk_level": risk_level,
        "farm_id": farm_id,
        "block_id": block_id,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": expires_at.isoformat() + "Z",
    }

    cache = await get_redis_cache()
    key = f"{PENDING_ACTION_PREFIX}:{action_id}"
    stored = await cache.set(key, action_data, ttl=PENDING_ACTION_TTL)

    if not stored:
        logger.warning(f"Failed to store pending action {action_id} in Redis")

    return {
        "action_id": action_id,
        "tool_name": tool_name,
        "description": description,
        "risk_level": risk_level,
        "expires_at": expires_at.isoformat() + "Z",
    }


async def load_pending_action(action_id: str) -> Optional[dict]:
    """
    Load a pending action from Redis.

    Returns:
        Action data dict or None if expired/not found.
    """
    cache = await get_redis_cache()
    key = f"{PENDING_ACTION_PREFIX}:{action_id}"
    data = await cache.get(key)
    return data


async def delete_pending_action(action_id: str) -> bool:
    """
    Delete a pending action from Redis (after execution or cancellation).

    Returns:
        True if deleted, False if not found.
    """
    cache = await get_redis_cache()
    key = f"{PENDING_ACTION_PREFIX}:{action_id}"
    return await cache.delete(key)
