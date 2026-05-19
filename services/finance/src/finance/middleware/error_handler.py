"""
Global Error Handler Middleware

Catches unhandled exceptions and returns structured error responses.
Stack traces are never exposed in production responses.
"""

import logging

from fastapi import Request, status
from fastapi.responses import JSONResponse

from ..config import settings

logger = logging.getLogger(__name__)


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handle all unhandled exceptions uniformly.

    Args:
        request: Incoming FastAPI request.
        exc: Unhandled exception instance.

    Returns:
        JSON 500 response — detail omitted in production.
    """
    logger.error(
        "Unhandled exception on %s %s: %s",
        request.method,
        request.url.path,
        str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "message": "Internal server error",
                "code": "INTERNAL_ERROR",
                # Reason: Never expose stack traces in production
                "detail": str(exc) if settings.DEBUG else None,
            }
        },
    )
