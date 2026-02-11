"""
Rate Limiting Middleware

Implements rate limiting per user role as defined in User-Structure.md
Uses Redis for distributed rate limiting with in-memory fallback
"""

from fastapi import Request, HTTPException, status, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
import logging
import os
import time
from redis.asyncio import Redis, ConnectionPool
from redis.exceptions import RedisError, ConnectionError as RedisConnectionError

from ..models.user import UserRole
from ..config.settings import settings

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Redis-backed rate limiter with in-memory fallback

    Rate limits per User-Structure.md:
    - Guest: 10 requests/minute
    - User: 100 requests/minute
    - Moderator: 200 requests/minute
    - Admin: 500 requests/minute
    - Super Admin: 1000 requests/minute

    Uses Redis INCR with sliding window counter approach for distributed rate limiting.
    Falls back to in-memory dict if Redis is unavailable.
    """

    def __init__(self):
        # Redis connection (lazily initialized)
        self.redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        self._redis: Optional[Redis] = None
        self._pool: Optional[ConnectionPool] = None
        self._redis_available = False
        self._fallback_warning_logged = False

        # In-memory fallback storage
        self.requests: Dict[str, list] = {}

        # Rate limits per role (requests per minute) - configurable via env vars
        self.limits = {
            UserRole.GUEST: settings.RATE_LIMIT_GUEST,
            UserRole.USER: settings.RATE_LIMIT_USER,
            UserRole.MODERATOR: settings.RATE_LIMIT_MODERATOR,
            UserRole.ADMIN: settings.RATE_LIMIT_ADMIN,
            UserRole.SUPER_ADMIN: settings.RATE_LIMIT_SUPER_ADMIN,
        }

    async def _ensure_redis_connection(self) -> bool:
        """
        Lazily initialize Redis connection with connection pooling.

        Returns:
            True if Redis is available, False otherwise
        """
        if self._redis is not None:
            return self._redis_available

        try:
            # Create connection pool
            self._pool = ConnectionPool.from_url(
                self.redis_url,
                max_connections=10,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5
            )

            self._redis = Redis(connection_pool=self._pool)

            # Test connection
            await self._redis.ping()
            self._redis_available = True

            logger.info(f"[Rate Limiter] Connected to Redis at {self.redis_url}")
            return True

        except (RedisError, RedisConnectionError) as e:
            self._redis_available = False
            if not self._fallback_warning_logged:
                logger.warning(
                    f"[Rate Limiter] Redis connection failed: {str(e)}. "
                    "Falling back to in-memory rate limiting."
                )
                self._fallback_warning_logged = True
            return False

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

    async def _check_rate_limit_redis(
        self,
        client_id: str,
        limit: int
    ) -> tuple[bool, int]:
        """
        Check rate limit using Redis sliding window counter.

        Key pattern: rate_limit:{client_id}:{window_timestamp}
        TTL: 60 seconds (self-cleaning)

        Args:
            client_id: Unique client identifier
            limit: Request limit for this client

        Returns:
            Tuple of (is_allowed, current_count)
        """
        try:
            # Use current minute as window timestamp
            current_window = int(time.time() / 60)
            redis_key = f"rate_limit:{client_id}:{current_window}"

            # Increment counter
            current_count = await self._redis.incr(redis_key)

            # Set TTL on first increment (key creation)
            if current_count == 1:
                await self._redis.expire(redis_key, 60)

            # Check if limit exceeded
            is_allowed = current_count <= limit

            return is_allowed, current_count

        except (RedisError, RedisConnectionError) as e:
            logger.warning(f"[Rate Limiter] Redis error: {str(e)}. Falling back to in-memory.")
            self._redis_available = False
            raise

    def _check_rate_limit_memory(
        self,
        client_id: str,
        limit: int
    ) -> tuple[bool, int]:
        """
        Check rate limit using in-memory storage (fallback).

        Args:
            client_id: Unique client identifier
            limit: Request limit for this client

        Returns:
            Tuple of (is_allowed, current_count)
        """
        # Current time and window start (1 minute ago)
        now = datetime.utcnow()
        window_start = now - timedelta(minutes=1)

        # Clean old requests
        if client_id in self.requests:
            self.requests[client_id] = [
                req_time for req_time in self.requests[client_id]
                if req_time > window_start
            ]
        else:
            self.requests[client_id] = []

        # Count requests in current window
        request_count = len(self.requests[client_id])

        # Check if limit exceeded
        is_allowed = request_count < limit

        # Add current request if allowed
        if is_allowed:
            self.requests[client_id].append(now)

        return is_allowed, request_count + 1 if is_allowed else request_count

    async def check_rate_limit(self, request: Request) -> Tuple[int, int, int]:
        """
        Check if request is within rate limit

        Returns:
            Tuple of (limit, remaining, current_count) for headers

        Raises:
            HTTPException: 429 if rate limit exceeded
        """
        client_id = self._get_client_id(request)
        user_role = self._get_user_role(request)

        # Get rate limit for user role
        limit = self.limits.get(user_role, self.limits[UserRole.GUEST])

        # Try Redis first, fall back to in-memory
        redis_connected = await self._ensure_redis_connection()

        if redis_connected:
            try:
                is_allowed, current_count = await self._check_rate_limit_redis(
                    client_id,
                    limit
                )
            except (RedisError, RedisConnectionError):
                # Fallback to in-memory
                is_allowed, current_count = self._check_rate_limit_memory(
                    client_id,
                    limit
                )
        else:
            # Use in-memory storage
            is_allowed, current_count = self._check_rate_limit_memory(
                client_id,
                limit
            )

        # Calculate remaining requests
        remaining = max(0, limit - current_count)

        # Check if limit exceeded
        if not is_allowed:
            # Calculate actual seconds remaining in the current window
            seconds_into_window = int(time.time()) % 60
            retry_after = max(1, 60 - seconds_into_window)

            logger.warning(
                f"Rate limit exceeded for {client_id} "
                f"(role: {user_role.value}, limit: {limit}/min, current: {current_count})"
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Please retry in {retry_after} seconds.",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(retry_after)
                }
            )

        # Log if approaching limit (80% threshold)
        if current_count >= (limit * 0.8):
            logger.info(
                f"Rate limit warning for {client_id}: "
                f"{current_count}/{limit} requests"
            )

        return limit, remaining, current_count


# Global rate limiter instance
rate_limiter = RateLimiter()


async def rate_limit_dependency(request: Request) -> Tuple[int, int, int]:
    """
    FastAPI dependency for rate limiting

    Usage:
        @router.get("/endpoint", dependencies=[Depends(rate_limit_dependency)])
        async def my_endpoint():
            ...

    Returns:
        Tuple of (limit, remaining, current_count)
    """
    return await rate_limiter.check_rate_limit(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add rate limit headers to all responses.

    Headers added:
    - X-RateLimit-Limit: Maximum requests per minute for user's role
    - X-RateLimit-Remaining: Remaining requests in current window
    - X-RateLimit-Reset: Seconds until the rate limit resets

    Rate limits by role (per minute):
    - Guest: 10
    - User: 100
    - Moderator: 200
    - Admin: 500
    - Super Admin: 1000
    """

    def _extract_user_from_token(self, request: Request) -> Optional[object]:
        """
        Extract user info from JWT token in Authorization header.

        Returns a simple object with userId and role attributes, or None if no valid token.
        """
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None

        try:
            from jose import jwt, JWTError

            token = auth_header[7:]  # Remove "Bearer " prefix
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=["HS256"]
            )

            user_id = payload.get("userId")
            role = payload.get("role")

            if not user_id or not role:
                return None

            # Create a simple user object
            class SimpleUser:
                def __init__(self, user_id: str, role_str: str):
                    self.userId = user_id
                    try:
                        self.role = UserRole(role_str)
                    except ValueError:
                        self.role = UserRole.GUEST

            return SimpleUser(user_id, role)

        except (JWTError, Exception) as e:
            logger.debug(f"Failed to extract user from token: {e}")
            return None

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for CORS preflight requests
        if request.method == "OPTIONS":
            return await call_next(request)

        # Skip rate limiting for health check and documentation endpoints
        skip_paths = ["/api/health", "/api/ready", "/", "/api/docs", "/api/redoc", "/api/openapi.json"]
        if request.url.path in skip_paths:
            return await call_next(request)

        try:
            # Extract user from JWT token and set in request state
            user = self._extract_user_from_token(request)
            if user:
                request.state.user = user

            # Check rate limit and get info for headers
            limit, remaining, current_count = await rate_limiter.check_rate_limit(request)

            # Process the request
            response = await call_next(request)

            # Add rate limit headers to response
            seconds_into_window = int(time.time()) % 60
            reset_seconds = max(1, 60 - seconds_into_window)
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(reset_seconds)

            return response

        except HTTPException as exc:
            # Rate limit exceeded - return 429 response with headers
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=exc.headers or {}
            )


