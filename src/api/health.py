"""
Health Check Endpoint

Provides health and readiness checks for the API
"""

from fastapi import APIRouter, status
from typing import Dict, Any
from datetime import datetime

from ..services.database import mongodb

router = APIRouter()


@router.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint

    Returns:
        Health status information including timestamp and service status
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "A64 Core Platform API Hub",
        "version": "1.0.0"
    }


@router.get("/ready", status_code=status.HTTP_200_OK)
async def readiness_check() -> Dict[str, Any]:
    """
    Readiness check endpoint

    Returns:
        Readiness status - indicates if service is ready to accept requests
    """
    # Check database connection
    mongodb_status = "healthy" if await mongodb.health_check() else "unhealthy"

    # Service is ready if MongoDB is healthy
    is_ready = mongodb_status == "healthy"

    return {
        "ready": is_ready,
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {
            "mongodb": mongodb_status
        }
    }
