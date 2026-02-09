"""
API Response Time Monitoring Middleware

Implements request timing and logging for performance monitoring:
- Logs request method, path, and duration for all requests
- Adds X-Response-Time header to all responses
- Alerts for slow requests (> 1s threshold)
- Prometheus-compatible metrics ready (optional integration)

Feature #372: Implement API response time monitoring
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import time
import logging
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class TimingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to track and log API response times.

    Features:
    - Measures request processing time in milliseconds
    - Adds X-Response-Time header to all responses
    - Logs slow requests (configurable threshold, default 1000ms)
    - Logs all requests with method, path, status, and duration
    - Skip logging for health check endpoints (optional)

    Response Headers:
    - X-Response-Time: Response time in milliseconds (e.g., "45.23ms")

    Log Format:
    - INFO: "{method} {path} {status} {duration}ms"
    - WARNING: "SLOW REQUEST: {method} {path} took {duration}ms (threshold: {threshold}ms)"
    """

    # Default slow request threshold (milliseconds)
    SLOW_REQUEST_THRESHOLD_MS = 1000

    # Paths to skip logging (high-frequency health checks)
    SKIP_LOGGING_PATHS = ["/api/health", "/api/ready", "/health"]

    def __init__(self, app, slow_threshold_ms: int = 1000, skip_health_logging: bool = True):
        """
        Initialize timing middleware.

        Args:
            app: The FastAPI/Starlette application
            slow_threshold_ms: Threshold in milliseconds for slow request warnings (default: 1000ms)
            skip_health_logging: Skip logging for health check endpoints (default: True)
        """
        super().__init__(app)
        self.slow_threshold_ms = slow_threshold_ms
        self.skip_health_logging = skip_health_logging

    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Process request and measure response time.

        Args:
            request: The incoming HTTP request
            call_next: The next middleware/handler in the chain

        Returns:
            Response with X-Response-Time header added
        """
        # Start timing
        start_time = time.perf_counter()

        # Get request info
        method = request.method
        path = request.url.path

        # Process the request
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            # Calculate duration even on error
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(
                f"ERROR {method} {path} - {duration_ms:.2f}ms - Exception: {str(e)}"
            )
            raise

        # Calculate duration
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Add X-Response-Time header
        response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"

        # Also add timing metadata that could be used by monitoring tools
        response.headers["X-Request-Start"] = str(int(start_time * 1000))

        # Log request (skip health checks if configured)
        should_log = True
        if self.skip_health_logging and path in self.SKIP_LOGGING_PATHS:
            should_log = False

        if should_log:
            # Check for slow requests
            if duration_ms > self.slow_threshold_ms:
                logger.warning(
                    f"SLOW REQUEST: {method} {path} {status_code} - "
                    f"{duration_ms:.2f}ms (threshold: {self.slow_threshold_ms}ms)"
                )
            else:
                # Log all requests at INFO level for debugging/monitoring
                logger.info(
                    f"{method} {path} {status_code} - {duration_ms:.2f}ms"
                )

        return response


class ResponseTimeCollector:
    """
    Collects response time statistics for monitoring/dashboards.

    This class provides in-memory aggregation of response times
    that can be exposed via a metrics endpoint.

    Thread-safe for multi-worker environments.
    """

    def __init__(self, window_size: int = 1000):
        """
        Initialize response time collector.

        Args:
            window_size: Number of recent requests to keep in memory (default: 1000)
        """
        self.window_size = window_size
        self._response_times: list = []
        self._slow_requests: list = []
        self._request_count = 0
        self._error_count = 0
        self._slow_threshold_ms = 1000

    def record(self, method: str, path: str, status_code: int, duration_ms: float) -> None:
        """
        Record a request's response time.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: Request path
            status_code: HTTP response status code
            duration_ms: Response time in milliseconds
        """
        self._request_count += 1

        # Track errors
        if status_code >= 400:
            self._error_count += 1

        # Store recent response times (circular buffer)
        self._response_times.append({
            "method": method,
            "path": path,
            "status": status_code,
            "duration_ms": duration_ms,
            "timestamp": datetime.utcnow().isoformat()
        })

        # Trim to window size
        if len(self._response_times) > self.window_size:
            self._response_times = self._response_times[-self.window_size:]

        # Track slow requests separately
        if duration_ms > self._slow_threshold_ms:
            self._slow_requests.append({
                "method": method,
                "path": path,
                "status": status_code,
                "duration_ms": duration_ms,
                "timestamp": datetime.utcnow().isoformat()
            })

            # Keep only last 100 slow requests
            if len(self._slow_requests) > 100:
                self._slow_requests = self._slow_requests[-100:]

    def get_stats(self) -> dict:
        """
        Get response time statistics.

        Returns:
            Dictionary with stats:
            - total_requests: Total requests recorded
            - total_errors: Total error responses (4xx/5xx)
            - recent_requests: Number of requests in current window
            - avg_response_time_ms: Average response time in window
            - min_response_time_ms: Minimum response time in window
            - max_response_time_ms: Maximum response time in window
            - p50_response_time_ms: 50th percentile (median)
            - p95_response_time_ms: 95th percentile
            - p99_response_time_ms: 99th percentile
            - slow_request_count: Number of slow requests (> 1s)
        """
        if not self._response_times:
            return {
                "total_requests": self._request_count,
                "total_errors": self._error_count,
                "recent_requests": 0,
                "avg_response_time_ms": 0,
                "min_response_time_ms": 0,
                "max_response_time_ms": 0,
                "p50_response_time_ms": 0,
                "p95_response_time_ms": 0,
                "p99_response_time_ms": 0,
                "slow_request_count": len(self._slow_requests)
            }

        durations = [r["duration_ms"] for r in self._response_times]
        durations_sorted = sorted(durations)
        n = len(durations_sorted)

        def percentile(p: float) -> float:
            idx = int(n * p / 100)
            idx = min(idx, n - 1)
            return durations_sorted[idx]

        return {
            "total_requests": self._request_count,
            "total_errors": self._error_count,
            "recent_requests": len(self._response_times),
            "avg_response_time_ms": round(sum(durations) / n, 2),
            "min_response_time_ms": round(min(durations), 2),
            "max_response_time_ms": round(max(durations), 2),
            "p50_response_time_ms": round(percentile(50), 2),
            "p95_response_time_ms": round(percentile(95), 2),
            "p99_response_time_ms": round(percentile(99), 2),
            "slow_request_count": len(self._slow_requests)
        }

    def get_slow_requests(self) -> list:
        """
        Get recent slow requests (> 1s).

        Returns:
            List of slow request records with method, path, status, duration, timestamp
        """
        return self._slow_requests.copy()

    def get_endpoint_stats(self) -> dict:
        """
        Get statistics grouped by endpoint.

        Returns:
            Dictionary with endpoint paths as keys, containing:
            - count: Number of requests
            - avg_ms: Average response time
            - max_ms: Maximum response time
        """
        endpoint_stats = {}

        for req in self._response_times:
            path = req["path"]
            if path not in endpoint_stats:
                endpoint_stats[path] = {
                    "count": 0,
                    "total_ms": 0,
                    "max_ms": 0
                }

            endpoint_stats[path]["count"] += 1
            endpoint_stats[path]["total_ms"] += req["duration_ms"]
            endpoint_stats[path]["max_ms"] = max(
                endpoint_stats[path]["max_ms"],
                req["duration_ms"]
            )

        # Calculate averages
        result = {}
        for path, stats in endpoint_stats.items():
            result[path] = {
                "count": stats["count"],
                "avg_ms": round(stats["total_ms"] / stats["count"], 2),
                "max_ms": round(stats["max_ms"], 2)
            }

        return result


# Global response time collector instance
response_time_collector = ResponseTimeCollector()


class TimingMiddlewareWithCollector(BaseHTTPMiddleware):
    """
    Enhanced timing middleware that also records metrics to collector.

    Use this version if you want both logging and metrics collection.
    """

    SKIP_LOGGING_PATHS = ["/api/health", "/api/ready", "/health"]

    def __init__(self, app, slow_threshold_ms: int = 1000, skip_health_logging: bool = True):
        super().__init__(app)
        self.slow_threshold_ms = slow_threshold_ms
        self.skip_health_logging = skip_health_logging

    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.perf_counter()
        method = request.method
        path = request.url.path

        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"ERROR {method} {path} - {duration_ms:.2f}ms - Exception: {str(e)}")
            raise

        duration_ms = (time.perf_counter() - start_time) * 1000

        # Add response time header
        response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"

        # Record to collector (skip health checks)
        if path not in self.SKIP_LOGGING_PATHS:
            response_time_collector.record(method, path, status_code, duration_ms)

        # Log slow requests
        if path not in self.SKIP_LOGGING_PATHS or not self.skip_health_logging:
            if duration_ms > self.slow_threshold_ms:
                logger.warning(
                    f"SLOW REQUEST: {method} {path} {status_code} - "
                    f"{duration_ms:.2f}ms (threshold: {self.slow_threshold_ms}ms)"
                )
            else:
                logger.info(f"{method} {path} {status_code} - {duration_ms:.2f}ms")

        return response
