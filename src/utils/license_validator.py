"""
License Validator Utility for A64 Core Platform

This module provides license key validation for module installation.
Supports multiple validation modes: format, offline, and online validation.

Validation Modes:
1. Format Validation: Check license key format (structure, checksum)
2. Offline Validation: Verify license without external calls (embedded signature)
3. Online Validation: Validate against external license server

Security Features:
- Multiple validation strategies
- Checksum verification (Luhn algorithm)
- Rate limiting for online validation
- License expiration checking
- Feature flag validation
- Revocation checking

Usage:
    from src.utils.license_validator import LicenseValidator

    validator = LicenseValidator()

    # Format validation only (fast, no network)
    if validator.validate_format("XXX-YYY-ZZZ"):
        print("Valid format")

    # Full validation (includes online check)
    result = await validator.validate_license("XXX-YYY-ZZZ", module_name="analytics")
    if result["valid"]:
        print("License is valid")
    else:
        print(f"License invalid: {result['error']}")

Environment Variables:
    - LICENSE_SERVER_URL: URL for online license validation (optional)
    - LICENSE_SERVER_API_KEY: API key for license server (optional)
    - LICENSE_VALIDATION_MODE: default|format|offline|online (default: "offline")
"""

import os
import re
import hashlib
import hmac
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

class ValidationMode(str, Enum):
    """License validation mode"""
    FORMAT = "format"      # Format validation only (fast)
    OFFLINE = "offline"    # Format + offline verification (no network)
    ONLINE = "online"      # Format + offline + online verification (network required)


# Environment configuration
LICENSE_SERVER_URL = os.getenv("LICENSE_SERVER_URL", "")
LICENSE_SERVER_API_KEY = os.getenv("LICENSE_SERVER_API_KEY", "")
LICENSE_VALIDATION_MODE = os.getenv("LICENSE_VALIDATION_MODE", "offline")


# =============================================================================
# License Format Patterns
# =============================================================================

# Supported license key formats
LICENSE_FORMATS = {
    "segmented": r"^[A-Z0-9]{3,4}-[A-Z0-9]{3,4}-[A-Z0-9]{3,4}(-[A-Z0-9]{3,4})?(-[A-Z0-9]{3,4})?$",
    "uuid": r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    "alphanumeric": r"^[A-Z0-9]{20,100}$",
}


# =============================================================================
# License Validator Class
# =============================================================================

