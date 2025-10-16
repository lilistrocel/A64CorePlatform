"""
Rate Limiting Middleware

Implements rate limiting per user role as defined in User-Structure.md
"""

from fastapi import Request, HTTPException, status
from typing import Dict, Optional
from datetime import datetime, timedelta
import logging

from ..models.user import UserRole

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    In-memory rate limiter

    Rate limits per User-Structure.md:
    - Guest: 10 requests/minute
    - User: 100 requests/minute
    - Moderator: 200 requests/minute
    - Admin: 500 requests/minute
    - Super Admin: 1000 requests/minute

    Note: In production, use Redis or similar for distributed rate limiting
    """

    def __init__(self):
        # Reason: Store request counts with timestamps
        self.requests: Dict[str, list] = {}

        # Rate limits per role (requests per minute)
        self.limits = {
            UserRole.GUEST: 10,
            UserRole.USER: 100,
            UserRole.MODERATOR: 200,
            UserRole.ADMIN: 500,
            UserRole.SUPER_ADMIN: 1000
        }

    def _get_client_id(self, request: Request) -> str:
        """
        Get unique client identifier

        Uses user ID if authenticated, otherwise IP address
        """
        # Try to get user from request state (set by auth middleware)
        user = getattr(request.state, "user", None)
        if user and hasattr(user, "userId"):
            return f"user:{user.userId}"

        # Fall back to IP address for unauthenticated requests
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            ip = forwarded_for.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"

        return f"ip:{ip}"

    def _get_user_role(self, request: Request) -> UserRole:
        """Get user role from request state, default to GUEST"""
        user = getattr(request.state, "user", None)
        if user and hasattr(user, "role"):
            return user.role
        return UserRole.GUEST

    def _clean_old_requests(self, client_id: str, window_start: datetime) -> None:
        """Remove requests older than the time window"""
        if client_id in self.requests:
            self.requests[client_id] = [
                req_time for req_time in self.requests[client_id]
                if req_time > window_start
            ]

    async def check_rate_limit(self, request: Request) -> None:
        """
        Check if request is within rate limit

        Raises:
            HTTPException: 429 if rate limit exceeded
        """
        client_id = self._get_client_id(request)
        user_role = self._get_user_role(request)

        # Get rate limit for user role
        limit = self.limits.get(user_role, self.limits[UserRole.GUEST])

        # Current time and window start (1 minute ago)
        now = datetime.utcnow()
        window_start = now - timedelta(minutes=1)

        # Clean old requests
        self._clean_old_requests(client_id, window_start)

        # Initialize if first request
        if client_id not in self.requests:
            self.requests[client_id] = []

        # Count requests in current window
        request_count = len(self.requests[client_id])

        # Check if limit exceeded
        if request_count >= limit:
            logger.warning(
                f"Rate limit exceeded for {client_id} "
                f"(role: {user_role.value}, limit: {limit}/min)"
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {limit} requests per minute.",
                headers={"Retry-After": "60"}
            )

        # Add current request
        self.requests[client_id].append(now)

        # Log if approaching limit (80% threshold)
        if request_count >= (limit * 0.8):
            logger.info(
                f"Rate limit warning for {client_id}: "
                f"{request_count + 1}/{limit} requests"
            )


# Global rate limiter instance
# Note: In production, replace with Redis-based rate limiter
rate_limiter = RateLimiter()


async def rate_limit_dependency(request: Request) -> None:
    """
    FastAPI dependency for rate limiting

    Usage:
        @router.get("/endpoint", dependencies=[Depends(rate_limit_dependency)])
        async def my_endpoint():
            ...
    """
    await rate_limiter.check_rate_limit(request)


class LoginRateLimiter:
    """
    Specialized rate limiter for login attempts

    Prevents brute force attacks:
    - Max 5 failed attempts per email
    - 15 minute lockout after limit reached
    """

    def __init__(self):
        # Reason: Track failed login attempts per email
        self.failed_attempts: Dict[str, list] = {}
        self.max_attempts = 5
        self.lockout_duration = timedelta(minutes=15)

    def _clean_old_attempts(self, email: str, window_start: datetime) -> None:
        """Remove attempts older than lockout window"""
        if email in self.failed_attempts:
            self.failed_attempts[email] = [
                attempt_time for attempt_time in self.failed_attempts[email]
                if attempt_time > window_start
            ]

    def check_login_attempts(self, email: str) -> None:
        """
        Check if email is locked out due to failed attempts

        Raises:
            HTTPException: 429 if account is locked
        """
        now = datetime.utcnow()
        window_start = now - self.lockout_duration

        # Clean old attempts
        self._clean_old_attempts(email, window_start)

        # Initialize if first attempt
        if email not in self.failed_attempts:
            self.failed_attempts[email] = []

        # Count recent failed attempts
        attempt_count = len(self.failed_attempts[email])

        # Check if locked out
        if attempt_count >= self.max_attempts:
            # Calculate remaining lockout time
            oldest_attempt = min(self.failed_attempts[email])
            unlock_time = oldest_attempt + self.lockout_duration
            remaining = int((unlock_time - now).total_seconds() / 60)

            logger.warning(f"Login locked for email: {email} (attempts: {attempt_count})")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Try again in {remaining} minutes.",
                headers={"Retry-After": str(remaining * 60)}
            )

    def record_failed_attempt(self, email: str) -> None:
        """Record a failed login attempt"""
        if email not in self.failed_attempts:
            self.failed_attempts[email] = []

        self.failed_attempts[email].append(datetime.utcnow())
        logger.info(f"Failed login attempt recorded for: {email}")

    def clear_attempts(self, email: str) -> None:
        """Clear failed attempts after successful login"""
        if email in self.failed_attempts:
            del self.failed_attempts[email]
            logger.info(f"Login attempts cleared for: {email}")


# Global login rate limiter instance
login_rate_limiter = LoginRateLimiter()
