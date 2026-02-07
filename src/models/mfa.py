"""
MFA (Multi-Factor Authentication) Models

Pydantic models for TOTP-based MFA data validation and serialization
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class MFAMethod(str, Enum):
    """MFA method enumeration"""
    TOTP = "totp"  # Time-based One-Time Password
    # Future methods can be added here: SMS, EMAIL, etc.


class MFAStatus(str, Enum):
    """MFA setup status"""
    PENDING = "pending"      # Secret generated but not verified
    ENABLED = "enabled"      # MFA is active and verified
    DISABLED = "disabled"    # MFA was disabled by user


class MFASetupResponse(BaseModel):
    """
    Response model for MFA setup initiation

    Contains the provisioning URI for QR code generation
    NEVER includes the raw secret - use QR code or manual entry URI
    """
    provisioningUri: str = Field(..., description="URI for authenticator app (otpauth://)")
    secret: str = Field(..., description="Base32 secret for manual entry (shown only once)")
    method: MFAMethod = MFAMethod.TOTP
    qrCodeDataUrl: Optional[str] = Field(None, description="Base64 data URL for QR code image")


class MFAVerifyRequest(BaseModel):
    """Request model for verifying MFA setup or login"""
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class MFAEnableRequest(BaseModel):
    """Request model for enabling MFA after verification"""
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class MFADisableRequest(BaseModel):
    """Request model for disabling MFA (requires password confirmation)"""
    password: str = Field(..., min_length=1)
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class MFAStatusResponse(BaseModel):
    """Response model for MFA status check"""
    enabled: bool
    method: Optional[MFAMethod] = None
    enabledAt: Optional[datetime] = None


class MFAInDB(BaseModel):
    """
    MFA data as stored in database

    SECURITY: totpSecretEncrypted is stored with Fernet encryption
    NEVER return raw secret to API responses
    """
    mfaId: str
    userId: str
    method: MFAMethod = MFAMethod.TOTP
    totpSecretEncrypted: str = Field(..., description="Fernet-encrypted TOTP secret")
    status: MFAStatus = MFAStatus.PENDING
    backupCodesHash: Optional[list[str]] = Field(None, description="Hashed backup codes")
    createdAt: datetime
    updatedAt: datetime
    enabledAt: Optional[datetime] = None
    lastUsedAt: Optional[datetime] = None
    failedAttempts: int = 0
    lockedUntil: Optional[datetime] = None

    class Config:
        """Pydantic config"""
        from_attributes = True


class MFACreate(BaseModel):
    """Model for creating MFA record"""
    userId: str
    method: MFAMethod = MFAMethod.TOTP
    totpSecretEncrypted: str


class MFARecoveryCodesResponse(BaseModel):
    """Response model for generating backup/recovery codes"""
    codes: list[str] = Field(..., description="One-time recovery codes (shown only once)")
    message: str = "Save these codes securely. Each code can only be used once."


class MFALoginRequired(BaseModel):
    """Response model when MFA is required for login"""
    mfaRequired: bool = True
    mfaMethod: MFAMethod
    tempToken: str = Field(..., description="Temporary token for MFA verification step")


# =============================================================================
# Database Schema Models for MFA Collections
# =============================================================================


class MFAAuditAction(str, Enum):
    """MFA audit log action types"""
    SETUP_INITIATED = "setup_initiated"
    SETUP_COMPLETED = "setup_completed"
    ENABLED = "enabled"
    DISABLED = "disabled"
    DISABLED_BY_ADMIN = "disabled_by_admin"
    VERIFICATION_SUCCESS = "verification_success"
    VERIFICATION_FAILED = "verification_failed"
    BACKUP_CODE_USED = "backup_code_used"
    BACKUP_CODES_REGENERATED = "backup_codes_regenerated"
    LOCKOUT_TRIGGERED = "lockout_triggered"
    LOCKOUT_CLEARED = "lockout_cleared"
    ADMIN_RESET = "admin_reset"


class UserMFA(BaseModel):
    """
    User MFA record - stored in 'user_mfa' collection

    This is the primary MFA data store for each user.
    One record per user (userId is unique).

    SECURITY: totpSecretEncrypted is AES-encrypted using Fernet
    """
    mfaId: str = Field(..., description="Unique MFA record ID (UUID)")
    userId: str = Field(..., description="User ID (references users collection)")
    totpSecretEncrypted: str = Field(..., description="Fernet-encrypted TOTP secret")
    isEnabled: bool = Field(default=False, description="Whether MFA is currently enabled")
    method: MFAMethod = Field(default=MFAMethod.TOTP, description="MFA method (currently only TOTP)")

    # Timestamps
    createdAt: datetime = Field(..., description="When MFA was first set up")
    updatedAt: datetime = Field(..., description="Last update timestamp")
    enabledAt: Optional[datetime] = Field(None, description="When MFA was enabled")
    disabledAt: Optional[datetime] = Field(None, description="When MFA was last disabled")

    # Usage tracking
    lastUsedAt: Optional[datetime] = Field(None, description="Last successful MFA verification")
    lastUsedCounter: int = Field(default=0, description="Last TOTP counter for replay protection")

    # Security features
    failedAttempts: int = Field(default=0, description="Consecutive failed verification attempts")
    lockedUntil: Optional[datetime] = Field(None, description="Lockout expiry time")

    class Config:
        from_attributes = True


class MFABackupCode(BaseModel):
    """
    MFA backup code record - stored in 'mfa_backup_codes' collection

    Each backup code is stored as a separate document for efficient
    lookup and atomic deletion when used.

    SECURITY: codeHash is SHA-256 hash of the backup code
    """
    codeId: str = Field(..., description="Unique backup code ID (UUID)")
    userId: str = Field(..., description="User ID this code belongs to")
    codeHash: str = Field(..., description="SHA-256 hash of the backup code")
    isUsed: bool = Field(default=False, description="Whether this code has been used")
    usedAt: Optional[datetime] = Field(None, description="When the code was used")
    createdAt: datetime = Field(..., description="When the code was generated")

    # TTL field - used codes are automatically deleted after 90 days
    expiresAt: Optional[datetime] = Field(None, description="TTL expiry for used codes (90 days after use)")

    class Config:
        from_attributes = True


class MFAAuditLog(BaseModel):
    """
    MFA audit log record - stored in 'mfa_audit_log' collection

    Tracks all MFA-related actions for security monitoring and compliance.
    """
    logId: str = Field(..., description="Unique log entry ID (UUID)")
    userId: str = Field(..., description="User ID who performed/was affected by the action")
    action: MFAAuditAction = Field(..., description="Type of MFA action")
    ipAddress: Optional[str] = Field(None, description="Client IP address")
    userAgent: Optional[str] = Field(None, description="Client user agent string")
    timestamp: datetime = Field(..., description="When the action occurred")

    # Additional context
    details: Optional[dict] = Field(None, description="Additional action-specific details")
    performedBy: Optional[str] = Field(None, description="Admin user ID if action was performed by admin")

    class Config:
        from_attributes = True


class MFABackupCodeCreate(BaseModel):
    """Model for creating a backup code record"""
    userId: str
    codeHash: str


class MFAAuditLogCreate(BaseModel):
    """Model for creating an audit log entry"""
    userId: str
    action: MFAAuditAction
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None
    details: Optional[dict] = None
    performedBy: Optional[str] = None