class LoginRateLimiter:
    """
    Specialized rate limiter for login attempts

    Prevents brute force attacks:
    - Max 5 failed attempts per email
    - 15 minute lockout after limit reached

    Uses Redis list to store failed attempt timestamps with TTL.
    Falls back to in-memory dict if Redis is unavailable.
    """

    def __init__(self):
        # Redis connection (lazily initialized)
        self.redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        self._redis: Optional[Redis] = None
        self._pool: Optional[ConnectionPool] = None
        self._redis_available = False
        self._fallback_warning_logged = False

        # In-memory fallback storage
        self.failed_attempts: Dict[str, list] = {}

        self.max_attempts = 5
        self.lockout_duration = timedelta(minutes=15)
        self.lockout_seconds = int(self.lockout_duration.total_seconds())

    async def _ensure_redis_connection(self) -> bool:
        """
        Lazily initialize Redis connection with connection pooling.

        Returns:
            True if Redis is available, False otherwise
        """
        if self._redis is not None:
            return self._redis_available

        try:
            # Create connection pool
            self._pool = ConnectionPool.from_url(
                self.redis_url,
                max_connections=10,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5
            )

            self._redis = Redis(connection_pool=self._pool)

            # Test connection
            await self._redis.ping()
            self._redis_available = True

            logger.info(f"[Login Rate Limiter] Connected to Redis at {self.redis_url}")
            return True

        except (RedisError, RedisConnectionError) as e:
            self._redis_available = False
            if not self._fallback_warning_logged:
                logger.warning(
                    f"[Login Rate Limiter] Redis connection failed: {str(e)}. "
                    "Falling back to in-memory login rate limiting."
                )
                self._fallback_warning_logged = True
            return False

    async def _get_attempts_redis(self, email: str) -> list:
        """
        Get failed login attempts from Redis.

        Key pattern: login_attempts:{email}
        Value: List of timestamp strings

        Args:
            email: User email address

        Returns:
            List of attempt timestamps (as floats)
        """
        try:
            redis_key = f"login_attempts:{email}"

            # Get all attempts (LRANGE 0 -1 gets entire list)
            attempts_str = await self._redis.lrange(redis_key, 0, -1)

            if not attempts_str:
                return []

            # Convert string timestamps to floats
            attempts = [float(ts) for ts in attempts_str]

            # Filter out attempts older than lockout window
            now = time.time()
            cutoff = now - self.lockout_seconds
            recent_attempts = [ts for ts in attempts if ts > cutoff]

            # If we filtered out old attempts, clean up Redis
            if len(recent_attempts) < len(attempts):
                await self._redis.delete(redis_key)
                if recent_attempts:
                    # Re-add only recent attempts
                    await self._redis.rpush(redis_key, *[str(ts) for ts in recent_attempts])
                    await self._redis.expire(redis_key, self.lockout_seconds)

            return recent_attempts

        except (RedisError, RedisConnectionError, ValueError) as e:
            logger.warning(f"[Login Rate Limiter] Redis get error for {email}: {str(e)}")
            self._redis_available = False
            raise

    async def _record_attempt_redis(self, email: str) -> None:
        """
        Record a failed login attempt in Redis.

        Args:
            email: User email address
        """
        try:
            redis_key = f"login_attempts:{email}"
            current_time = time.time()

            # Add attempt to list (LPUSH adds to head)
            await self._redis.lpush(redis_key, str(current_time))

            # Trim list to max_attempts (keep most recent)
            await self._redis.ltrim(redis_key, 0, self.max_attempts - 1)

            # Set TTL (15 minutes)
            await self._redis.expire(redis_key, self.lockout_seconds)

        except (RedisError, RedisConnectionError) as e:
            logger.warning(f"[Login Rate Limiter] Redis record error for {email}: {str(e)}")
            self._redis_available = False
            raise

    async def _clear_attempts_redis(self, email: str) -> None:
        """
        Clear failed login attempts in Redis.

        Args:
            email: User email address
        """
        try:
            redis_key = f"login_attempts:{email}"
            await self._redis.delete(redis_key)

        except (RedisError, RedisConnectionError) as e:
            logger.warning(f"[Login Rate Limiter] Redis clear error for {email}: {str(e)}")
            self._redis_available = False
            raise

    def _get_attempts_memory(self, email: str) -> list:
        """
        Get failed login attempts from in-memory storage (fallback).

        Args:
            email: User email address

        Returns:
            List of recent attempt timestamps
        """
        now = datetime.utcnow()
        window_start = now - self.lockout_duration

        # Clean old attempts
        if email in self.failed_attempts:
            self.failed_attempts[email] = [
                attempt_time for attempt_time in self.failed_attempts[email]
                if attempt_time > window_start
            ]
        else:
            self.failed_attempts[email] = []

        return self.failed_attempts[email]

    def _record_attempt_memory(self, email: str) -> None:
        """
        Record a failed login attempt in memory (fallback).

        Args:
            email: User email address
        """
        if email not in self.failed_attempts:
            self.failed_attempts[email] = []

        self.failed_attempts[email].append(datetime.utcnow())

    def _clear_attempts_memory(self, email: str) -> None:
        """
        Clear failed login attempts in memory (fallback).

        Args:
            email: User email address
        """
        if email in self.failed_attempts:
            del self.failed_attempts[email]

    async def check_login_attempts(self, email: str) -> None:
        """
        Check if email is locked out due to failed attempts

        Raises:
            HTTPException: 429 if account is locked
        """
        redis_connected = await self._ensure_redis_connection()

        # Get attempts from Redis or memory
        if redis_connected:
            try:
                attempts = await self._get_attempts_redis(email)
            except (RedisError, RedisConnectionError):
                # Fallback to memory
                attempts = self._get_attempts_memory(email)
        else:
            attempts = self._get_attempts_memory(email)

        attempt_count = len(attempts)

        # Check if locked out
        if attempt_count >= self.max_attempts:
            # Calculate remaining lockout time
            if redis_connected:
                # Attempts are timestamps (floats)
                oldest_attempt = min(attempts)
                unlock_time = oldest_attempt + self.lockout_seconds
                remaining = int((unlock_time - time.time()) / 60)
            else:
                # Attempts are datetime objects
                oldest_attempt = min(attempts)
                unlock_time = oldest_attempt + self.lockout_duration
                remaining = int((unlock_time - datetime.utcnow()).total_seconds() / 60)

            # Ensure remaining is at least 1 minute
            remaining = max(1, remaining)

            logger.warning(f"Login locked for email: {email} (attempts: {attempt_count})")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Try again in {remaining} minutes.",
                headers={"Retry-After": str(remaining * 60)}
            )

    async def record_failed_attempt(self, email: str) -> None:
        """Record a failed login attempt"""
        redis_connected = await self._ensure_redis_connection()

        if redis_connected:
            try:
                await self._record_attempt_redis(email)
                logger.info(f"Failed login attempt recorded for: {email} (Redis)")
                return
            except (RedisError, RedisConnectionError):
                # Fallback to memory
                pass

        # Use memory storage
        self._record_attempt_memory(email)
        logger.info(f"Failed login attempt recorded for: {email} (in-memory)")

    async def clear_attempts(self, email: str) -> None:
        """Clear failed attempts after successful login"""
        redis_connected = await self._ensure_redis_connection()

        if redis_connected:
            try:
                await self._clear_attempts_redis(email)
                logger.info(f"Login attempts cleared for: {email} (Redis)")
                return
            except (RedisError, RedisConnectionError):
                # Fallback to memory
                pass

        # Use memory storage
        self._clear_attempts_memory(email)
        logger.info(f"Login attempts cleared for: {email} (in-memory)")


