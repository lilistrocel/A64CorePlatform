"""
Authentication API Endpoints

Handles user registration, login, logout, and token refresh
Following User-Structure.md and API-Structure.md specifications
"""

from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import Dict, Any

from ...models.user import (
    UserCreate,
    UserLogin,
    UserUpdate,
    TokenResponse,
    UserResponse,
    EmailVerificationRequest,
    VerifyEmailRequest,
    PasswordResetRequest,
    PasswordResetConfirm
)
from ...services.auth_service import auth_service
from ...services.user_service import user_service
from ...middleware.auth import get_current_user
from ...middleware.rate_limit import login_rate_limiter

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate) -> TokenResponse:
    """
    Register a new user and return JWT tokens (auto-login)

    **Authentication:** None required

    **Request Body:**
    - email: Valid email address (unique)
    - password: 8-128 characters, must include uppercase, lowercase, number, special char
    - firstName: User's first name
    - lastName: User's last name
    - phone: Optional phone number
    - avatar: Optional avatar URL
    - timezone: Optional timezone (IANA format)
    - locale: Optional language code (ISO 639-1)

    **Returns:**
    - 201: User created successfully with JWT tokens (verification email sent automatically)
    - 409: Email already registered
    - 422: Validation error (password requirements not met)

    **Example:**
    ```json
    {
      "email": "user@example.com",
      "password": "SecurePass123!",
      "firstName": "John",
      "lastName": "Doe"
    }
    ```
    """
    token_response = await auth_service.register_user_with_tokens(user_data)

    # Automatically send verification email after registration
    try:
        await auth_service.send_verification_email(token_response.user.userId)
    except Exception as e:
        # Log error but don't fail registration if email fails
        # Reason: User is registered, email can be resent later
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send verification email to {token_response.user.email}: {e}")

    return token_response


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin) -> TokenResponse:
    """
    Authenticate user and return JWT tokens

    **Authentication:** None required

    **Request Body:**
    - email: User's email address
    - password: User's password

    **Returns:**
    - 200: Login successful, returns access token, refresh token, and user info
    - 401: Invalid credentials
    - 403: Account is inactive
    - 429: Too many failed login attempts (5 max, 15 minute lockout)

    **Response includes:**
    - accessToken: JWT token (1 hour expiry)
    - refreshToken: JWT refresh token (7 days expiry)
    - tokenType: "bearer"
    - expiresIn: Token expiry in seconds (3600)
    - user: User information

    **Example:**
    ```json
    {
      "email": "user@example.com",
      "password": "SecurePass123!"
    }
    ```
    """
    # Check for too many failed login attempts
    await login_rate_limiter.check_login_attempts(credentials.email)

    try:
        token_response = await auth_service.login_user(credentials)

        # Clear failed attempts on successful login
        await login_rate_limiter.clear_attempts(credentials.email)

        return token_response
    except HTTPException as e:
        # Record failed attempt if credentials were invalid
        if e.status_code == status.HTTP_401_UNAUTHORIZED:
            await login_rate_limiter.record_failed_attempt(credentials.email)
        raise


@router.post("/logout")
async def logout(
    current_user: UserResponse = Depends(get_current_user),
    refresh_token: str = Body(None, embed=True)
) -> Dict[str, str]:
    """
    Logout user by revoking refresh token(s)

    **Authentication:** Required (Bearer token)

    **Request Body (optional):**
    - refreshToken: Specific refresh token to revoke (revokes all if not provided)

    **Returns:**
    - 200: Logout successful
    - 401: Not authenticated

    **Example:**
    ```json
    {
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    }
    ```
    """
    await auth_service.logout_user(current_user.userId, refresh_token)

    return {"message": "Logged out successfully"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(refresh_token: str = Body(..., embed=True)) -> TokenResponse:
    """
    Refresh access token using refresh token

    **Authentication:** None required (uses refresh token)

    **Request Body:**
    - refreshToken: Valid refresh token

    **Returns:**
    - 200: New tokens issued
    - 401: Invalid or expired refresh token

    **Note:** Implements rotating refresh tokens - old token is revoked, new token issued

    **Example:**
    ```json
    {
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    }
    ```
    """
    token_response = await auth_service.refresh_access_token(refresh_token)
    return token_response


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """
    Get current authenticated user's information

    **Authentication:** Required (Bearer token)

    **Returns:**
    - 200: User information
    - 401: Not authenticated

    **Response:** Complete user profile (excluding password)
    """
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_current_user_profile(
    update_data: UserUpdate,
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """
    Update current authenticated user's profile

    **Authentication:** Required (Bearer token)

    **Request Body (all fields optional):**
    - firstName: Updated first name
    - lastName: Updated last name
    - phone: Updated phone number
    - avatar: Updated avatar URL
    - timezone: Updated timezone
    - locale: Updated locale

    **Returns:**
    - 200: Updated user information
    - 401: Not authenticated
    - 404: User not found

    **Example:**
    ```json
    {
      "firstName": "Jane",
      "lastName": "Smith"
    }
    ```
    """
    updated_user = await user_service.update_user(current_user.userId, update_data)
    return updated_user


@router.post("/send-verification-email")
async def send_verification_email(
    current_user: UserResponse = Depends(get_current_user)
) -> Dict[str, str]:
    """
    Send or resend email verification link

    **Authentication:** Required (Bearer token)

    **Returns:**
    - 200: Verification email sent
    - 400: Email already verified
    - 401: Not authenticated
    - 404: User not found

    **Example:**
    ```
    POST /api/v1/auth/send-verification-email
    Headers: Authorization: Bearer {token}
    ```
    """
    await auth_service.send_verification_email(current_user.userId)
    return {"message": "Verification email sent successfully"}


@router.post("/verify-email", response_model=UserResponse)
async def verify_email(request: VerifyEmailRequest) -> UserResponse:
    """
    Verify user email with verification token

    **Authentication:** None required (uses token)

    **Request Body:**
    - token: Email verification token

    **Returns:**
    - 200: Email verified successfully
    - 400: Token already used
    - 401: Invalid or expired token

    **Example:**
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIs..."
    }
    ```
    """
    user = await auth_service.verify_email(request.token)
    return user


@router.post("/request-password-reset")
async def request_password_reset(request: PasswordResetRequest) -> Dict[str, str]:
    """
    Request password reset link

    **Authentication:** None required

    **Request Body:**
    - email: User's email address

    **Returns:**
    - 200: Always returns success (security - don't reveal if email exists)

    **Note:** Always returns success to prevent email enumeration

    **Example:**
    ```json
    {
      "email": "user@example.com"
    }
    ```
    """
    await auth_service.request_password_reset(request.email)
    return {"message": "If your email is registered, you will receive a password reset link"}


@router.post("/reset-password")
async def reset_password(request: PasswordResetConfirm) -> Dict[str, str]:
    """
    Reset password with reset token

    **Authentication:** None required (uses token)

    **Request Body:**
    - token: Password reset token
    - newPassword: New password (8-128 chars, must meet complexity requirements)

    **Returns:**
    - 200: Password reset successfully
    - 400: Token already used
    - 401: Invalid or expired token
    - 422: Password validation error

    **Example:**
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIs...",
      "newPassword": "NewSecurePass123!"
    }
    ```
    """
    await auth_service.reset_password(request.token, request.newPassword)
    return {"message": "Password reset successfully"}
