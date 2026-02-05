"""
Authentication Service Layer

Business logic for user authentication and authorization
Following User-Structure.md authentication flows
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import uuid
import logging

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from ..models.user import (
    UserCreate,
    UserLogin,
    UserResponse,
    UserRole,
    TokenResponse,
    RefreshTokenCreate
)
from ..utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    create_verification_token,
    verify_verification_token
)
from ..utils.email import (
    send_email_verification,
    send_password_reset,
    send_welcome_email
)
from .database import mongodb

logger = logging.getLogger(__name__)


class AuthService:
    """Authentication service for user registration, login, and token management"""

    @staticmethod
    async def register_user(user_data: UserCreate) -> UserResponse:
        """
        Register a new user

        Args:
            user_data: User registration data

        Returns:
            UserResponse object

        Raises:
            HTTPException: 409 if email already exists

        Flow (User-Structure.md):
        1. Validate input (done by Pydantic)
        2. Check email uniqueness
        3. Hash password with bcrypt
        4. Generate UUID
        5. Set default role to 'user'
        6. Create user in database
        7. Return user (without password)
        """
        db = mongodb.get_database()

        # Check if email already exists
        existing_user = await db.users.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )

        # Generate user ID
        user_id = str(uuid.uuid4())

        # Hash password (bcrypt with cost factor 12)
        password_hash = hash_password(user_data.password)

        # Create user document
        user_doc = {
            "userId": user_id,
            "email": user_data.email,
            "passwordHash": password_hash,
            "firstName": user_data.firstName,
            "lastName": user_data.lastName,
            "role": UserRole.USER.value,  # Default role per User-Structure.md
            "isActive": True,
            "isEmailVerified": False,  # Requires email verification
            "phone": user_data.phone,
            "avatar": user_data.avatar,
            "timezone": user_data.timezone,
            "locale": user_data.locale,
            "lastLoginAt": None,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
            "deletedAt": None,
            "metadata": {}
        }

        try:
            # Insert user into database
            await db.users.insert_one(user_doc)
            logger.info(f"User registered successfully: {user_data.email}")

            # Return user response (without password)
            return UserResponse(
                userId=user_id,
                email=user_data.email,
                firstName=user_data.firstName,
                lastName=user_data.lastName,
                role=UserRole.USER,
                isActive=True,
                isEmailVerified=False,
                phone=user_data.phone,
                avatar=user_data.avatar,
                timezone=user_data.timezone,
                locale=user_data.locale,
                lastLoginAt=None,
                createdAt=user_doc["createdAt"],
                updatedAt=user_doc["updatedAt"]
            )

        except DuplicateKeyError:
            # Race condition - email was registered between check and insert
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )
        except Exception as e:
            logger.error(f"Error registering user: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to register user"
            )

    @staticmethod
    async def register_user_with_tokens(user_data: UserCreate) -> TokenResponse:
        """
        Register a new user and return JWT tokens (auto-login after registration)

        Args:
            user_data: User registration data

        Returns:
            TokenResponse with access token, refresh token, and user info

        Raises:
            HTTPException: 409 if email already exists
        """
        # First register the user
        user = await AuthService.register_user(user_data)

        db = mongodb.get_database()

        # Generate tokens for auto-login
        access_token = create_access_token(
            user_id=user.userId,
            email=user.email,
            role=user.role
        )

        refresh_token, token_id = create_refresh_token(user_id=user.userId)

        # Store refresh token in database
        refresh_token_doc = {
            "tokenId": token_id,
            "userId": user.userId,
            "token": refresh_token,
            "expiresAt": datetime.utcnow() + timedelta(days=7),
            "isRevoked": False,
            "createdAt": datetime.utcnow(),
            "lastUsedAt": None
        }

        await db.refresh_tokens.insert_one(refresh_token_doc)

        logger.info(f"Auto-login tokens generated for newly registered user: {user.email}")

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=3600,
            user=user
        )

    @staticmethod
    async def login_user(credentials: UserLogin) -> TokenResponse:
        """
        Authenticate user and return tokens

        Args:
            credentials: User login credentials (email, password)

        Returns:
            TokenResponse with access token, refresh token, and user info

        Raises:
            HTTPException: 401 if credentials invalid

        Flow (User-Structure.md):
        1. Find user by email
        2. Check user isActive = true
        3. Verify password with bcrypt
        4. Generate access token (1 hour)
        5. Generate refresh token (7 days)
        6. Store refresh token in database
        7. Update lastLoginAt timestamp
        8. Return tokens and user info
        """
        db = mongodb.get_database()

        # Find user by email
        user_doc = await db.users.find_one({"email": credentials.email})

        if not user_doc:
            # Don't reveal if email exists or not (security)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )

        # Check if user is active
        if not user_doc.get("isActive", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive"
            )

        # Verify password
        if not verify_password(credentials.password, user_doc["passwordHash"]):
            logger.warning(f"Failed login attempt for: {credentials.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )

        # Generate tokens
        user_id = user_doc["userId"]
        email = user_doc["email"]
        role = UserRole(user_doc["role"])

        # Create access token (1 hour expiry)
        access_token = create_access_token(
            user_id=user_id,
            email=email,
            role=role
        )

        # Create refresh token (7 days expiry)
        refresh_token, token_id = create_refresh_token(user_id=user_id)

        # Store refresh token in database
        refresh_token_doc = {
            "tokenId": token_id,
            "userId": user_id,
            "token": refresh_token,
            "expiresAt": datetime.utcnow() + timedelta(days=7),
            "isRevoked": False,
            "createdAt": datetime.utcnow(),
            "lastUsedAt": None
        }

        await db.refresh_tokens.insert_one(refresh_token_doc)

        # Update user's lastLoginAt
        await db.users.update_one(
            {"userId": user_id},
            {"$set": {"lastLoginAt": datetime.utcnow()}}
        )

        logger.info(f"User logged in successfully: {email}")

        # Return token response
        user_response = UserResponse(
            userId=user_id,
            email=email,
            firstName=user_doc["firstName"],
            lastName=user_doc["lastName"],
            role=role,
            isActive=user_doc["isActive"],
            isEmailVerified=user_doc["isEmailVerified"],
            phone=user_doc.get("phone"),
            avatar=user_doc.get("avatar"),
            timezone=user_doc.get("timezone"),
            locale=user_doc.get("locale"),
            lastLoginAt=datetime.utcnow(),
            createdAt=user_doc["createdAt"],
            updatedAt=user_doc["updatedAt"]
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=3600,  # 1 hour in seconds
            user=user_response
        )

    @staticmethod
    async def refresh_access_token(refresh_token: str) -> TokenResponse:
        """
        Refresh access token using refresh token

        Args:
            refresh_token: Valid refresh token

        Returns:
            New TokenResponse with new tokens

        Raises:
            HTTPException: 401 if refresh token invalid or revoked

        Flow:
        1. Validate refresh token
        2. Check token exists in database and not revoked
        3. Fetch user from database
        4. Generate new access token
        5. Generate new refresh token (rotating tokens)
        6. Revoke old refresh token
        7. Store new refresh token
        8. Return new tokens
        """
        db = mongodb.get_database()

        # Verify refresh token
        token_payload = verify_refresh_token(refresh_token)

        if not token_payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )

        user_id = token_payload["userId"]
        token_id = token_payload["tokenId"]

        # Check token in database
        token_doc = await db.refresh_tokens.find_one({"tokenId": token_id})

        if not token_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token not found"
            )

        # Check if token is revoked
        if token_doc.get("isRevoked", False):
            logger.warning(f"Attempted use of revoked token: {token_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked"
            )

        # Check if token is expired
        if token_doc["expiresAt"] < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has expired"
            )

        # Fetch user
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc or not user_doc.get("isActive", False):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )

        # Generate new tokens
        role = UserRole(user_doc["role"])

        new_access_token = create_access_token(
            user_id=user_id,
            email=user_doc["email"],
            role=role
        )

        new_refresh_token, new_token_id = create_refresh_token(user_id=user_id)

        # Revoke old refresh token (one-time use)
        await db.refresh_tokens.update_one(
            {"tokenId": token_id},
            {"$set": {"isRevoked": True}}
        )

        # Store new refresh token
        new_refresh_token_doc = {
            "tokenId": new_token_id,
            "userId": user_id,
            "token": new_refresh_token,
            "expiresAt": datetime.utcnow() + timedelta(days=7),
            "isRevoked": False,
            "createdAt": datetime.utcnow(),
            "lastUsedAt": None
        }

        await db.refresh_tokens.insert_one(new_refresh_token_doc)

        logger.info(f"Access token refreshed for user: {user_doc['email']}")

        # Return new tokens
        user_response = UserResponse(
            userId=user_id,
            email=user_doc["email"],
            firstName=user_doc["firstName"],
            lastName=user_doc["lastName"],
            role=role,
            isActive=user_doc["isActive"],
            isEmailVerified=user_doc["isEmailVerified"],
            phone=user_doc.get("phone"),
            avatar=user_doc.get("avatar"),
            timezone=user_doc.get("timezone"),
            locale=user_doc.get("locale"),
            lastLoginAt=user_doc.get("lastLoginAt"),
            createdAt=user_doc["createdAt"],
            updatedAt=user_doc["updatedAt"]
        )

        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=3600,
            user=user_response
        )

    @staticmethod
    async def logout_user(user_id: str, refresh_token: Optional[str] = None) -> bool:
        """
        Logout user by revoking refresh token(s)

        Args:
            user_id: User's UUID
            refresh_token: Optional specific token to revoke (revokes all if None)

        Returns:
            True if successful

        Flow (User-Structure.md):
        1. Validate token (if provided)
        2. Mark token(s) as revoked in database
        3. Return success
        """
        db = mongodb.get_database()

        if refresh_token:
            # Revoke specific token
            token_payload = verify_refresh_token(refresh_token)

            if token_payload and token_payload["userId"] == user_id:
                await db.refresh_tokens.update_one(
                    {"tokenId": token_payload["tokenId"]},
                    {"$set": {"isRevoked": True}}
                )
                logger.info(f"Refresh token revoked for user: {user_id}")
        else:
            # Revoke all tokens for user
            await db.refresh_tokens.update_many(
                {"userId": user_id, "isRevoked": False},
                {"$set": {"isRevoked": True}}
            )
            logger.info(f"All refresh tokens revoked for user: {user_id}")

        return True

    @staticmethod
    async def send_verification_email(user_id: str) -> bool:
        """
        Send or resend email verification link

        Args:
            user_id: User's UUID

        Returns:
            True if email sent successfully

        Raises:
            HTTPException: 404 if user not found, 400 if already verified
        """
        db = mongodb.get_database()

        # Fetch user
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Check if already verified
        if user_doc.get("isEmailVerified", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already verified"
            )

        # Generate verification token (24 hours expiry)
        token, token_id = create_verification_token(
            user_id=user_id,
            email=user_doc["email"],
            token_type="email_verification"
        )

        # Store token in database
        token_doc = {
            "tokenId": token_id,
            "userId": user_id,
            "email": user_doc["email"],
            "token": token,
            "tokenType": "email_verification",
            "expiresAt": datetime.utcnow() + timedelta(hours=24),
            "isUsed": False,
            "createdAt": datetime.utcnow(),
            "usedAt": None
        }

        await db.verification_tokens.insert_one(token_doc)

        # Send verification email
        await send_email_verification(
            email=user_doc["email"],
            token=token,
            user_name=user_doc["firstName"]
        )

        logger.info(f"Verification email sent to: {user_doc['email']}")
        return True

    @staticmethod
    async def verify_email(token: str) -> UserResponse:
        """
        Verify user email with verification token

        Args:
            token: Email verification token

        Returns:
            UserResponse with updated user info

        Raises:
            HTTPException: 401 if token invalid or expired, 400 if already used
        """
        db = mongodb.get_database()

        # Verify token
        token_payload = verify_verification_token(token, "email_verification")

        if not token_payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired verification token"
            )

        user_id = token_payload["userId"]
        token_id = token_payload["tokenId"]

        # Check token in database
        token_doc = await db.verification_tokens.find_one({"tokenId": token_id})

        if not token_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Verification token not found"
            )

        # Check if token already used
        if token_doc.get("isUsed", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification token already used"
            )

        # Check if token expired
        if token_doc["expiresAt"] < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Verification token has expired"
            )

        # Update user email verification status
        result = await db.users.update_one(
            {"userId": user_id},
            {"$set": {
                "isEmailVerified": True,
                "updatedAt": datetime.utcnow()
            }}
        )

        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Mark token as used
        await db.verification_tokens.update_one(
            {"tokenId": token_id},
            {"$set": {
                "isUsed": True,
                "usedAt": datetime.utcnow()
            }}
        )

        # Fetch updated user
        user_doc = await db.users.find_one({"userId": user_id})

        # Send welcome email
        await send_welcome_email(
            email=user_doc["email"],
            user_name=user_doc["firstName"]
        )

        logger.info(f"Email verified for user: {user_doc['email']}")

        # Return user response
        return UserResponse(
            userId=user_id,
            email=user_doc["email"],
            firstName=user_doc["firstName"],
            lastName=user_doc["lastName"],
            role=UserRole(user_doc["role"]),
            isActive=user_doc["isActive"],
            isEmailVerified=True,
            phone=user_doc.get("phone"),
            avatar=user_doc.get("avatar"),
            timezone=user_doc.get("timezone"),
            locale=user_doc.get("locale"),
            lastLoginAt=user_doc.get("lastLoginAt"),
            createdAt=user_doc["createdAt"],
            updatedAt=user_doc["updatedAt"]
        )

    @staticmethod
    async def request_password_reset(email: str) -> bool:
        """
        Request password reset link

        Args:
            email: User's email address

        Returns:
            True (always, for security - don't reveal if email exists)

        Note: Always returns True to prevent email enumeration
        """
        db = mongodb.get_database()

        # Find user by email
        user_doc = await db.users.find_one({"email": email})

        # Always return True (security - don't reveal if email exists)
        if not user_doc:
            logger.info(f"Password reset requested for non-existent email: {email}")
            return True

        # Check if user is active
        if not user_doc.get("isActive", False):
            logger.info(f"Password reset requested for inactive user: {email}")
            return True

        # Generate password reset token (1 hour expiry)
        token, token_id = create_verification_token(
            user_id=user_doc["userId"],
            email=email,
            token_type="password_reset"
        )

        # Store token in database
        token_doc = {
            "tokenId": token_id,
            "userId": user_doc["userId"],
            "email": email,
            "token": token,
            "tokenType": "password_reset",
            "expiresAt": datetime.utcnow() + timedelta(hours=1),
            "isUsed": False,
            "createdAt": datetime.utcnow(),
            "usedAt": None
        }

        await db.verification_tokens.insert_one(token_doc)

        # Send password reset email
        await send_password_reset(
            email=email,
            token=token,
            user_name=user_doc["firstName"]
        )

        logger.info(f"Password reset email sent to: {email}")
        return True

    @staticmethod
    async def reset_password(token: str, new_password: str) -> bool:
        """
        Reset user password with reset token

        Args:
            token: Password reset token
            new_password: New password (already validated)

        Returns:
            True if password reset successfully

        Raises:
            HTTPException: 401 if token invalid or expired, 400 if already used
        """
        db = mongodb.get_database()

        # Verify token
        token_payload = verify_verification_token(token, "password_reset")

        if not token_payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired password reset token"
            )

        user_id = token_payload["userId"]
        token_id = token_payload["tokenId"]

        # Check token in database
        token_doc = await db.verification_tokens.find_one({"tokenId": token_id})

        if not token_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Password reset token not found"
            )

        # Check if token already used
        if token_doc.get("isUsed", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password reset token already used"
            )

        # Check if token expired
        if token_doc["expiresAt"] < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Password reset token has expired"
            )

        # Hash new password
        password_hash = hash_password(new_password)

        # Update user password
        result = await db.users.update_one(
            {"userId": user_id},
            {"$set": {
                "passwordHash": password_hash,
                "updatedAt": datetime.utcnow()
            }}
        )

        if result.matched_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Mark token as used
        await db.verification_tokens.update_one(
            {"tokenId": token_id},
            {"$set": {
                "isUsed": True,
                "usedAt": datetime.utcnow()
            }}
        )

        # Revoke all refresh tokens for security
        await db.refresh_tokens.update_many(
            {"userId": user_id, "isRevoked": False},
            {"$set": {"isRevoked": True}}
        )

        logger.info(f"Password reset successfully for user: {user_id}")
        return True


# Service instance
auth_service = AuthService()