# Global login rate limiter instance
login_rate_limiter = LoginRateLimiter()


class MFARateLimiter:
    """
    Specialized rate limiter for MFA verification attempts

    Prevents brute force attacks on 6-digit TOTP codes:
    - Max 5 failed attempts per 15 minutes (same as login)
    - Temporary lockout after limit reached
    - Uses Redis with in-memory fallback

    Feature #319: MFA rate limiting
    """

    def __init__(self):
        # Redis connection (lazily initialized)
        self.redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        self._redis: Optional[Redis] = None
        self._pool: Optional[ConnectionPool] = None
        self._redis_available = False
        self._fallback_warning_logged = False

        # In-memory fallback storage
        self.failed_attempts: Dict[str, list] = {}

        self.max_attempts = 5
        self.lockout_duration = timedelta(minutes=15)
        self.lockout_seconds = int(self.lockout_duration.total_seconds())

    async def _ensure_redis_connection(self) -> bool:
        """
        Lazily initialize Redis connection with connection pooling.

        Returns:
            True if Redis is available, False otherwise
        """
        if self._redis is not None:
            return self._redis_available

        try:
            # Create connection pool
            self._pool = ConnectionPool.from_url(
                self.redis_url,
                max_connections=10,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5
            )

            self._redis = Redis(connection_pool=self._pool)

            # Test connection
            await self._redis.ping()
            self._redis_available = True

            logger.info(f"[MFA Rate Limiter] Connected to Redis at {self.redis_url}")
            return True

        except (RedisError, RedisConnectionError) as e:
            self._redis_available = False
            if not self._fallback_warning_logged:
                logger.warning(
                    f"[MFA Rate Limiter] Redis connection failed: {str(e)}. "
                    "Falling back to in-memory MFA rate limiting."
                )
                self._fallback_warning_logged = True
            return False

    async def _get_attempts_redis(self, user_id: str) -> list:
        """
        Get failed MFA attempts from Redis.

        Key pattern: mfa_attempts:{user_id}
        Value: List of timestamp strings

        Args:
            user_id: User UUID

        Returns:
            List of attempt timestamps (as floats)
        """
        try:
            redis_key = f"mfa_attempts:{user_id}"

            # Get all attempts (LRANGE 0 -1 gets entire list)
            attempts_str = await self._redis.lrange(redis_key, 0, -1)

            if not attempts_str:
                return []

            # Convert string timestamps to floats
            attempts = [float(ts) for ts in attempts_str]

            # Filter out attempts older than lockout window
            now = time.time()
            cutoff = now - self.lockout_seconds
            recent_attempts = [ts for ts in attempts if ts > cutoff]

            # If we filtered out old attempts, clean up Redis
            if len(recent_attempts) < len(attempts):
                await self._redis.delete(redis_key)
                if recent_attempts:
                    # Re-add only recent attempts
                    await self._redis.rpush(redis_key, *[str(ts) for ts in recent_attempts])
                    await self._redis.expire(redis_key, self.lockout_seconds)

            return recent_attempts

        except (RedisError, RedisConnectionError, ValueError) as e:
            logger.warning(f"[MFA Rate Limiter] Redis get error for {user_id}: {str(e)}")
            self._redis_available = False
            raise

    async def _record_attempt_redis(self, user_id: str) -> int:
        """
        Record a failed MFA attempt in Redis.

        Args:
            user_id: User UUID

        Returns:
            Current attempt count
        """
        try:
            redis_key = f"mfa_attempts:{user_id}"
            current_time = time.time()

            # Add attempt to list (LPUSH adds to head)
            await self._redis.lpush(redis_key, str(current_time))

            # Trim list to max_attempts (keep most recent)
            await self._redis.ltrim(redis_key, 0, self.max_attempts - 1)

            # Set TTL (15 minutes)
            await self._redis.expire(redis_key, self.lockout_seconds)

            # Get current count
            count = await self._redis.llen(redis_key)
            return count

        except (RedisError, RedisConnectionError) as e:
            logger.warning(f"[MFA Rate Limiter] Redis record error for {user_id}: {str(e)}")
            self._redis_available = False
            raise

    async def _clear_attempts_redis(self, user_id: str) -> None:
        """
        Clear failed MFA attempts in Redis.

        Args:
            user_id: User UUID
        """
        try:
            redis_key = f"mfa_attempts:{user_id}"
            await self._redis.delete(redis_key)

        except (RedisError, RedisConnectionError) as e:
            logger.warning(f"[MFA Rate Limiter] Redis clear error for {user_id}: {str(e)}")
            self._redis_available = False
            raise

    def _get_attempts_memory(self, user_id: str) -> list:
        """
        Get failed MFA attempts from in-memory storage (fallback).

        Args:
            user_id: User UUID

        Returns:
            List of recent attempt timestamps
        """
        now = datetime.utcnow()
        window_start = now - self.lockout_duration

        # Clean old attempts
        if user_id in self.failed_attempts:
            self.failed_attempts[user_id] = [
                attempt_time for attempt_time in self.failed_attempts[user_id]
                if attempt_time > window_start
            ]
        else:
            self.failed_attempts[user_id] = []

        return self.failed_attempts[user_id]

    def _record_attempt_memory(self, user_id: str) -> int:
        """
        Record a failed MFA attempt in memory (fallback).

        Args:
            user_id: User UUID

        Returns:
            Current attempt count
        """
        if user_id not in self.failed_attempts:
            self.failed_attempts[user_id] = []

        self.failed_attempts[user_id].append(datetime.utcnow())
        return len(self.failed_attempts[user_id])

    def _clear_attempts_memory(self, user_id: str) -> None:
        """
        Clear failed MFA attempts in memory (fallback).

        Args:
            user_id: User UUID
        """
        if user_id in self.failed_attempts:
            del self.failed_attempts[user_id]

    async def check_mfa_attempts(self, user_id: str) -> None:
        """
        Check if user is locked out due to failed MFA attempts

        Args:
            user_id: User UUID

        Raises:
            HTTPException: 429 if account is temporarily locked
        """
        redis_connected = await self._ensure_redis_connection()

        # Get attempts from Redis or memory
        if redis_connected:
            try:
                attempts = await self._get_attempts_redis(user_id)
            except (RedisError, RedisConnectionError):
                # Fallback to memory
                attempts = self._get_attempts_memory(user_id)
        else:
            attempts = self._get_attempts_memory(user_id)

        attempt_count = len(attempts)

        # Check if locked out
        if attempt_count >= self.max_attempts:
            # Calculate remaining lockout time
            if redis_connected:
                # Attempts are timestamps (floats)
                oldest_attempt = min(attempts)
                unlock_time = oldest_attempt + self.lockout_seconds
                remaining = int((unlock_time - time.time()) / 60)
            else:
                # Attempts are datetime objects
                oldest_attempt = min(attempts)
                unlock_time = oldest_attempt + self.lockout_duration
                remaining = int((unlock_time - datetime.utcnow()).total_seconds() / 60)

            # Ensure remaining is at least 1 minute
            remaining = max(1, remaining)

            logger.warning(
                f"[MFA Rate Limiter] SECURITY: User {user_id} locked out "
                f"after {attempt_count} failed MFA attempts. "
                f"Lockout expires in {remaining} minutes."
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed MFA verification attempts. Try again in {remaining} minutes.",
                headers={
                    "Retry-After": str(remaining * 60),
                    "X-MFA-Lockout": "true"
                }
            )

    async def record_failed_attempt(self, user_id: str) -> int:
        """
        Record a failed MFA attempt

        Args:
            user_id: User UUID

        Returns:
            Current attempt count (for remaining attempts message)
        """
        redis_connected = await self._ensure_redis_connection()

        if redis_connected:
            try:
                count = await self._record_attempt_redis(user_id)
                logger.warning(
                    f"[MFA Rate Limiter] Failed MFA attempt for user {user_id}. "
                    f"Attempt {count}/{self.max_attempts} (Redis)"
                )
                return count
            except (RedisError, RedisConnectionError):
                # Fallback to memory
                pass

        # Use memory storage
        count = self._record_attempt_memory(user_id)
        logger.warning(
            f"[MFA Rate Limiter] Failed MFA attempt for user {user_id}. "
            f"Attempt {count}/{self.max_attempts} (in-memory)"
        )
        return count

    async def clear_attempts(self, user_id: str) -> None:
        """Clear failed attempts after successful MFA verification"""
        redis_connected = await self._ensure_redis_connection()

        if redis_connected:
            try:
                await self._clear_attempts_redis(user_id)
                logger.info(f"[MFA Rate Limiter] MFA attempts cleared for user: {user_id} (Redis)")
                return
            except (RedisError, RedisConnectionError):
                # Fallback to memory
                pass

        # Use memory storage
        self._clear_attempts_memory(user_id)
        logger.info(f"[MFA Rate Limiter] MFA attempts cleared for user: {user_id} (in-memory)")

    def get_remaining_attempts(self, attempt_count: int) -> int:
        """
        Get remaining attempts before lockout

        Args:
            attempt_count: Current number of failed attempts

        Returns:
            Number of remaining attempts
        """
        return max(0, self.max_attempts - attempt_count)


# Global MFA rate limiter instance
mfa_rate_limiter = MFARateLimiter()
