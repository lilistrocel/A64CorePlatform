"""
Core Cache Module

Provides Redis caching utilities for the A64 Core Platform.
"""

from .redis_cache import RedisCache, get_redis_cache, close_redis_cache
from .decorators import cache_response, invalidate_cache_pattern

__all__ = [
    "RedisCache",
    "get_redis_cache",
    "close_redis_cache",
    "cache_response",
    "invalidate_cache_pattern"
]
