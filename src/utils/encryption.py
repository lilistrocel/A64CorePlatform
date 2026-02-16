"""
License Key Encryption Utility for A64 Core Platform

This module provides secure encryption/decryption for module license keys using
Fernet symmetric encryption (AES-128 in CBC mode with HMAC authentication).

Security Features:
- Fernet symmetric encryption (cryptographically secure)
- PBKDF2 key derivation from SECRET_KEY environment variable
- 100,000 iterations for key stretching
- Salt-based key derivation
- No license keys logged or exposed in API responses

Usage:
    from src.utils.encryption import encrypt_license_key, decrypt_license_key

    # Encrypt before storing in database
    encrypted = encrypt_license_key("XXX-YYY-ZZZ-AAA-BBB")

    # Decrypt when validating
    original = decrypt_license_key(encrypted)

Environment Variables Required:
    - LICENSE_ENCRYPTION_KEY: 32+ character encryption key (from .env)

Security Warnings:
    - NEVER log decrypted license keys
    - NEVER return decrypted keys in API responses
    - Use HTTPS in production to protect keys in transit
    - Rotate encryption keys periodically (with re-encryption plan)
"""

import os
import base64
import hashlib
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


# =============================================================================
# Configuration
# =============================================================================

# Get encryption key from environment
# CRITICAL: This must be set in .env and rotated periodically
ENCRYPTION_KEY = os.getenv("LICENSE_ENCRYPTION_KEY", "")

# PBKDF2 parameters for key derivation
PBKDF2_ITERATIONS = 100000  # 100k iterations for key stretching
PBKDF2_SALT = b"a64core_module_license_salt_v1"  # Fixed salt for deterministic key derivation


# =============================================================================
# Key Derivation
# =============================================================================