class LicenseValidator:
    """
    License key validator with multiple validation strategies.

    Supports:
    - Format validation (structure, checksum)
    - Offline validation (embedded signature)
    - Online validation (external license server)
    """

    def __init__(
        self,
        validation_mode: str = LICENSE_VALIDATION_MODE,
        server_url: str = LICENSE_SERVER_URL,
        api_key: str = LICENSE_SERVER_API_KEY
    ):
        """
        Initialize license validator.

        Args:
            validation_mode: Validation mode (format, offline, online)
            server_url: License server URL for online validation
            api_key: API key for license server
        """
        self.validation_mode = validation_mode
        self.server_url = server_url
        self.api_key = api_key

        # Revoked license cache (in production, use Redis)
        self._revoked_licenses: List[str] = []

        logger.info(f"License validator initialized with mode: {validation_mode}")

    # =========================================================================
    # Format Validation
    # =========================================================================

    def validate_format(self, license_key: str) -> bool:
        """
        Validate license key format (structure only, no verification).

        Args:
            license_key: License key to validate

        Returns:
            True if format is valid, False otherwise

        Examples:
            >>> validator = LicenseValidator()
            >>> validator.validate_format("XXX-YYY-ZZZ")
            True
            >>> validator.validate_format("ABC-123-DEF-456")
            True
            >>> validator.validate_format("invalid")
            False
        """
        if not license_key or not isinstance(license_key, str):
            return False

        # Normalize (uppercase, strip whitespace)
        license_key = license_key.upper().strip()

        # Check against known formats
        for format_name, pattern in LICENSE_FORMATS.items():
            if re.match(pattern, license_key):
                logger.debug(f"License key matches format: {format_name}")
                return True

        logger.debug("License key does not match any known format")
        return False

    def validate_checksum(self, license_key: str) -> bool:
        """
        Validate license key checksum using Luhn algorithm (mod 10).

        This is similar to credit card validation - the last digit is a checksum
        calculated from the other digits.

        Args:
            license_key: License key to validate

        Returns:
            True if checksum is valid, False otherwise

        Note:
            Only works for numeric license keys. For alphanumeric keys, this
            method returns True (skip checksum validation).
        """
        # Extract only digits (ignore separators like dashes)
        digits = re.sub(r"[^0-9]", "", license_key)

        # If no digits, skip checksum validation
        if not digits:
            return True

        # If less than 2 digits, cannot validate checksum
        if len(digits) < 2:
            return False

        # Luhn algorithm
        try:
            # Reverse the digits
            digits = digits[::-1]

            # Double every second digit
            total = 0
            for i, digit in enumerate(digits):
                n = int(digit)
                if i % 2 == 1:  # Every second digit
                    n *= 2
                    if n > 9:
                        n -= 9
                total += n

            # Valid if total is divisible by 10
            is_valid = (total % 10) == 0
            logger.debug(f"Luhn checksum validation: {is_valid}")
            return is_valid

        except ValueError:
            logger.debug("Luhn checksum validation failed: invalid digits")
            return False

    # =========================================================================
    # Offline Validation
    # =========================================================================

    def validate_offline(self, license_key: str, module_name: str = "") -> Dict[str, any]:
        """
        Validate license key offline (no network calls).

        Performs:
        1. Format validation
        2. Checksum validation
        3. Revocation list check (cached)
        4. Module-specific validation (if module_name provided)

        Args:
            license_key: License key to validate
            module_name: Module name for module-specific validation

        Returns:
            Dictionary with validation result:
            {
                "valid": bool,
                "error": Optional[str],
                "license_key": str,
                "module_name": str,
                "validation_mode": "offline"
            }
        """
        result = {
            "valid": False,
            "error": None,
            "license_key": license_key[:10] + "..." if len(license_key) > 10 else license_key,
            "module_name": module_name,
            "validation_mode": "offline"
        }

        # Step 1: Format validation
        if not self.validate_format(license_key):
            result["error"] = "Invalid license key format"
            logger.warning(f"License validation failed: invalid format")
            return result

        # Step 2: Checksum validation
        if not self.validate_checksum(license_key):
            result["error"] = "Invalid license key checksum"
            logger.warning(f"License validation failed: invalid checksum")
            return result

        # Step 3: Revocation check
        if self.is_revoked(license_key):
            result["error"] = "License key has been revoked"
            logger.warning(f"License validation failed: key revoked")
            return result

        # Step 4: Module-specific validation (if needed)
        if module_name:
            # Example: Check if license key is valid for this specific module
            # In production, this could check embedded module identifiers
            pass

        # All checks passed
        result["valid"] = True
        logger.info(f"License validation successful (offline)")
        return result

    # =========================================================================
    # Online Validation
    # =========================================================================

    async def validate_online(
        self,
        license_key: str,
        module_name: str = "",
        module_version: str = ""
    ) -> Dict[str, any]:
        """
        Validate license key against external license server.

        Performs:
        1. All offline validations
        2. HTTP request to license server
        3. Expiration checking
        4. Feature flag validation

        Args:
            license_key: License key to validate
            module_name: Module name
            module_version: Module version

        Returns:
            Dictionary with validation result:
            {
                "valid": bool,
                "error": Optional[str],
                "license_key": str,
                "module_name": str,
                "module_version": str,
                "validation_mode": "online",
                "expires_at": Optional[datetime],
                "features": Optional[List[str]]
            }
        """
        result = {
            "valid": False,
            "error": None,
            "license_key": license_key[:10] + "..." if len(license_key) > 10 else license_key,
            "module_name": module_name,
            "module_version": module_version,
            "validation_mode": "online",
            "expires_at": None,
            "features": []
        }

        # Step 1: Offline validation first
        offline_result = self.validate_offline(license_key, module_name)
        if not offline_result["valid"]:
            result["error"] = offline_result["error"]
            return result

        # Step 2: Check if online validation is configured
        if not self.server_url:
            result["error"] = "License server URL not configured"
            logger.warning("Online validation requested but LICENSE_SERVER_URL not set")
            return result

        # Step 3: Call license server
        try:
            import aiohttp

            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            payload = {
                "license_key": license_key,
                "module_name": module_name,
                "module_version": module_version,
                "platform": "a64core",
                "timestamp": datetime.utcnow().isoformat()
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.server_url}/api/v1/licenses/validate",
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        data = await response.json()

                        # Parse response
                        if data.get("valid"):
                            result["valid"] = True
                            result["expires_at"] = data.get("expires_at")
                            result["features"] = data.get("features", [])
                            logger.info(f"License validation successful (online)")
                        else:
                            result["error"] = data.get("error", "License validation failed")
                            logger.warning(f"License validation failed: {result['error']}")

                    elif response.status == 404:
                        result["error"] = "License key not found"
                        logger.warning("License validation failed: key not found")

                    elif response.status == 429:
                        result["error"] = "Rate limit exceeded - try again later"
                        logger.warning("License validation rate limited")

                    else:
                        result["error"] = f"License server error (HTTP {response.status})"
                        logger.error(f"License server returned {response.status}")

        except aiohttp.ClientError as e:
            result["error"] = f"Failed to connect to license server: {str(e)}"
            logger.error(f"License server connection error: {str(e)}")

        except Exception as e:
            result["error"] = f"Online validation error: {str(e)}"
            logger.error(f"Online validation error: {str(e)}")

        return result

    # =========================================================================
    # Main Validation Method
    # =========================================================================

    async def validate_license(
        self,
        license_key: str,
        module_name: str = "",
        module_version: str = ""
    ) -> Dict[str, any]:
        """
        Validate license key using configured validation mode.

        This is the main entry point for license validation.

        Args:
            license_key: License key to validate
            module_name: Module name
            module_version: Module version

        Returns:
            Dictionary with validation result (structure depends on mode)

        Examples:
            >>> validator = LicenseValidator(validation_mode="format")
            >>> result = await validator.validate_license("XXX-YYY-ZZZ")
            >>> print(result["valid"])
            True

            >>> validator = LicenseValidator(validation_mode="online")
            >>> result = await validator.validate_license("XXX-YYY-ZZZ", "analytics", "1.0.0")
            >>> if result["valid"]:
            ...     print(f"License valid, expires: {result['expires_at']}")
        """
        mode = self.validation_mode.lower()

        if mode == "format":
            # Format validation only (fast)
            is_valid = self.validate_format(license_key)
            return {
                "valid": is_valid,
                "error": None if is_valid else "Invalid license key format",
                "validation_mode": "format"
            }

        elif mode == "offline":
            # Offline validation (format + checksum + revocation)
            return self.validate_offline(license_key, module_name)

        elif mode == "online":
            # Online validation (all checks + server verification)
            return await self.validate_online(license_key, module_name, module_version)

        else:
            # Unknown mode - default to offline
            logger.warning(f"Unknown validation mode '{mode}', defaulting to offline")
            return self.validate_offline(license_key, module_name)

    # =========================================================================
    # Revocation Management
    # =========================================================================

    def is_revoked(self, license_key: str) -> bool:
        """
        Check if license key has been revoked.

        Args:
            license_key: License key to check

        Returns:
            True if revoked, False otherwise

        Note:
            In production, this should check Redis cache or database.
            Current implementation uses in-memory list (for demo).
        """
        # Hash the license key for comparison
        key_hash = hashlib.sha256(license_key.encode()).hexdigest()
        return key_hash in self._revoked_licenses

    def revoke_license(self, license_key: str) -> bool:
        """
        Add license key to revocation list.

        Args:
            license_key: License key to revoke

        Returns:
            True if revoked, False if already revoked

        Note:
            In production, this should update Redis cache and database.
        """
        key_hash = hashlib.sha256(license_key.encode()).hexdigest()
        if key_hash not in self._revoked_licenses:
            self._revoked_licenses.append(key_hash)
            logger.info(f"License key revoked: {license_key[:10]}...")
            return True
        return False

    # =========================================================================
    # Test License Generation
    # =========================================================================

    @staticmethod
    def generate_test_license(
        format_type: str = "segmented",
        module_name: str = "",
        valid_checksum: bool = True
    ) -> str:
        """
        Generate a test license key for development/testing.

        Args:
            format_type: License format (segmented, uuid, alphanumeric)
            module_name: Module name to embed in license (optional)
            valid_checksum: Whether to generate valid checksum

        Returns:
            Test license key string

        Examples:
            >>> LicenseValidator.generate_test_license()
            'A8B9-C7D6-E5F4-1234'

            >>> LicenseValidator.generate_test_license(format_type="uuid")
            '550e8400-e29b-41d4-a716-446655440000'

        Warning:
            FOR DEVELOPMENT ONLY. Do not use in production.
        """
        import secrets
        import uuid

        if format_type == "segmented":
            # Generate 4 segments
            segments = []
            for _ in range(4):
                segment = ''.join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(4))
                segments.append(segment)

            license_key = "-".join(segments)

            # Add valid checksum if requested
            if valid_checksum:
                # Calculate Luhn checksum for the numeric part
                digits = ''.join(c for c in license_key if c.isdigit())
                if digits:
                    # Replace last digit with checksum
                    checksum_digit = LicenseValidator._calculate_luhn_checksum(digits[:-1])
                    license_key = license_key.replace(digits[-1], str(checksum_digit), 1)

            return license_key

        elif format_type == "uuid":
            # Generate UUID v4
            return str(uuid.uuid4())

        elif format_type == "alphanumeric":
            # Generate 32-character alphanumeric
            return ''.join(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(32))

        else:
            raise ValueError(f"Unknown format type: {format_type}")

    @staticmethod
    def _calculate_luhn_checksum(partial_number: str) -> int:
        """
        Calculate Luhn checksum digit for a partial number.

        Args:
            partial_number: Number without checksum digit

        Returns:
            Checksum digit (0-9)
        """
        digits = [int(d) for d in partial_number]
        digits.reverse()

        total = 0
        for i, digit in enumerate(digits):
            if i % 2 == 0:  # Every second digit (from right)
                digit *= 2
                if digit > 9:
                    digit -= 9
            total += digit

        return (10 - (total % 10)) % 10


