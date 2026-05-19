"""
Health and readiness endpoints.

/health — always returns 200 (used by Docker HEALTHCHECK)
/ready  — verifies MySQL connectivity before returning 200
"""

import logging

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from ...db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Liveness probe",
    description="Always returns 200. Used by Docker HEALTHCHECK.",
)
async def health() -> dict:
    """Return service liveness status."""
    return {"status": "ok", "service": "finance"}


@router.get(
    "/ready",
    status_code=status.HTTP_200_OK,
    summary="Readiness probe",
    description="Returns 200 when MySQL is reachable, 503 otherwise.",
)
async def ready() -> JSONResponse:
    """
    Check MySQL connectivity.

    Returns:
        200 JSON if DB is reachable, 503 if not.
    """
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "ready", "db": "ok"},
        )
    except Exception as exc:
        logger.error("Readiness check failed: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not_ready", "db": "unavailable"},
        )
