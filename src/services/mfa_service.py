"""
MFA (Multi-Factor Authentication) Service

Provides TOTP-based two-factor authentication functionality
Following security best practices for MFA implementation

Security Features:
- TOTP secrets are encrypted at rest using Fernet (AES-128-CBC + HMAC)
- PBKDF2 key derivation from SECRET_KEY with 100k iterations
- Backup codes are SHA-256 hashed before storage
- NEVER returns raw secrets in API responses after initial setup
"""

import pyotp
import secrets
import hashlib
import logging
import base64
import io
from datetime import datetime
from typing import Optional, Tuple, List

import qrcode
from qrcode.image.pil import PilImage
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import HTTPException, status

from ..models.user import (
    MFASetupResponse,
    MFAEnableResponse,
    MFAStatusResponse
)
from ..config.settings import settings
from .database import mongodb

logger = logging.getLogger(__name__)


# =============================================================================
# TOTP Secret Encryption
# =============================================================================

# Salt for MFA secret encryption (different from license key salt for isolation)
MFA_ENCRYPTION_SALT = b"a64core_mfa_totp_secret_v1"
PBKDF2_ITERATIONS = 100000


def _get_mfa_fernet() -> Fernet:
    """
    Get Fernet instance for MFA secret encryption/decryption.

    Uses SECRET_KEY from settings with PBKDF2 key derivation.
    Different salt from license encryption for security isolation.

    Returns:
        Fernet instance for encryption operations
    """
    # Derive Fernet key from SECRET_KEY using PBKDF2
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=MFA_ENCRYPTION_SALT,
        iterations=PBKDF2_ITERATIONS,
    )
    key = kdf.derive(settings.SECRET_KEY.encode())
    fernet_key = base64.urlsafe_b64encode(key)
    return Fernet(fernet_key)


def encrypt_totp_secret(secret: str) -> str:
    """
    Encrypt a TOTP secret for secure storage in database.

    Args:
        secret: Plain text TOTP secret (base32 encoded)

    Returns:
        Fernet-encrypted secret (base64 string)

    Security Notes:
        - Uses Fernet symmetric encryption (AES-128-CBC + HMAC)
        - Encrypted value is authenticated (tampering detected)
        - Safe to store in database
        - NEVER log the input secret
    """
    try:
        fernet = _get_mfa_fernet()
        encrypted = fernet.encrypt(secret.encode())
        return encrypted.decode()
    except Exception as e:
        logger.error(f"Failed to encrypt TOTP secret: {str(e)}")
        raise ValueError("Failed to encrypt MFA secret") from e


def decrypt_totp_secret(encrypted_secret: str) -> str:
    """
    Decrypt a TOTP secret from database.

    Args:
        encrypted_secret: Fernet-encrypted secret from database

    Returns:
        Plain text TOTP secret (base32 encoded)

    Raises:
        ValueError: If decryption fails (wrong key or tampered data)

    Security Notes:
        - NEVER log the decrypted secret
        - NEVER return decrypted secret in API responses
        - Only use for TOTP validation
    """
    try:
        fernet = _get_mfa_fernet()
        decrypted = fernet.decrypt(encrypted_secret.encode())
        return decrypted.decode()
    except InvalidToken:
        logger.error("Failed to decrypt TOTP secret - invalid token or key changed")
        raise ValueError("Failed to decrypt MFA secret - key may have changed")
    except Exception as e:
        logger.error(f"Failed to decrypt TOTP secret: {str(e)}")
        raise ValueError("Failed to decrypt MFA secret") from e


