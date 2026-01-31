"""
Redis Cache Service

Provides async Redis caching with JSON serialization, TTL support,
and graceful fallback for application resilience.
"""

import os
import json
import logging
from typing import Optional, Any, Union
from redis.asyncio import Redis, ConnectionPool
from redis.exceptions import RedisError, ConnectionError as RedisConnectionError

logger = logging.getLogger(__name__)


class RedisCache:
    """
    Async Redis cache service with JSON serialization and graceful degradation.

    Features:
    - Async Redis operations using redis-py 5.0+
    - JSON serialization for complex objects
    - TTL (time-to-live) support
    - Cache key prefixing by module
    - Connection pooling for performance
    - Graceful fallback if Redis is unavailable
    """

    def __init__(self, redis_url: Optional[str] = None):
        """
        Initialize Redis cache service.

        Args:
            redis_url: Redis connection URL (default: from env or redis://localhost:6379)
        """
        self.redis_url = redis_url or os.getenv(
            "REDIS_URL",
            "redis://redis:6379"  # Docker network default
        )
        self._redis: Optional[Redis] = None
        self._pool: Optional[ConnectionPool] = None
        self._is_available = False

    async def connect(self) -> None:
        """
        Establish Redis connection with connection pooling.

        Raises:
            RedisConnectionError: If connection fails (logged, not raised)
        """
        try:
            # Create connection pool for better performance
            self._pool = ConnectionPool.from_url(
                self.redis_url,
                max_connections=10,
                decode_responses=True,  # Auto-decode bytes to strings
                socket_timeout=5,
                socket_connect_timeout=5
            )

            self._redis = Redis(connection_pool=self._pool)

            # Test connection
            await self._redis.ping()
            self._is_available = True

            logger.info(f"[Redis Cache] Connected successfully to {self.redis_url}")

        except (RedisError, RedisConnectionError) as e:
            self._is_available = False
            logger.warning(
                f"[Redis Cache] Connection failed: {str(e)}. "
                "Caching disabled, falling back to direct DB queries."
            )

    async def disconnect(self) -> None:
        """Close Redis connection and cleanup resources."""
        if self._redis:
            await self._redis.close()
            logger.info("[Redis Cache] Disconnected")

    async def get(
        self,
        key: str,
        prefix: Optional[str] = None
    ) -> Optional[Any]:
        """
        Get value from cache with automatic JSON deserialization.

        Args:
            key: Cache key
            prefix: Optional key prefix (e.g., "farm", "sales")

        Returns:
            Cached value (deserialized from JSON) or None if not found
        """
        if not self._is_available or not self._redis:
            return None

        try:
            full_key = f"{prefix}:{key}" if prefix else key
            value = await self._redis.get(full_key)

            if value is None:
                logger.debug(f"[Redis Cache] MISS: {full_key}")
                return None

            logger.debug(f"[Redis Cache] HIT: {full_key}")

            # Deserialize JSON
            return json.loads(value)

        except (RedisError, json.JSONDecodeError) as e:
            logger.warning(f"[Redis Cache] Get error for key {key}: {str(e)}")
            return None

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        prefix: Optional[str] = None
    ) -> bool:
        """
        Set value in cache with JSON serialization and optional TTL.

        Args:
            key: Cache key
            value: Value to cache (will be JSON serialized)
            ttl: Time-to-live in seconds (None = no expiry)
            prefix: Optional key prefix (e.g., "farm", "sales")

        Returns:
            True if successful, False otherwise
        """
        if not self._is_available or not self._redis:
            return False

        try:
            full_key = f"{prefix}:{key}" if prefix else key

            # Serialize to JSON
            serialized = json.dumps(value, default=str)  # default=str handles datetime, UUID

            # Set with TTL if provided
            if ttl:
                await self._redis.setex(full_key, ttl, serialized)
                logger.debug(f"[Redis Cache] SET: {full_key} (TTL: {ttl}s)")
            else:
                await self._redis.set(full_key, serialized)
                logger.debug(f"[Redis Cache] SET: {full_key} (no TTL)")

            return True

        except (RedisError, TypeError) as e:
            logger.warning(f"[Redis Cache] Set error for key {key}: {str(e)}")
            return False

    async def delete(
        self,
        key: str,
        prefix: Optional[str] = None
    ) -> bool:
        """
        Delete a key from cache.

        Args:
            key: Cache key to delete
            prefix: Optional key prefix

        Returns:
            True if key was deleted, False otherwise
        """
        if not self._is_available or not self._redis:
            return False

        try:
            full_key = f"{prefix}:{key}" if prefix else key
            result = await self._redis.delete(full_key)

            if result > 0:
                logger.debug(f"[Redis Cache] DELETE: {full_key}")
                return True

            return False

        except RedisError as e:
            logger.warning(f"[Redis Cache] Delete error for key {key}: {str(e)}")
            return False

    async def delete_pattern(
        self,
        pattern: str,
        prefix: Optional[str] = None
    ) -> int:
        """
        Delete all keys matching a pattern (for cache invalidation).

        Args:
            pattern: Redis key pattern (e.g., "dashboard:*", "farms:*")
            prefix: Optional key prefix

        Returns:
            Number of keys deleted
        """
        if not self._is_available or not self._redis:
            return 0

        try:
            full_pattern = f"{prefix}:{pattern}" if prefix else pattern

            # Find matching keys
            keys = []
            async for key in self._redis.scan_iter(match=full_pattern, count=100):
                keys.append(key)

            if not keys:
                logger.debug(f"[Redis Cache] DELETE_PATTERN: {full_pattern} (0 keys found)")
                return 0

            # Delete all matching keys
            deleted = await self._redis.delete(*keys)
            logger.info(
                f"[Redis Cache] DELETE_PATTERN: {full_pattern} ({deleted} keys deleted)"
            )

            return deleted

        except RedisError as e:
            logger.warning(
                f"[Redis Cache] Delete pattern error for {pattern}: {str(e)}"
            )
            return 0

    async def exists(
        self,
        key: str,
        prefix: Optional[str] = None
    ) -> bool:
        """
        Check if a key exists in cache.

        Args:
            key: Cache key
            prefix: Optional key prefix

        Returns:
            True if key exists, False otherwise
        """
        if not self._is_available or not self._redis:
            return False

        try:
            full_key = f"{prefix}:{key}" if prefix else key
            result = await self._redis.exists(full_key)
            return result > 0

        except RedisError as e:
            logger.warning(f"[Redis Cache] Exists check error for key {key}: {str(e)}")
            return False

    async def ttl(
        self,
        key: str,
        prefix: Optional[str] = None
    ) -> Optional[int]:
        """
        Get remaining TTL for a key.

        Args:
            key: Cache key
            prefix: Optional key prefix

        Returns:
            Remaining TTL in seconds, None if key doesn't exist, -1 if no TTL set
        """
        if not self._is_available or not self._redis:
            return None

        try:
            full_key = f"{prefix}:{key}" if prefix else key
            result = await self._redis.ttl(full_key)

            # Redis returns:
            # -2 if key doesn't exist
            # -1 if key exists but has no expiry
            # >0 for remaining TTL
            if result == -2:
                return None

            return result

        except RedisError as e:
            logger.warning(f"[Redis Cache] TTL check error for key {key}: {str(e)}")
            return None

    @property
    def is_available(self) -> bool:
        """Check if Redis is available."""
        return self._is_available


# Global Redis cache instance
_redis_cache: Optional[RedisCache] = None


async def get_redis_cache() -> RedisCache:
    """
    Get or create global Redis cache instance.

    Returns:
        RedisCache instance (connected)
    """
    global _redis_cache

    if _redis_cache is None:
        _redis_cache = RedisCache()
        await _redis_cache.connect()

    return _redis_cache


async def close_redis_cache() -> None:
    """Close global Redis cache instance."""
    global _redis_cache

    if _redis_cache:
        await _redis_cache.disconnect()
        _redis_cache = None
