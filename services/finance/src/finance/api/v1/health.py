"""
Health and readiness endpoints.

/health         — always returns 200 (used by Docker HEALTHCHECK)
/ready          — verifies MySQL connectivity before returning 200
/system/health  — Wave 0 capability probe (Mounted at /api/v1/system/health;
                  see services/finance/src/finance/main.py for registration).
                  Returns service version so the ops backend can surface it
                  via /api/v1/system/capabilities.
"""

import logging

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from ...config import settings
from ...db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])

# Reason: Wave 0 capability ping. Pulled from pyproject.toml at build time —
# kept here as a fallback so the response shape is stable when packaging
# metadata isn't readable from the runtime environment.
_SERVICE_VERSION = "0.1.0"


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Liveness probe",
    description="Always returns 200. Used by Docker HEALTHCHECK.",
)
async def health() -> dict:
    """Return service liveness status."""
    return {
        "status": "ok",
        "service": "finance",
        "version": _SERVICE_VERSION,
    }


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


# ─── Wave 0 — System capability probe ────────────────────────────────────
#
# This router is mounted at `/api/v1/system` (see main.py) so this endpoint
# resolves to `/api/v1/system/health`. The ops backend hits it internally
# (via the docker network at http://finance:8001/api/v1/system/health) to
# decide whether to report `modules.finance.reachable=true` to the frontend.

system_router = APIRouter(tags=["System"])


@system_router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="System capability probe",
    description=(
        "Wave 0 — used by the ops backend's /api/v1/system/capabilities "
        "endpoint to decide whether finance is reachable. Returns service "
        "version so the frontend can show it in admin tooling."
    ),
)
async def system_health() -> dict:
    return {
        "status": "ok",
        "service": "finance",
        "version": _SERVICE_VERSION,
    }
