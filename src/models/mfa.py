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