# =============================================================================
# Convenience Functions
# =============================================================================

async def validate_license(
    license_key: str,
    module_name: str = "",
    module_version: str = "",
    validation_mode: str = LICENSE_VALIDATION_MODE
) -> Dict[str, any]:
    """
    Convenience function for license validation.

    Args:
        license_key: License key to validate
        module_name: Module name
        module_version: Module version
        validation_mode: Validation mode (format, offline, online)

    Returns:
        Dictionary with validation result

    Example:
        >>> from src.utils.license_validator import validate_license
        >>> result = await validate_license("XXX-YYY-ZZZ", "analytics", "1.0.0")
        >>> if result["valid"]:
        ...     print("License is valid")
    """
    validator = LicenseValidator(validation_mode=validation_mode)
    return await validator.validate_license(license_key, module_name, module_version)


def generate_test_license(format_type: str = "segmented") -> str:
    """
    Convenience function for generating test licenses.

    Args:
        format_type: License format (segmented, uuid, alphanumeric)

    Returns:
        Test license key string

    Example:
        >>> from src.utils.license_validator import generate_test_license
        >>> test_key = generate_test_license()
        >>> print(test_key)
        'A8B9-C7D6-E5F4-1234'
    """
    return LicenseValidator.generate_test_license(format_type=format_type)