class MFAService:
    """Service for managing TOTP-based MFA"""

    # App name shown in authenticator apps
    ISSUER_NAME = "A64 Core Platform"

    # Number of backup codes to generate
    BACKUP_CODE_COUNT = 10

    # Backup code length (excluding dashes)
    BACKUP_CODE_LENGTH = 8

    @staticmethod
    def generate_totp_secret() -> str:
        """
        Generate a new TOTP secret key

        Returns:
            Base32-encoded 20-byte secret key
        """
        return pyotp.random_base32(length=32)

    @staticmethod
    def generate_totp_uri(secret: str, email: str) -> str:
        """
        Generate otpauth:// URI for QR code

        Args:
            secret: Base32-encoded TOTP secret
            email: User's email address

        Returns:
            otpauth:// URI string
        """
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(
            name=email,
            issuer_name=MFAService.ISSUER_NAME
        )

    @staticmethod
    def generate_qr_code_base64(provisioning_uri: str) -> str:
        """
        Generate QR code as base64 data URL for authenticator app setup.

        Args:
            provisioning_uri: otpauth:// URI containing TOTP secret

        Returns:
            Base64-encoded PNG image as data URL (data:image/png;base64,...)

        Example:
            qr_data_url = MFAService.generate_qr_code_base64(uri)
            # Returns: "data:image/png;base64,iVBORw0KGgo..."
        """
        try:
            # Create QR code with pyotp provisioning URI
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(provisioning_uri)
            qr.make(fit=True)

            # Generate PIL image
            img = qr.make_image(fill_color="black", back_color="white")

            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)

            base64_img = base64.b64encode(buffer.getvalue()).decode('utf-8')
            return f"data:image/png;base64,{base64_img}"

        except Exception as e:
            logger.error(f"Failed to generate QR code: {e}")
            return ""

    @staticmethod
    def verify_totp_code(secret: str, code: str) -> bool:
        """
        Verify a TOTP code against a secret

        Args:
            secret: Base32-encoded TOTP secret
            code: 6-digit TOTP code

        Returns:
            True if code is valid, False otherwise
        """
        try:
            totp = pyotp.TOTP(secret)
            # valid_window=1 allows codes from 30 seconds before/after
            return totp.verify(code, valid_window=1)
        except Exception as e:
            logger.error(f"Error verifying TOTP code: {e}")
            return False

    @staticmethod
    def generate_backup_codes() -> Tuple[List[str], List[str]]:
        """
        Generate backup codes for account recovery

        Returns:
            Tuple of (plain_codes, hashed_codes)
            plain_codes: Human-readable codes to show user (format: XXXX-XXXX)
            hashed_codes: SHA-256 hashed codes to store in database
        """
        plain_codes = []
        hashed_codes = []

        for _ in range(MFAService.BACKUP_CODE_COUNT):
            # Generate random alphanumeric code
            code = secrets.token_hex(MFAService.BACKUP_CODE_LENGTH // 2).upper()
            # Format as XXXX-XXXX for readability
            formatted_code = f"{code[:4]}-{code[4:]}"
            plain_codes.append(formatted_code)

            # Hash the code for secure storage
            code_hash = hashlib.sha256(formatted_code.encode()).hexdigest()
            hashed_codes.append(code_hash)

        return plain_codes, hashed_codes

    @staticmethod
    def verify_backup_code(code: str, hashed_codes: List[str]) -> Tuple[bool, int]:
        """
        Verify a backup code and return its index if valid

        Args:
            code: Backup code to verify
            hashed_codes: List of hashed backup codes

        Returns:
            Tuple of (is_valid, index)
            index is -1 if code is invalid
        """
        # Normalize input (remove dashes, uppercase)
        normalized = code.replace("-", "").upper()
        if len(normalized) != 8:
            # Try with original formatting
            formatted = f"{normalized[:4]}-{normalized[4:]}" if len(normalized) == 8 else code.upper()
        else:
            formatted = f"{normalized[:4]}-{normalized[4:]}"

        code_hash = hashlib.sha256(formatted.encode()).hexdigest()

        for i, stored_hash in enumerate(hashed_codes):
            if stored_hash == code_hash:
                return True, i

        return False, -1

    async def setup_mfa(self, user_id: str) -> MFASetupResponse:
        """
        Initialize MFA setup for a user

        Creates a pending TOTP secret that must be verified before enabling MFA.

        Args:
            user_id: User's UUID

        Returns:
            MFASetupResponse with secret and QR code URI

        Raises:
            HTTPException: 400 if MFA already enabled, 404 if user not found
        """
        db = mongodb.get_database()

        # Fetch user
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Check if MFA is already enabled
        if user_doc.get("mfaEnabled", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is already enabled for this account"
            )

        # Generate new TOTP secret
        secret = self.generate_totp_secret()

        # Generate QR code URI and base64 image
        qr_uri = self.generate_totp_uri(secret, user_doc["email"])
        qr_code_data_url = self.generate_qr_code_base64(qr_uri)

        # Encrypt the secret before storing
        encrypted_secret = encrypt_totp_secret(secret)

        # Store pending secret (encrypted, not yet verified)
        await db.users.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "mfaPendingSecret": encrypted_secret,
                    "mfaPendingSecretEncrypted": True,  # Flag indicating encryption
                    "mfaPendingSetupAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        logger.info(f"MFA setup initiated for user: {user_id}")

        return MFASetupResponse(
            secret=secret,
            qrCodeUri=qr_uri,
            qrCodeDataUrl=qr_code_data_url,
            message="Scan the QR code with your authenticator app, then verify with a code"
        )

    async def enable_mfa(self, user_id: str, totp_code: str) -> MFAEnableResponse:
        """
        Enable MFA by verifying the user can generate valid TOTP codes

        Args:
            user_id: User's UUID
            totp_code: 6-digit TOTP code from authenticator app

        Returns:
            MFAEnableResponse with backup codes

        Raises:
            HTTPException: 400 if no pending setup or invalid code, 404 if user not found
        """
        db = mongodb.get_database()

        # Fetch user
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Check if MFA is already enabled
        if user_doc.get("mfaEnabled", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is already enabled for this account"
            )

        # Check for pending secret (encrypted)
        pending_secret_encrypted = user_doc.get("mfaPendingSecret")
        if not pending_secret_encrypted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No MFA setup in progress. Please start setup first."
            )

        # Decrypt the pending secret for verification
        try:
            # Check if encrypted (new format) or plain (legacy)
            if user_doc.get("mfaPendingSecretEncrypted", False):
                pending_secret = decrypt_totp_secret(pending_secret_encrypted)
            else:
                # Legacy plain text - encrypt on next store
                pending_secret = pending_secret_encrypted
                logger.warning(f"Found unencrypted MFA pending secret for user {user_id}")
        except ValueError as e:
            logger.error(f"Failed to decrypt MFA secret for user {user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process MFA secret. Please restart setup."
            )

        # Verify the TOTP code
        if not self.verify_totp_code(pending_secret, totp_code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid TOTP code. Please try again."
            )

        # Generate backup codes
        plain_codes, hashed_codes = self.generate_backup_codes()

        # Encrypt the secret for permanent storage (if not already encrypted)
        encrypted_secret = encrypt_totp_secret(pending_secret)

        # Enable MFA and store encrypted secret permanently
        await db.users.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "mfaEnabled": True,
                    "mfaSecret": encrypted_secret,
                    "mfaSecretEncrypted": True,  # Flag indicating encryption
                    "mfaBackupCodes": hashed_codes,
                    "mfaEnabledAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                },
                "$unset": {
                    "mfaPendingSecret": "",
                    "mfaPendingSecretEncrypted": "",
                    "mfaPendingSetupAt": ""
                }
            }
        )

        logger.info(f"MFA enabled successfully for user: {user_id}")

        return MFAEnableResponse(
            enabled=True,
            backupCodes=plain_codes,
            message="MFA has been enabled successfully. Save your backup codes in a secure location."
        )

    async def disable_mfa(self, user_id: str, totp_code: str, password: str) -> dict:
        """
        Disable MFA for a user

        Requires both TOTP code and password for security.

        Args:
            user_id: User's UUID
            totp_code: 6-digit TOTP code
            password: User's password

        Returns:
            Success message

        Raises:
            HTTPException: 400 if MFA not enabled or invalid credentials
        """
        from ..utils.security import verify_password

        db = mongodb.get_database()

        # Fetch user
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Check if MFA is enabled
        if not user_doc.get("mfaEnabled", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is not enabled for this account"
            )

        # Verify password
        if not verify_password(password, user_doc["passwordHash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password"
            )

        # Decrypt and verify TOTP code
        mfa_secret_encrypted = user_doc.get("mfaSecret")
        try:
            if user_doc.get("mfaSecretEncrypted", False):
                mfa_secret = decrypt_totp_secret(mfa_secret_encrypted)
            else:
                # Legacy plain text secret
                mfa_secret = mfa_secret_encrypted
        except ValueError as e:
            logger.error(f"Failed to decrypt MFA secret for user {user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process MFA secret"
            )

        if not self.verify_totp_code(mfa_secret, totp_code):
            # Try backup code
            backup_codes = user_doc.get("mfaBackupCodes", [])
            is_valid, code_index = self.verify_backup_code(totp_code, backup_codes)

            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid TOTP or backup code"
                )

        # Disable MFA
        await db.users.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "mfaEnabled": False,
                    "mfaDisabledAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                },
                "$unset": {
                    "mfaSecret": "",
                    "mfaSecretEncrypted": "",
                    "mfaBackupCodes": "",
                    "mfaEnabledAt": ""
                }
            }
        )

        logger.info(f"MFA disabled for user: {user_id}")

        return {"message": "MFA has been disabled successfully"}

    async def verify_mfa_code(self, user_id: str, code: str) -> Tuple[bool, bool]:
        """
        Verify an MFA code (TOTP or backup code) during login

        Args:
            user_id: User's UUID
            code: TOTP code or backup code

        Returns:
            Tuple of (is_valid, used_backup_code)

        Raises:
            HTTPException: 404 if user not found
        """
        db = mongodb.get_database()

        # Fetch user
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        mfa_secret_encrypted = user_doc.get("mfaSecret")
        backup_codes = user_doc.get("mfaBackupCodes", [])

        # Decrypt the MFA secret
        try:
            if user_doc.get("mfaSecretEncrypted", False):
                mfa_secret = decrypt_totp_secret(mfa_secret_encrypted)
            else:
                # Legacy plain text secret
                mfa_secret = mfa_secret_encrypted
        except ValueError as e:
            logger.error(f"Failed to decrypt MFA secret for user {user_id}: {e}")
            # Can't verify TOTP, fall through to backup code check
            mfa_secret = None

        # Try TOTP code first
        if mfa_secret and self.verify_totp_code(mfa_secret, code):
            return True, False

        # Try backup code
        is_valid, code_index = self.verify_backup_code(code, backup_codes)

        if is_valid:
            # Remove used backup code
            backup_codes.pop(code_index)
            await db.users.update_one(
                {"userId": user_id},
                {
                    "$set": {
                        "mfaBackupCodes": backup_codes,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )
            logger.info(f"Backup code used for user: {user_id}. {len(backup_codes)} codes remaining.")
            return True, True

        return False, False

    async def get_mfa_status(self, user_id: str) -> MFAStatusResponse:
        """
        Get MFA status for a user

        Args:
            user_id: User's UUID

        Returns:
            MFAStatusResponse with current MFA state

        Raises:
            HTTPException: 404 if user not found
        """
        db = mongodb.get_database()

        # Fetch user
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        mfa_enabled = user_doc.get("mfaEnabled", False)
        mfa_pending = bool(user_doc.get("mfaPendingSecret"))
        has_backup_codes = len(user_doc.get("mfaBackupCodes", [])) > 0

        return MFAStatusResponse(
            mfaEnabled=mfa_enabled,
            mfaSetupPending=mfa_pending,
            hasBackupCodes=has_backup_codes
        )

    async def regenerate_backup_codes(self, user_id: str, totp_code: str) -> MFAEnableResponse:
        """
        Regenerate backup codes (invalidates old ones)

        Args:
            user_id: User's UUID
            totp_code: 6-digit TOTP code to verify identity

        Returns:
            MFAEnableResponse with new backup codes

        Raises:
            HTTPException: 400 if MFA not enabled or invalid code
        """
        db = mongodb.get_database()

        # Fetch user
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if not user_doc.get("mfaEnabled", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is not enabled for this account"
            )

        # Decrypt and verify TOTP code
        mfa_secret_encrypted = user_doc.get("mfaSecret")
        try:
            if user_doc.get("mfaSecretEncrypted", False):
                mfa_secret = decrypt_totp_secret(mfa_secret_encrypted)
            else:
                mfa_secret = mfa_secret_encrypted
        except ValueError as e:
            logger.error(f"Failed to decrypt MFA secret for user {user_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to process MFA secret"
            )

        if not self.verify_totp_code(mfa_secret, totp_code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid TOTP code"
            )

        # Generate new backup codes
        plain_codes, hashed_codes = self.generate_backup_codes()

        # Update backup codes
        await db.users.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "mfaBackupCodes": hashed_codes,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        logger.info(f"Backup codes regenerated for user: {user_id}")

        return MFAEnableResponse(
            enabled=True,
            backupCodes=plain_codes,
            message="New backup codes generated. Previous codes are now invalid."
        )


# Service instance
mfa_service = MFAService()