def _derive_fernet_key(password: str, salt: bytes = PBKDF2_SALT) -> bytes:
    """
    Derive a Fernet-compatible key from a password using PBKDF2.

    Args:
        password: The master password/key from environment variable
        salt: Salt for key derivation (default: fixed salt)

    Returns:
        32-byte key suitable for Fernet encryption (base64 encoded)

    Security Notes:
        - Uses PBKDF2 with SHA256 and 100,000 iterations
        - Fixed salt ensures deterministic key derivation (same password = same key)
        - Key is base64-encoded to be Fernet-compatible
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,  # 32 bytes = 256 bits
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    key = kdf.derive(password.encode())
    return base64.urlsafe_b64encode(key)


def validate_encryption_key() -> bool:
    """
    Validate that the encryption key is set and meets minimum requirements.

    Returns:
        True if encryption key is valid, False otherwise

    Raises:
        ValueError: If encryption key is missing or too weak
    """
    if not ENCRYPTION_KEY:
        raise ValueError(
            "LICENSE_ENCRYPTION_KEY environment variable is not set. "
            "This is REQUIRED for module license encryption. "
            "Set it in your .env file (minimum 32 characters)."
        )

    if len(ENCRYPTION_KEY) < 32:
        raise ValueError(
            f"LICENSE_ENCRYPTION_KEY is too short ({len(ENCRYPTION_KEY)} chars). "
            "Minimum 32 characters required for security. "
            "Use a cryptographically secure random string."
        )

    # Check for default/weak keys (common mistake)
    weak_keys = [
        "change-this-to-32-char-key-in-production-please-make-secure",
        "12345678901234567890123456789012",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]
    if ENCRYPTION_KEY in weak_keys:
        raise ValueError(
            "LICENSE_ENCRYPTION_KEY is using a default/weak value. "
            "Generate a secure random key for production use. "
            "Example: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
        )

    return True


# =============================================================================
# Encryption Functions
# =============================================================================

def encrypt_license_key(license_key: str) -> str:
    """
    Encrypt a license key for secure storage in database.

    Args:
        license_key: Plain text license key to encrypt

    Returns:
        Base64-encoded encrypted license key (Fernet token)

    Raises:
        ValueError: If encryption key is not configured
        Exception: If encryption fails

    Example:
        >>> encrypted = encrypt_license_key("XXX-YYY-ZZZ-AAA-BBB")
        >>> print(encrypted)
        'gAAAAABf...'  # Fernet token (base64)

    Security Notes:
        - Uses Fernet symmetric encryption (AES-128-CBC + HMAC)
        - Encrypted value is authenticated (tampering detected)
        - Safe to store in database
        - NEVER log the input license_key parameter
    """
    # Validate encryption key is configured
    validate_encryption_key()

    try:
        # Derive Fernet key from environment variable
        fernet_key = _derive_fernet_key(ENCRYPTION_KEY)
        fernet = Fernet(fernet_key)

        # Encrypt the license key
        encrypted_bytes = fernet.encrypt(license_key.encode())

        # Return as base64 string for database storage
        return encrypted_bytes.decode()

    except Exception as e:
        # SECURITY: Do NOT log the license key in error messages
        raise Exception(f"Failed to encrypt license key: {str(e)}") from e


def decrypt_license_key(encrypted_license_key: str) -> str:
    """
    Decrypt an encrypted license key from database.

    Args:
        encrypted_license_key: Base64-encoded Fernet token from database

    Returns:
        Plain text license key

    Raises:
        ValueError: If encryption key is not configured
        InvalidToken: If decryption fails (wrong key, tampered data, or corrupted token)
        Exception: If decryption fails for other reasons

    Example:
        >>> decrypted = decrypt_license_key('gAAAAABf...')
        >>> print(decrypted)
        'XXX-YYY-ZZZ-AAA-BBB'

    Security Notes:
        - NEVER log the decrypted license key
        - NEVER return decrypted key in API responses
        - Only use for license validation
        - Fernet automatically validates token integrity (HMAC)
    """
    # Validate encryption key is configured
    validate_encryption_key()

    try:
        # Derive Fernet key from environment variable
        fernet_key = _derive_fernet_key(ENCRYPTION_KEY)
        fernet = Fernet(fernet_key)

        # Decrypt the license key
        decrypted_bytes = fernet.decrypt(encrypted_license_key.encode())

        # Return as string
        return decrypted_bytes.decode()

    except InvalidToken:
        # This can happen if:
        # - Encryption key changed (key rotation without re-encryption)
        # - Data was tampered with
        # - Token is corrupted
        raise InvalidToken(
            "Failed to decrypt license key. "
            "This may indicate key rotation, data corruption, or tampering. "
            "Check LICENSE_ENCRYPTION_KEY environment variable."
        )
    except Exception as e:
        # SECURITY: Do NOT log the encrypted token in error messages (could leak info)
        raise Exception(f"Failed to decrypt license key: {str(e)}") from e


# =============================================================================
# SenseHub Credential Encryption
# =============================================================================

# Separate salt for SenseHub credentials (isolated from license key encryption)
SENSEHUB_SALT = b"a64core_sensehub_credentials_v1"


def encrypt_sensehub_password(password: str) -> str:
    """
    Encrypt a SenseHub service account password for secure storage.

    Uses SECRET_KEY from app settings (always available for JWT).

    Args:
        password: Plain text SenseHub password

    Returns:
        Fernet-encrypted password string

    Security Notes:
        - NEVER log the plain text password
        - NEVER return decrypted password in API responses
    """
    from src.config.settings import settings
    secret_key = settings.SECRET_KEY
    if not secret_key or len(secret_key) < 16:
        raise ValueError(
            "SECRET_KEY is not set or too short. "
            "Required for SenseHub credential encryption."
        )

    try:
        fernet_key = _derive_fernet_key(secret_key, salt=SENSEHUB_SALT)
        fernet = Fernet(fernet_key)
        encrypted_bytes = fernet.encrypt(password.encode())
        return encrypted_bytes.decode()
    except Exception as e:
        raise Exception(f"Failed to encrypt SenseHub password: {str(e)}") from e


def decrypt_sensehub_password(encrypted_password: str) -> str:
    """
    Decrypt a SenseHub service account password from database.

    Args:
        encrypted_password: Fernet-encrypted password string

    Returns:
        Plain text password

    Security Notes:
        - NEVER log the decrypted password
        - NEVER return in API responses
        - Only use for SenseHub authentication
    """
    from src.config.settings import settings
    secret_key = settings.SECRET_KEY
    if not secret_key or len(secret_key) < 16:
        raise ValueError(
            "SECRET_KEY is not set or too short. "
            "Required for SenseHub credential decryption."
        )

    try:
        fernet_key = _derive_fernet_key(secret_key, salt=SENSEHUB_SALT)
        fernet = Fernet(fernet_key)
        decrypted_bytes = fernet.decrypt(encrypted_password.encode())
        return decrypted_bytes.decode()
    except InvalidToken:
        raise InvalidToken(
            "Failed to decrypt SenseHub password. "
            "This may indicate SECRET_KEY rotation or data corruption."
        )
    except Exception as e:
        raise Exception(f"Failed to decrypt SenseHub password: {str(e)}") from e


# =============================================================================
# Utility Functions
# =============================================================================

def hash_license_key(license_key: str) -> str:
    """
    Create a one-way hash of a license key for comparison without decryption.

    This is useful for:
    - Duplicate detection (same license used for multiple modules)
    - License revocation lists
    - Audit logging (log hash instead of actual key)

    Args:
        license_key: Plain text license key

    Returns:
        SHA256 hash of the license key (hex string)

    Example:
        >>> hash1 = hash_license_key("XXX-YYY-ZZZ")
        >>> hash2 = hash_license_key("XXX-YYY-ZZZ")
        >>> hash1 == hash2
        True

    Security Notes:
        - One-way function (cannot reverse to get original key)
        - Same key always produces same hash (deterministic)
        - Safe to log or store for comparison
    """
    return hashlib.sha256(license_key.encode()).hexdigest()


def generate_secure_key(length: int = 32) -> str:
    """
    Generate a cryptographically secure random key for LICENSE_ENCRYPTION_KEY.

    Args:
        length: Key length in bytes (default: 32 bytes = 256 bits)

    Returns:
        URL-safe base64-encoded random string

    Example:
        >>> key = generate_secure_key()
        >>> print(len(key))
        43  # base64 encoding increases length
        >>> print(key)
        'Xf8kP2nQ-vL9mR5sT7wY3zA1bC6dE4fG8hJ0kM2n...'

    Usage:
        Run this once to generate a key for your .env file:
        $ python -c "from src.utils.encryption import generate_secure_key; print(generate_secure_key())"
    """
    import secrets
    return secrets.token_urlsafe(length)


def test_encryption_roundtrip(test_key: str = "TEST-LICENSE-KEY-123") -> bool:
    """
    Test encryption/decryption roundtrip to verify configuration.

    Args:
        test_key: Test license key to encrypt and decrypt

    Returns:
        True if roundtrip successful, False otherwise

    Raises:
        Exception: If encryption configuration is invalid

    Example:
        >>> test_encryption_roundtrip()
        True

    Usage:
        Use this during application startup to verify encryption is working:
        ```python
        from src.utils.encryption import test_encryption_roundtrip
        if not test_encryption_roundtrip():
            raise RuntimeError("Encryption test failed - check LICENSE_ENCRYPTION_KEY")
        ```
    """
    try:
        # Encrypt
        encrypted = encrypt_license_key(test_key)

        # Decrypt
        decrypted = decrypt_license_key(encrypted)

        # Verify
        if decrypted != test_key:
            raise ValueError(
                f"Encryption roundtrip failed: expected '{test_key}', got '{decrypted}'"
            )

        return True

    except Exception as e:
        raise Exception(f"Encryption test failed: {str(e)}") from e


# =============================================================================
# Module Initialization
# =============================================================================

# Validate encryption key on module import (fail fast)
try:
    validate_encryption_key()
except ValueError as e:
    # Allow import to succeed but log warning
    # This allows the app to start and show proper error in API
    import warnings
    warnings.warn(f"Encryption configuration warning: {str(e)}", UserWarning)


# =============================================================================
# CLI Utility (for manual testing and key generation)
# =============================================================================

if __name__ == "__main__":
    """
    Command-line utility for testing encryption and generating keys.

    Usage:
        # Generate a new encryption key
        python -m src.utils.encryption generate

        # Test encryption with current configuration
        python -m src.utils.encryption test

        # Encrypt a license key
        python -m src.utils.encryption encrypt "XXX-YYY-ZZZ"

        # Decrypt a license key
        python -m src.utils.encryption decrypt "gAAAAABf..."
    """
    import sys

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python -m src.utils.encryption generate              # Generate new key")
        print("  python -m src.utils.encryption test                  # Test encryption")
        print("  python -m src.utils.encryption encrypt <license_key> # Encrypt key")
        print("  python -m src.utils.encryption decrypt <encrypted>   # Decrypt key")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "generate":
        # Generate new encryption key
        new_key = generate_secure_key()
        print("\n" + "="*80)
        print("Generated new LICENSE_ENCRYPTION_KEY:")
        print("="*80)
        print(new_key)
        print("="*80)
        print("\nAdd this to your .env file:")
        print(f"LICENSE_ENCRYPTION_KEY={new_key}")
        print("\nWARNING: If you change this key, you must re-encrypt all existing license keys!")
        print("="*80 + "\n")

    elif command == "test":
        # Test encryption roundtrip
        print("\nTesting encryption configuration...")
        try:
            validate_encryption_key()
            print("✓ Encryption key is valid")

            test_encryption_roundtrip()
            print("✓ Encryption roundtrip test passed")

            print("\n✓ All encryption tests passed!\n")
        except Exception as e:
            print(f"\n✗ Encryption test failed: {str(e)}\n")
            sys.exit(1)

    elif command == "encrypt":
        # Encrypt a license key
        if len(sys.argv) < 3:
            print("Error: Please provide a license key to encrypt")
            sys.exit(1)

        license_key = sys.argv[2]
        try:
            encrypted = encrypt_license_key(license_key)
            print(f"\nEncrypted license key:")
            print(encrypted)
            print()
        except Exception as e:
            print(f"\nError: {str(e)}\n")
            sys.exit(1)

    elif command == "decrypt":
        # Decrypt a license key
        if len(sys.argv) < 3:
            print("Error: Please provide an encrypted license key to decrypt")
            sys.exit(1)

        encrypted = sys.argv[2]
        try:
            decrypted = decrypt_license_key(encrypted)
            print(f"\nDecrypted license key:")
            print(decrypted)
            print()
        except Exception as e:
            print(f"\nError: {str(e)}\n")
            sys.exit(1)

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