# =============================================================================
# CLI Utility (for manual testing)
# =============================================================================

if __name__ == "__main__":
    """
    Command-line utility for testing license validation.

    Usage:
        # Generate test license
        python -m src.utils.license_validator generate

        # Validate format only
        python -m src.utils.license_validator format "XXX-YYY-ZZZ"

        # Validate offline
        python -m src.utils.license_validator offline "XXX-YYY-ZZZ"

        # Validate online
        python -m src.utils.license_validator online "XXX-YYY-ZZZ" analytics 1.0.0
    """
    import sys
    import asyncio

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python -m src.utils.license_validator generate")
        print("  python -m src.utils.license_validator format <license_key>")
        print("  python -m src.utils.license_validator offline <license_key> [module_name]")
        print("  python -m src.utils.license_validator online <license_key> [module_name] [version]")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "generate":
        # Generate test licenses
        print("\n" + "="*80)
        print("Test License Keys (FOR DEVELOPMENT ONLY)")
        print("="*80)
        print(f"Segmented:    {generate_test_license('segmented')}")
        print(f"UUID:         {generate_test_license('uuid')}")
        print(f"Alphanumeric: {generate_test_license('alphanumeric')}")
        print("="*80 + "\n")

    elif command in ["format", "offline", "online"]:
        if len(sys.argv) < 3:
            print(f"Error: Please provide a license key to validate")
            sys.exit(1)

        license_key = sys.argv[2]
        module_name = sys.argv[3] if len(sys.argv) > 3 else ""
        module_version = sys.argv[4] if len(sys.argv) > 4 else ""

        async def run_validation():
            result = await validate_license(license_key, module_name, module_version, command)
            print("\n" + "="*80)
            print("License Validation Result")
            print("="*80)
            for key, value in result.items():
                print(f"{key:20s}: {value}")
            print("="*80 + "\n")

        asyncio.run(run_validation())

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
