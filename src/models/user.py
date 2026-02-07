"""
User Models

Pydantic models for user data validation and serialization
Following User-Structure.md specifications
"""

from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum
import re


class UserRole(str, Enum):
    """
    User role enumeration
    Follows role hierarchy defined in User-Structure.md
    """
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MODERATOR = "moderator"
    USER = "user"
    GUEST = "guest"


class UserBase(BaseModel):
    """Base user model with common fields"""
    email: EmailStr
    firstName: str = Field(..., min_length=1, max_length=100)
    lastName: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    avatar: Optional[str] = Field(None, max_length=500)
    timezone: Optional[str] = Field(None, max_length=50)
    locale: Optional[str] = Field(None, max_length=10)


class UserCreate(UserBase):
    """
    User creation model (registration)

    Password requirements per User-Structure.md:
    - Length: 8-128 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one number
    - At least one special character
    """
    password: str = Field(..., min_length=8, max_length=128)

    @validator('password')
    def validate_password(cls, v: str) -> str:
        """
        Validate password strength

        Reason: Security requirement from User-Structure.md
        """
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one number')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character (!@#$%^&*)')
        return v


class UserUpdate(BaseModel):
    """User update model - all fields optional"""
    firstName: Optional[str] = Field(None, min_length=1, max_length=100)
    lastName: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    avatar: Optional[str] = Field(None, max_length=500)
    timezone: Optional[str] = Field(None, max_length=50)
    locale: Optional[str] = Field(None, max_length=10)


class UserResponse(UserBase):
    """
    User response model (public-facing)

    NEVER includes passwordHash or other sensitive data
    """
    userId: str
    role: UserRole
    isActive: bool
    isEmailVerified: bool
    mfaEnabled: bool = False
    mfaSetupRequired: bool = False
    lastLoginAt: Optional[datetime]
    createdAt: datetime
    updatedAt: datetime

    class Config:
        """Pydantic config"""
        from_attributes = True


class UserInDB(UserResponse):
    """
    User model as stored in database

    Includes passwordHash for internal use only
    """
    passwordHash: str


class UserLogin(BaseModel):
    """User login credentials"""
    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """JWT token response"""
    accessToken: str = Field(..., alias="access_token")
    refreshToken: str = Field(..., alias="refresh_token")
    tokenType: str = Field(default="bearer", alias="token_type")
    expiresIn: int = Field(..., alias="expires_in")
    user: UserResponse
    warning: Optional[str] = Field(None, description="Security warning message (e.g., low backup codes)")
    backupCodesRemaining: Optional[int] = Field(None, alias="backup_codes_remaining", description="Remaining MFA backup codes (only when backup code used)")

    class Config:
        """Pydantic config"""
        populate_by_name = True


class TokenPayload(BaseModel):
    """JWT token payload"""
    userId: str
    email: str
    role: UserRole
    exp: Optional[datetime] = None


class RefreshTokenCreate(BaseModel):
    """Refresh token creation model"""
    tokenId: str
    userId: str
    token: str
    expiresAt: datetime


class RefreshTokenInDB(RefreshTokenCreate):
    """Refresh token as stored in database"""
    isRevoked: bool = False
    createdAt: datetime
    lastUsedAt: Optional[datetime] = None


class EmailVerificationRequest(BaseModel):
    """Request model for email verification"""
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    """Request model for verifying email with token"""
    token: str


class PasswordResetRequest(BaseModel):
    """Request model for password reset"""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Request model for confirming password reset"""
    token: str
    newPassword: str = Field(..., min_length=8, max_length=128)

    @validator('newPassword')
    def validate_password(cls, v: str) -> str:
        """
        Validate password strength

        Reason: Security requirement from User-Structure.md
        """
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one number')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character (!@#$%^&*)')
        return v


class VerificationTokenInDB(BaseModel):
    """Verification token as stored in database"""
    tokenId: str
    userId: str
    email: str
    token: str
    tokenType: str  # 'email_verification' or 'password_reset'
    expiresAt: datetime
    isUsed: bool = False
    createdAt: datetime
    usedAt: Optional[datetime] = None


class UserRoleUpdate(BaseModel):
    """Request model for updating user role (admin/super_admin only)"""
    role: UserRole = Field(..., description="New role for the user")


class UserStatusUpdate(BaseModel):
    """Request model for updating user status (admin/super_admin only)"""
    isActive: bool = Field(..., description="User active status")


class UserListResponse(BaseModel):
    """Response model for paginated user list"""
    data: list[UserResponse]
    total: int
    page: int
    perPage: int
    totalPages: int


class UserListFilters(BaseModel):
    """Query parameters for filtering user list"""
    role: Optional[UserRole] = None
    isActive: Optional[bool] = None
    isEmailVerified: Optional[bool] = None
    search: Optional[str] = Field(None, max_length=200, description="Search in email, firstName, lastName")


# MFA Models

class MFASetupResponse(BaseModel):
    """Response when initiating MFA setup"""
    secret: str = Field(..., description="Base32-encoded TOTP secret for manual entry")
    qrCodeUri: str = Field(..., description="otpauth:// URI for QR code generation")
    qrCodeDataUrl: Optional[str] = Field(None, description="Base64-encoded QR code image (data:image/png;base64,...)")
    message: str = Field(default="Scan the QR code with your authenticator app")


class MFAEnableRequest(BaseModel):
    """Request to enable MFA by verifying TOTP code"""
    totpCode: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code from authenticator app")


class MFAEnableResponse(BaseModel):
    """Response after successfully enabling MFA"""
    enabled: bool = True
    backupCodes: list[str] = Field(..., description="One-time backup codes for account recovery")
    message: str = Field(default="MFA has been enabled successfully")


class MFADisableRequest(BaseModel):
    """Request to disable MFA"""
    totpCode: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code to verify identity")
    password: str = Field(..., min_length=1, description="Current password for additional verification")


class MFAVerifyRequest(BaseModel):
    """Request to verify MFA during login"""
    totpCode: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code or backup code")


class MFAStatusResponse(BaseModel):
    """Response for MFA status check"""
    mfaEnabled: bool
    mfaSetupPending: bool = False
    hasBackupCodes: bool = False


class MFALoginResponse(BaseModel):
    """
    Response when MFA is required during login.

    Returned instead of TokenResponse when user has MFA enabled.
    Client must then call /api/v1/auth/mfa/verify with the mfaToken and TOTP code.
    """
    mfaRequired: bool = True
    mfaToken: str = Field(..., description="Temporary token for MFA verification (5 min expiry)")
    userId: str = Field(..., description="User ID (masked for security)")
    message: str = Field(default="MFA verification required")


class MFAVerifyLoginRequest(BaseModel):
    """Request to complete login with MFA verification"""
    mfaToken: str = Field(..., description="Temporary MFA token from login response")
    code: str = Field(..., min_length=6, max_length=9, description="6-digit TOTP code or backup code (XXXX-XXXX format)")
