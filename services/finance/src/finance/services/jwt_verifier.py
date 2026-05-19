"""
JWT Verifier Service

Validates Bearer tokens issued by the main A64 app.
Uses the same SECRET_KEY environment variable so no MongoDB round-trip is needed.

Token payload structure (from main app src/utils/security.py):
  {userId, email, role, type="access", exp}
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from ..config import settings

# Reuse HTTPBearer for Authorization header extraction
_bearer = HTTPBearer()


class TokenPayload(BaseModel):
    """Decoded JWT payload from the main A64 app access token."""

    userId: str
    email: str
    role: str


def _decode_token(token: str) -> Optional[TokenPayload]:
    """
    Decode and validate a JWT access token.

    Args:
        token: Raw JWT string.

    Returns:
        TokenPayload if valid, None otherwise.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "access":
            return None
        return TokenPayload(
            userId=payload["userId"],
            email=payload["email"],
            role=payload["role"],
        )
    except (JWTError, KeyError, ValueError):
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> TokenPayload:
    """
    FastAPI dependency: decode Bearer token, return payload.

    Args:
        credentials: Injected HTTP Bearer credentials.

    Returns:
        TokenPayload with userId, email, role.

    Raises:
        HTTPException 401: If token is missing, expired, or malformed.
    """
    payload = _decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def require_roles(*allowed_roles: str):
    """
    Dependency factory that enforces role membership.

    Args:
        *allowed_roles: One or more role strings that are permitted.

    Returns:
        A FastAPI dependency function.

    Usage:
        @router.post("/", dependencies=[Depends(require_roles("finance_admin"))])
    """

    async def _check(
        current_user: TokenPayload = Depends(get_current_user),
    ) -> TokenPayload:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this operation",
            )
        return current_user

    return _check
