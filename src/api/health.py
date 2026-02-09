"""
Health Check Endpoint

Provides health and readiness checks for the API
"""

from fastapi import APIRouter, status
from typing import Dict, Any
from datetime import datetime

from ..services.database import mongodb
from ..core.cache import get_redis_cache
from ..middleware.timing import response_time_collector

router = APIRouter()


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint

    Returns:
        Health status information including timestamp, service status,
        and database/redis connection status
    """
    # Check MongoDB connection
    db_connected = await mongodb.health_check()
    db_status = "connected" if db_connected else "disconnected"

    # Check Redis connection
    try:
        cache = await get_redis_cache()
        redis_connected = cache.is_available
        # Also do a live ping to verify current connectivity
        if redis_connected and cache._redis:
            await cache._redis.ping()
            redis_status = "connected"
        else:
            redis_status = "disconnected"
    except Exception:
        redis_status = "disconnected"

    # Overall status: healthy only if both services are connected
    overall_status = "healthy" if (db_status == "connected" and redis_status == "connected") else "degraded"

    return {
        "status": overall_status,
        "timestamp": datetime.utcnow().isoformat(),
        "service": "A64 Core Platform API Hub",
        "version": "1.0.0",
        "database": db_status,
        "redis": redis_status
    }


@router.get("/test-500", status_code=status.HTTP_200_OK)
async def test_500_error() -> Dict[str, Any]:
    """
    Test endpoint for 500 error - Feature #138 verification.
    This endpoint intentionally raises an exception to test error handling.
    """
    raise Exception("Intentional test error for Feature #138 verification")


@router.get("/test-malformed", status_code=status.HTTP_200_OK)
async def test_malformed_response() -> str:
    """
    Test endpoint for malformed response - Feature #139 verification.
    Returns plain text instead of expected JSON to test frontend handling.
    """
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content="This is not JSON", media_type="text/plain")


@router.get("/ready", status_code=status.HTTP_200_OK)
async def readiness_check() -> Dict[str, Any]:
    """
    Readiness check endpoint

    Returns:
        Readiness status - indicates if service is ready to accept requests
    """
    # Check database connection
    mongodb_status = "healthy" if await mongodb.health_check() else "unhealthy"

    # Check Redis connection
    try:
        cache = await get_redis_cache()
        redis_status = "healthy" if cache.is_available else "unhealthy"
    except Exception:
        redis_status = "unhealthy"

    # Service is ready if MongoDB is healthy
    is_ready = mongodb_status == "healthy"

    return {
        "ready": is_ready,
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {
            "mongodb": mongodb_status,
            "redis": redis_status
        }
    }


@router.get("/metrics", status_code=status.HTTP_200_OK)
async def get_metrics() -> Dict[str, Any]:
    """
    Response time metrics endpoint

    Returns comprehensive API performance metrics including:
    - Total requests and errors
    - Average, min, max response times
    - Percentile statistics (p50, p95, p99)
    - Slow request count

    Feature #372: API response time monitoring
    """
    stats = response_time_collector.get_stats()
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "metrics": stats
    }


@router.get("/metrics/slow-requests", status_code=status.HTTP_200_OK)
async def get_slow_requests() -> Dict[str, Any]:
    """
    Get recent slow requests (> 1s)

    Returns list of recent slow API calls for investigation.
    Limited to last 100 slow requests.

    Feature #372: API response time monitoring
    """
    slow_requests = response_time_collector.get_slow_requests()
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "count": len(slow_requests),
        "threshold_ms": 1000,
        "slow_requests": slow_requests
    }


@router.get("/metrics/endpoints", status_code=status.HTTP_200_OK)
async def get_endpoint_metrics() -> Dict[str, Any]:
    """
    Get response time statistics grouped by endpoint

    Returns per-endpoint metrics:
    - Request count
    - Average response time
    - Maximum response time

    Useful for identifying which endpoints need optimization.

    Feature #372: API response time monitoring
    """
    endpoint_stats = response_time_collector.get_endpoint_stats()
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "endpoints": endpoint_stats
    }
