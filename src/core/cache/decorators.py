"""
Cache Decorators for FastAPI

Provides decorators for automatic response caching with Redis.
"""

import hashlib
import json
import logging
from functools import wraps
from typing import Optional, Callable, Any
from fastapi import Request, Response
from fastapi.responses import JSONResponse

from .redis_cache import get_redis_cache

logger = logging.getLogger(__name__)


def cache_response(
    ttl: int = 60,
    key_prefix: Optional[str] = None
):
    """
    Decorator to cache FastAPI endpoint responses with Redis.

    Automatically generates cache keys from function arguments (query/path params).
    Caches only successful responses.

    Args:
        ttl: Time-to-live in seconds (default: 60)
        key_prefix: Cache key prefix (e.g., "farm", "sales")

    Example:
        @router.get("/farms")
        @cache_response(ttl=60, key_prefix="farm")
        async def get_farms(page: int = 1, perPage: int = 20):
            # This will be cached for 60 seconds
            return {"farms": [...]}

    Cache Key Format:
        {key_prefix}:{func_name}:{args_hash}
        Example: "farm:get_farms:a1b2c3d4"
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            try:
                # Get Redis cache instance
                cache = await get_redis_cache()

                # If Redis is unavailable, skip caching and call function directly
                if not cache.is_available:
                    return await func(*args, **kwargs)

                # Generate cache key from function name and arguments
                cache_key = _generate_cache_key_from_args(func.__name__, kwargs)

                # Try to get cached response
                cached_data = await cache.get(cache_key, prefix=key_prefix)

                if cached_data is not None:
                    logger.info(
                        f"[Cache] HIT: {key_prefix}:{cache_key} "
                        f"(function: {func.__name__})"
                    )

                    # Return cached response directly
                    # FastAPI will handle serialization
                    return cached_data

                # Cache miss - call the actual function
                logger.info(
                    f"[Cache] MISS: {key_prefix}:{cache_key} "
                    f"(function: {func.__name__})"
                )

                result = await func(*args, **kwargs)

                # Cache the response
                # CRITICAL: Convert Pydantic models to dict for JSON serialization
                if hasattr(result, 'model_dump'):
                    # Pydantic v2
                    cacheable_result = result.model_dump()
                elif hasattr(result, 'dict'):
                    # Pydantic v1
                    cacheable_result = result.dict()
                else:
                    # Already dict/list or primitive
                    cacheable_result = result

                await cache.set(
                    cache_key,
                    cacheable_result,
                    ttl=ttl,
                    prefix=key_prefix
                )

                logger.info(
                    f"[Cache] STORED: {key_prefix}:{cache_key} "
                    f"(TTL: {ttl}s, function: {func.__name__})"
                )

                return result

            except Exception as e:
                # CRITICAL: Never break the application due to cache errors
                logger.error(
                    f"[Cache] Error in cache decorator for {func.__name__}: {str(e)}. "
                    "Falling back to direct call.",
                    exc_info=True
                )
                return await func(*args, **kwargs)

        return wrapper
    return decorator


def _generate_cache_key_from_args(func_name: str, kwargs: dict) -> str:
    """
    Generate cache key from function name and arguments.

    Args:
        func_name: Name of the function being cached
        kwargs: Function keyword arguments (query/path params)

    Returns:
        Cache key string (func_name + args hash)

    Example:
        func_name="get_farms", kwargs={"page": 1, "perPage": 20}
        Returns: "get_farms:3f7b2e1a"
    """
    # Filter out non-cacheable arguments (like current_user, request, dependencies)
    cacheable_args = {
        k: v for k, v in kwargs.items()
        if k not in ['current_user', 'request', 'service', 'db']
        and not k.startswith('_')
    }

    if cacheable_args:
        # Sort params for consistent hashing
        sorted_args = sorted(cacheable_args.items())

        # Convert to JSON string (handles UUIDs and other types via str())
        args_str = json.dumps(sorted_args, sort_keys=True, default=str)

        # Hash arguments to keep key length reasonable
        args_hash = hashlib.md5(args_str.encode()).hexdigest()[:8]

        return f"{func_name}:{args_hash}"
    else:
        # No cacheable args
        return func_name


def invalidate_cache_pattern(
    pattern: str,
    prefix: Optional[str] = None
) -> Callable:
    """
    Decorator to invalidate cache patterns after function execution.

    Use this on mutation endpoints (POST, PATCH, DELETE) to invalidate
    related caches.

    Args:
        pattern: Redis key pattern to invalidate (e.g., "farms:*", "dashboard:*")
        prefix: Cache key prefix (should match the prefix used in cache_response)

    Example:
        @router.post("/farms")
        @invalidate_cache_pattern("farms:*", prefix="farm")
        async def create_farm(farm_data: FarmCreate):
            # After creating farm, invalidate all farm list caches
            return created_farm
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Execute the function first
            result = await func(*args, **kwargs)

            try:
                # Get Redis cache instance
                cache = await get_redis_cache()

                if cache.is_available:
                    # Invalidate matching cache keys
                    deleted_count = await cache.delete_pattern(pattern, prefix=prefix)

                    if deleted_count > 0:
                        logger.info(
                            f"[Cache] Invalidated {deleted_count} keys "
                            f"matching {prefix}:{pattern}"
                        )

            except Exception as e:
                # CRITICAL: Never break the application due to cache errors
                logger.error(
                    f"[Cache] Error invalidating pattern {pattern}: {str(e)}",
                    exc_info=True
                )

            return result

        return wrapper
    return decorator
