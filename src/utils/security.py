"""
Security Utilities

Password hashing and JWT token management
Following User-Structure.md security requirements
"""

from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import uuid

from ..config.settings import settings
from ..models.user import TokenPayload, UserRole

# Password hashing context
# Reason: Using bcrypt with cost factor 12 per User-Structure.md
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt

    Args:
        password: Plain text password

    Returns:
        Hashed password string

    Security: Uses bcrypt with cost factor 12 (User-Structure.md)
    """
    # Truncate password to 72 bytes for bcrypt compatibility
    # Reason: bcrypt has a 72-byte limit
    if len(password.encode('utf-8')) > 72:
        password = password[:72]
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash

    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password from database

    Returns:
        True if password matches, False otherwise
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    user_id: str,
    email: str,
    role: UserRole,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create JWT access token

    Args:
        user_id: User's UUID
        email: User's email
        role: User's role
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token

    Token Configuration (User-Structure.md):
    - Algorithm: HS256
    - Default Expiry: 1 hour
    - Payload: {userId, email, role, exp}
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Default: 1 hour expiry per User-Structure.md
        expire = datetime.utcnow() + timedelta(hours=1)

    to_encode = {
        "userId": user_id,
        "email": email,
        "role": role.value if isinstance(role, UserRole) else role,
        "exp": expire,
        "type": "access"
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm="HS256"
    )

    return encoded_jwt


def create_refresh_token(
    user_id: str,
    token_id: Optional[str] = None,
    expires_delta: Optional[timedelta] = None
) -> tuple[str, str]:
    """
    Create JWT refresh token

    Args:
        user_id: User's UUID
        token_id: Optional token ID (generated if not provided)
        expires_delta: Optional custom expiration time

    Returns:
        Tuple of (token, token_id)

    Token Configuration (User-Structure.md):
    - Algorithm: HS256
    - Default Expiry: 7 days
    - Payload: {userId, tokenId, exp}
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Default: 7 days expiry per User-Structure.md
        expire = datetime.utcnow() + timedelta(days=7)

    if not token_id:
        token_id = str(uuid.uuid4())

    to_encode = {
        "userId": user_id,
        "tokenId": token_id,
        "exp": expire,
        "type": "refresh"
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm="HS256"
    )

    return encoded_jwt, token_id


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decode and validate JWT token

    Args:
        token: JWT token string

    Returns:
        Token payload if valid, None otherwise

    Raises:
        JWTError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=["HS256"]
        )
        return payload
    except JWTError:
        return None


def verify_access_token(token: str) -> Optional[TokenPayload]:
    """
    Verify and decode access token

    Args:
        token: JWT access token

    Returns:
        TokenPayload if valid, None otherwise
    """
    try:
        payload = decode_token(token)

        if not payload or payload.get("type") != "access":
            return None

        token_data = TokenPayload(
            userId=payload.get("userId"),
            email=payload.get("email"),
            role=payload.get("role")
        )

        return token_data

    except Exception:
        return None


def verify_refresh_token(token: str) -> Optional[Dict[str, str]]:
    """
    Verify and decode refresh token

    Args:
        token: JWT refresh token

    Returns:
        Dict with userId and tokenId if valid, None otherwise
    """
    try:
        payload = decode_token(token)

        if not payload or payload.get("type") != "refresh":
            return None

        return {
            "userId": payload.get("userId"),
            "tokenId": payload.get("tokenId")
        }

    except Exception:
        return None


def generate_token_id() -> str:
    """
    Generate a unique token ID

    Returns:
        UUID string
    """
    return str(uuid.uuid4())


def create_verification_token(
    user_id: str,
    email: str,
    token_type: str,
    expires_delta: Optional[timedelta] = None
) -> tuple[str, str]:
    """
    Create verification token (for email verification or password reset)

    Args:
        user_id: User's UUID
        email: User's email
        token_type: 'email_verification' or 'password_reset'
        expires_delta: Optional custom expiration time

    Returns:
        Tuple of (token, token_id)

    Token Configuration:
    - Email verification: 24 hours expiry
    - Password reset: 1 hour expiry
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Default expiry based on token type
        if token_type == "email_verification":
            expire = datetime.utcnow() + timedelta(hours=24)
        elif token_type == "password_reset":
            expire = datetime.utcnow() + timedelta(hours=1)
        else:
            expire = datetime.utcnow() + timedelta(hours=1)

    token_id = str(uuid.uuid4())

    to_encode = {
        "userId": user_id,
        "email": email,
        "tokenId": token_id,
        "type": token_type,
        "exp": expire
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm="HS256"
    )

    return encoded_jwt, token_id


def verify_verification_token(token: str, expected_type: str) -> Optional[Dict[str, str]]:
    """
    Verify and decode verification token

    Args:
        token: JWT verification token
        expected_type: Expected token type ('email_verification' or 'password_reset')

    Returns:
        Dict with userId, email, and tokenId if valid, None otherwise
    """
    try:
        payload = decode_token(token)

        if not payload or payload.get("type") != expected_type:
            return None

        return {
            "userId": payload.get("userId"),
            "email": payload.get("email"),
            "tokenId": payload.get("tokenId")
        }

    except Exception:
        return None


# ============= MFA Token Functions =============

def create_mfa_token(
    user_id: str,
    email: str,
    expires_delta: Optional[timedelta] = None
) -> tuple[str, str]:
    """
    Create a temporary MFA token for the second step of MFA login

    Args:
        user_id: User's UUID
        email: User's email
        expires_delta: Optional custom expiration time (default: 5 minutes)

    Returns:
        Tuple of (token, token_id)

    Token Configuration:
    - Algorithm: HS256
    - Default Expiry: 5 minutes (short-lived for security)
    - Type: 'mfa_pending'
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        # Default: 5 minutes expiry for MFA token
        expire = datetime.utcnow() + timedelta(minutes=5)

    token_id = str(uuid.uuid4())

    to_encode = {
        "userId": user_id,
        "email": email,
        "tokenId": token_id,
        "type": "mfa_pending",
        "exp": expire
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm="HS256"
    )

    return encoded_jwt, token_id


def verify_mfa_token(token: str) -> Optional[Dict[str, str]]:
    """
    Verify and decode MFA pending token

    Args:
        token: JWT MFA token

    Returns:
        Dict with userId, email, and tokenId if valid, None otherwise
    """
    try:
        payload = decode_token(token)

        if not payload or payload.get("type") != "mfa_pending":
            return None

        return {
            "userId": payload.get("userId"),
            "email": payload.get("email"),
            "tokenId": payload.get("tokenId")
        }

    except Exception:
        return None
