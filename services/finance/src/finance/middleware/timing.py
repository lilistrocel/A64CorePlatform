"""
Request Timing Middleware

Adds X-Response-Time header to all responses.
Logs a warning for requests that exceed the slow threshold.
"""

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

_SLOW_THRESHOLD_MS = 1000  # 1 second
_SKIP_HEALTH_PATHS = {"/api/v1/finance/health", "/api/v1/finance/ready"}


class TimingMiddleware(BaseHTTPMiddleware):
    """Measure and annotate response time for every request."""

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        start = time.perf_counter()
        response: Response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"

        if elapsed_ms > _SLOW_THRESHOLD_MS and request.url.path not in _SKIP_HEALTH_PATHS:
            logger.warning(
                "Slow request: %s %s took %.1fms",
                request.method,
                request.url.path,
                elapsed_ms,
            )

        return response
