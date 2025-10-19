# Modular App System - Implementation Plan

## Overview
This document outlines the detailed implementation plan for adding a Docker Compose-based modular app system to the A64 Core Platform.

**Version Target:** v1.3.0 → v1.5.0
**Estimated Duration:** 1-2 weeks
**Risk Level:** MEDIUM (Security considerations)
**Breaking Changes:** NONE

---

## Table of Contents
- [Implementation Phases](#implementation-phases)
- [Phase 1: Infrastructure Foundation](#phase-1-infrastructure-foundation-v130)
- [Phase 2: Module Manager Core](#phase-2-module-manager-core-v140)
- [Phase 3: API Endpoints](#phase-3-api-endpoints-v150)
- [Phase 4: Documentation & Testing](#phase-4-documentation--testing)
- [Rollback Plan](#rollback-plan)
- [Success Criteria](#success-criteria)

---

## Implementation Phases

### Phase Overview

| Phase | Version | Duration | Risk | Dependencies |
|-------|---------|----------|------|--------------|
| Phase 1: Infrastructure | v1.3.0 | 1-2 days | LOW | None |
| Phase 2: Module Manager | v1.4.0 | 3-5 days | MEDIUM | Phase 1 |
| Phase 3: API Endpoints | v1.5.0 | 2-3 days | LOW | Phase 2 |
| Phase 4: Documentation | v1.5.0 | 1-2 days | LOW | Phase 3 |

**Total Estimated Duration:** 7-12 days (1-2 weeks)

---

## Phase 1: Infrastructure Foundation (v1.3.0)

### Goals
- Add Redis for distributed caching and rate limiting
- Add NGINX reverse proxy for centralized routing
- Enable Docker socket access for container management
- Install required Python dependencies
- Prepare database schema for modules

### Duration
**1-2 days**

### Tasks

#### Task 1.1: Add Redis Service
**File:** `docker-compose.yml`

**Action:** Add Redis service configuration

```yaml
redis:
  container_name: a64core-redis-dev
  image: redis:7-alpine
  ports:
    - "6379:6379"
  environment:
    - REDIS_PASSWORD=${REDIS_PASSWORD:-redispassword}
  command: redis-server --requirepass ${REDIS_PASSWORD:-redispassword}
  volumes:
    - redis_data:/data
  networks:
    - a64core-network
  healthcheck:
    test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 5s
  restart: unless-stopped
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

**Also add volume:**
```yaml
volumes:
  redis_data:
    driver: local
```

**Effort:** 30 minutes
**Risk:** LOW

---

#### Task 1.2: Add NGINX Reverse Proxy
**File:** `docker-compose.yml`

**Action:** Add NGINX service

```yaml
nginx:
  container_name: a64core-nginx-dev
  image: nginx:1.25-alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./nginx/ssl:/etc/nginx/ssl:ro
    - ./logs/nginx:/var/log/nginx
  networks:
    - a64core-network
  depends_on:
    - api
  healthcheck:
    test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]
    interval: 10s
    timeout: 5s
    retries: 3
  restart: unless-stopped
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

**Effort:** 1 hour (includes nginx.conf creation)
**Risk:** LOW

---

#### Task 1.3: Create NGINX Configuration
**File:** `nginx/nginx.conf` (NEW FILE)

**Action:** Create reverse proxy configuration

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log warn;

    # Security headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Upstream API
    upstream api_backend {
        server api:8000;
    }

    # Health check endpoint
    server {
        listen 80;
        server_name _;

        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }

    # Main API proxy
    server {
        listen 80;
        server_name localhost;

        # Increase timeouts for long-running operations
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;

        # API endpoints
        location /api/ {
            proxy_pass http://api_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Admin interface
        location /admin/ {
            proxy_pass http://api_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # WebSocket support (for future use)
        location /ws/ {
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Dynamic module routing (added dynamically)
        # Modules will be added here automatically
    }
}
```

**Effort:** 1 hour
**Risk:** LOW

---

#### Task 1.4: Mount Docker Socket
**File:** `docker-compose.yml`

**Action:** Add Docker socket mount to API service

```yaml
api:
  # ... existing configuration ...
  volumes:
    - ./src:/app/src
    - ./config:/app/config
    - ./logs:/app/logs
    - /var/run/docker.sock:/var/run/docker.sock  # ADD THIS LINE
  # ... rest of configuration ...
```

**Security Note:** This grants the API container Docker control. Implement strict RBAC (super_admin only) and audit logging.

**Effort:** 5 minutes
**Risk:** HIGH (Security) - Mitigated by RBAC

---

#### Task 1.5: Add Python Dependencies
**File:** `requirements.txt`

**Action:** Add new dependencies

```txt
# Existing dependencies...
fastapi==0.109.0
uvicorn==0.27.0
pydantic==2.5.3
# ... etc ...

# NEW: Module Management Dependencies
docker==7.0.0              # Docker SDK for Python
PyYAML==6.0.1              # docker-compose.yml manipulation
redis==5.0.1               # Redis client
cryptography==41.0.7       # License key encryption
jsonschema==4.20.0         # Module config validation
```

**Effort:** 10 minutes
**Risk:** LOW

---

#### Task 1.6: Create Module Database Schema
**File:** `src/services/database.py`

**Action:** Add module collection indexes

```python
async def ensure_indexes(db):
    """Create database indexes for all collections"""

    # Existing indexes...
    await db.users.create_index("email", unique=True)
    await db.users.create_index("userId", unique=True)
    # ... existing indexes ...

    # NEW: Module indexes
    await db.installed_modules.create_index("moduleName", unique=True)
    await db.installed_modules.create_index("moduleId", unique=True)
    await db.installed_modules.create_index("status")
    await db.installed_modules.create_index("installedAt", direction=-1)

    # NEW: Module audit log indexes
    await db.module_audit_log.create_index("moduleId")
    await db.module_audit_log.create_index("userId")
    await db.module_audit_log.create_index("action")
    await db.module_audit_log.create_index("timestamp", direction=-1)

    logger.info("All database indexes created successfully")
```

**Effort:** 30 minutes
**Risk:** LOW

---

#### Task 1.7: Update Environment Variables
**File:** `.env.example`

**Action:** Add module-related environment variables

```bash
# Existing variables...
ENVIRONMENT=development
DEBUG=True

# NEW: Module Management
REDIS_URL=redis://:redispassword@redis:6379/0
REDIS_PASSWORD=redispassword
MODULE_REGISTRY_PATH=config/modules.json
LICENSE_ENCRYPTION_KEY=your-32-char-encryption-key-here-change-in-production
DOCKER_REGISTRY_URL=https://registry.hub.docker.com
DOCKER_REGISTRY_USERNAME=
DOCKER_REGISTRY_PASSWORD=
MAX_MODULES=50
MODULE_INSTALL_TIMEOUT=300
```

**Effort:** 15 minutes
**Risk:** LOW

---

### Phase 1 Deliverables

- ✅ Redis service running on port 6379
- ✅ NGINX reverse proxy running on ports 80/443
- ✅ Docker socket mounted to API container
- ✅ Python dependencies installed (docker, PyYAML, redis, cryptography)
- ✅ Database indexes for modules created
- ✅ Environment variables configured

### Phase 1 Testing

```bash
# Test Redis
docker exec a64core-redis-dev redis-cli ping
# Expected: PONG

# Test NGINX
curl http://localhost/health
# Expected: healthy

# Test Docker socket
docker exec a64core-api-dev docker ps
# Expected: List of containers

# Test database indexes
docker exec a64core-mongodb-dev mongosh a64core_db --quiet --eval "db.installed_modules.getIndexes()"
# Expected: moduleName, moduleId indexes
```

### Phase 1 Rollback

If issues occur:
```bash
# Stop containers
docker-compose down

# Restore docker-compose.yml from git
git checkout docker-compose.yml

# Restart without new services
docker-compose up -d
```

---

## Phase 2: Module Manager Core (v1.4.0)

### Goals
- Create module Pydantic models
- Implement ModuleManager class
- Add license validation system
- Create module registry storage
- Implement docker-compose.yml manipulation
- Add encryption for license keys

### Duration
**3-5 days**

### Tasks

#### Task 2.1: Create Module Pydantic Models
**File:** `src/models/module.py` (NEW FILE)

**Action:** Define module data models

```python
"""
Module-related Pydantic models for the A64 Core Platform.
"""
from pydantic import BaseModel, Field, validator
from typing import Dict, List, Optional
from datetime import datetime
from enum import Enum


class ModuleStatus(str, Enum):
    """Module status enumeration"""
    PENDING = "pending"
    INSTALLING = "installing"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"
    UNINSTALLING = "uninstalling"


class ModuleHealth(str, Enum):
    """Module health status"""
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class ModuleConfig(BaseModel):
    """Module installation configuration (request body)"""

    moduleName: str = Field(
        ...,
        min_length=3,
        max_length=50,
        regex="^[a-z0-9-]+$",
        description="Module name (lowercase, alphanumeric, hyphens only)"
    )

    licenseKey: str = Field(
        ...,
        min_length=10,
        max_length=500,
        description="Module license key"
    )

    image: str = Field(
        ...,
        description="Docker image URL (e.g., myregistry/analytics:1.0.0)"
    )

    version: str = Field(
        ...,
        regex="^[0-9]+\\.[0-9]+\\.[0-9]+$",
        description="Module version (semantic versioning)"
    )

    ports: List[str] = Field(
        default_factory=list,
        description="Port mappings (e.g., ['8001:8000', '8002:8001'])"
    )

    environment: Dict[str, str] = Field(
        default_factory=dict,
        description="Environment variables for the module"
    )

    dependencies: List[str] = Field(
        default_factory=list,
        description="List of required module names"
    )

    healthCheckEndpoint: Optional[str] = Field(
        None,
        description="HTTP health check endpoint (e.g., /health)"
    )

    cpuLimit: Optional[str] = Field(
        "1.0",
        description="CPU limit (e.g., '0.5' for 50%, '2.0' for 2 CPUs)"
    )

    memoryLimit: Optional[str] = Field(
        "512m",
        regex="^[0-9]+(m|g)$",
        description="Memory limit (e.g., '512m', '1g')"
    )

    @validator('ports')
    def validate_ports(cls, v):
        """Validate port mapping format"""
        for port in v:
            if ':' not in port:
                raise ValueError(f"Invalid port mapping: {port}. Format: 'host:container'")
            parts = port.split(':')
            if len(parts) != 2:
                raise ValueError(f"Invalid port mapping: {port}")
            try:
                int(parts[0])
                int(parts[1])
            except ValueError:
                raise ValueError(f"Ports must be integers: {port}")
        return v

    @validator('image')
    def validate_image(cls, v):
        """Basic Docker image format validation"""
        if ':' not in v:
            raise ValueError("Image must include tag (e.g., myimage:1.0.0)")
        return v


class ModuleInDB(BaseModel):
    """Module representation in database"""

    moduleId: str = Field(..., description="Unique module identifier (UUID)")
    moduleName: str
    image: str
    imageTag: str
    version: str
    licenseKeyEncrypted: str = Field(..., description="Encrypted license key")
    status: ModuleStatus
    health: ModuleHealth
    ports: List[str]
    environment: Dict[str, str]
    dependencies: List[str]
    healthCheckEndpoint: Optional[str]
    cpuLimit: str
    memoryLimit: str
    installedBy: str = Field(..., description="User ID who installed")
    installedAt: datetime
    updatedAt: datetime
    lastHealthCheck: Optional[datetime] = None
    errorMessage: Optional[str] = None
    metadata: Dict = Field(default_factory=dict)


class ModuleResponse(BaseModel):
    """Module response (without sensitive data)"""

    moduleId: str
    moduleName: str
    image: str
    version: str
    status: ModuleStatus
    health: ModuleHealth
    ports: List[str]
    dependencies: List[str]
    healthCheckEndpoint: Optional[str]
    installedBy: str
    installedAt: datetime
    updatedAt: datetime
    lastHealthCheck: Optional[datetime] = None
    errorMessage: Optional[str] = None


class ModuleListResponse(BaseModel):
    """Paginated list of modules"""

    data: List[ModuleResponse]
    total: int
    page: int
    perPage: int
    totalPages: int


class ModuleStatusResponse(BaseModel):
    """Detailed module status"""

    moduleId: str
    moduleName: str
    status: ModuleStatus
    health: ModuleHealth
    containerStatus: Optional[str] = None
    uptime: Optional[int] = Field(None, description="Uptime in seconds")
    cpuUsage: Optional[float] = Field(None, description="CPU usage percentage")
    memoryUsage: Optional[str] = Field(None, description="Memory usage (e.g., '256MB')")
    lastHealthCheck: Optional[datetime] = None
    errorMessage: Optional[str] = None


class ModuleAuditLog(BaseModel):
    """Audit log entry for module operations"""

    logId: str = Field(..., description="Unique log ID (UUID)")
    moduleId: str
    moduleName: str
    userId: str
    userEmail: str
    action: str = Field(..., description="Action performed (install, uninstall, start, stop)")
    status: str = Field(..., description="Action result (success, failure)")
    details: Optional[str] = None
    errorMessage: Optional[str] = None
    timestamp: datetime
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None
```

**Effort:** 2-3 hours
**Risk:** LOW

---

#### Task 2.2: Create Encryption Utility
**File:** `src/utils/encryption.py` (NEW FILE)

**Action:** Implement license key encryption

```python
"""
Encryption utilities for sensitive data (license keys, secrets).
Uses Fernet (symmetric encryption) from cryptography library.
"""
import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
from typing import str as String

# Get encryption key from environment
ENCRYPTION_KEY = os.getenv("LICENSE_ENCRYPTION_KEY", "change-this-in-production-32chars")


def _get_fernet_key() -> bytes:
    """
    Generate Fernet key from environment secret.
    Uses PBKDF2 to derive a proper 32-byte key.
    """
    # Ensure key is 32 bytes
    salt = b"a64platform_module_license_salt"
    kdf = PBKDF2(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = kdf.derive(ENCRYPTION_KEY.encode())
    return base64.urlsafe_b64encode(key)


def encrypt_license_key(license_key: String) -> String:
    """
    Encrypt a license key for storage.

    Args:
        license_key: Plain text license key

    Returns:
        Encrypted license key (base64 encoded)

    Example:
        encrypted = encrypt_license_key("ABC-123-XYZ")
    """
    fernet = Fernet(_get_fernet_key())
    encrypted_bytes = fernet.encrypt(license_key.encode())
    return encrypted_bytes.decode()


def decrypt_license_key(encrypted_license_key: String) -> String:
    """
    Decrypt a license key.

    Args:
        encrypted_license_key: Encrypted license key (base64 encoded)

    Returns:
        Plain text license key

    Raises:
        cryptography.fernet.InvalidToken: If decryption fails

    Example:
        plain = decrypt_license_key(encrypted)
    """
    fernet = Fernet(_get_fernet_key())
    decrypted_bytes = fernet.decrypt(encrypted_license_key.encode())
    return decrypted_bytes.decode()


def validate_encryption_key():
    """
    Validate that encryption key is set and secure.
    Raises exception if key is insecure.
    """
    if ENCRYPTION_KEY == "change-this-in-production-32chars":
        raise ValueError(
            "LICENSE_ENCRYPTION_KEY is set to default value. "
            "Change this in production for security!"
        )

    if len(ENCRYPTION_KEY) < 32:
        raise ValueError(
            "LICENSE_ENCRYPTION_KEY must be at least 32 characters long"
        )
```

**Effort:** 1-2 hours
**Risk:** LOW

---

#### Task 2.3: Create License Validator
**File:** `src/utils/license_validator.py` (NEW FILE)

**Action:** Implement license validation logic

```python
"""
License validation utilities for module installation.
Supports multiple validation strategies.
"""
import re
import hashlib
import requests
from typing import Optional, Tuple
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class LicenseValidationError(Exception):
    """Exception raised when license validation fails"""
    pass


class LicenseValidator:
    """
    License validator supporting multiple validation strategies:
    1. Format validation (basic pattern matching)
    2. Offline validation (checksum/signature)
    3. Online validation (external license server)
    """

    def __init__(self, license_server_url: Optional[str] = None):
        """
        Initialize license validator.

        Args:
            license_server_url: URL of external license validation server (optional)
        """
        self.license_server_url = license_server_url

    def validate_license(
        self,
        license_key: str,
        module_name: str,
        validation_mode: str = "format"
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate a license key.

        Args:
            license_key: License key to validate
            module_name: Module name
            validation_mode: Validation mode ('format', 'offline', 'online')

        Returns:
            Tuple of (is_valid, error_message)

        Example:
            is_valid, error = validator.validate_license("ABC-123-XYZ", "analytics")
            if not is_valid:
                raise LicenseValidationError(error)
        """
        try:
            if validation_mode == "format":
                return self._validate_format(license_key)
            elif validation_mode == "offline":
                return self._validate_offline(license_key, module_name)
            elif validation_mode == "online":
                return self._validate_online(license_key, module_name)
            else:
                return False, f"Unknown validation mode: {validation_mode}"

        except Exception as e:
            logger.error(f"License validation error: {e}")
            return False, str(e)

    def _validate_format(self, license_key: str) -> Tuple[bool, Optional[str]]:
        """
        Basic format validation.
        Checks if license key matches expected pattern.

        Format: XXX-YYY-ZZZ or similar patterns
        """
        # Pattern 1: XXX-YYY-ZZZ (alphanumeric segments separated by dashes)
        pattern1 = r"^[A-Z0-9]{3,}-[A-Z0-9]{3,}-[A-Z0-9]{3,}$"

        # Pattern 2: UUID format
        pattern2 = r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"

        # Pattern 3: Long alphanumeric (API key style)
        pattern3 = r"^[A-Za-z0-9]{20,}$"

        if re.match(pattern1, license_key, re.IGNORECASE):
            return True, None
        elif re.match(pattern2, license_key, re.IGNORECASE):
            return True, None
        elif re.match(pattern3, license_key):
            return True, None
        else:
            return False, "License key format is invalid. Expected formats: XXX-YYY-ZZZ, UUID, or long alphanumeric string"

    def _validate_offline(self, license_key: str, module_name: str) -> Tuple[bool, Optional[str]]:
        """
        Offline validation using checksum/signature.

        Simple implementation: validates checksum embedded in license key.
        Format: {module_name}-{timestamp}-{checksum}

        In production, replace with proper signature verification (RSA, ECDSA).
        """
        # First check format
        format_valid, format_error = self._validate_format(license_key)
        if not format_valid:
            return False, format_error

        # Parse license key
        # Expected format: MODULE-TIMESTAMP-CHECKSUM
        parts = license_key.upper().split('-')
        if len(parts) < 3:
            return False, "License key format invalid for offline validation"

        # Extract components
        key_module = parts[0]
        key_timestamp = parts[1]
        key_checksum = parts[2]

        # Validate module name matches
        if key_module.upper() != module_name.upper():
            return False, f"License key is for module '{key_module}', not '{module_name}'"

        # Validate checksum
        # Simple checksum: SHA256 of module_name + timestamp
        expected_checksum = hashlib.sha256(
            f"{key_module}{key_timestamp}".encode()
        ).hexdigest()[:10].upper()

        if key_checksum != expected_checksum:
            return False, "License key checksum validation failed"

        return True, None

    def _validate_online(self, license_key: str, module_name: str) -> Tuple[bool, Optional[str]]:
        """
        Online validation via external license server.

        Sends license key to validation server and checks response.
        """
        if not self.license_server_url:
            return False, "Online validation requires license server URL"

        # First check format
        format_valid, format_error = self._validate_format(license_key)
        if not format_valid:
            return False, format_error

        try:
            # Call license validation API
            response = requests.post(
                f"{self.license_server_url}/validate",
                json={
                    "license_key": license_key,
                    "module_name": module_name,
                    "timestamp": datetime.utcnow().isoformat()
                },
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("valid"):
                    return True, None
                else:
                    return False, data.get("error", "License validation failed")
            else:
                return False, f"License server returned status {response.status_code}"

        except requests.exceptions.Timeout:
            return False, "License server timeout"
        except requests.exceptions.RequestException as e:
            return False, f"License server error: {str(e)}"

    def generate_test_license(self, module_name: str) -> str:
        """
        Generate a test license key (for development/testing only).

        Args:
            module_name: Module name

        Returns:
            Valid test license key

        WARNING: Only use in development! Remove in production.
        """
        timestamp = datetime.utcnow().strftime("%Y%m%d")
        checksum = hashlib.sha256(
            f"{module_name.upper()}{timestamp}".encode()
        ).hexdigest()[:10].upper()

        return f"{module_name.upper()}-{timestamp}-{checksum}"


# Singleton instance
_validator = LicenseValidator(
    license_server_url=None  # Set from environment if needed
)


def validate_license(license_key: str, module_name: str) -> Tuple[bool, Optional[str]]:
    """
    Convenience function for license validation.

    Uses format validation by default (most permissive).
    For production, change to 'offline' or 'online' mode.
    """
    return _validator.validate_license(
        license_key,
        module_name,
        validation_mode="format"  # Change to 'offline' or 'online' in production
    )
```

**Effort:** 3-4 hours
**Risk:** MEDIUM

---

#### Task 2.4: Create ModuleManager Class (Part 1 - Core)
**File:** `src/services/module_manager.py` (NEW FILE)

**Action:** Implement ModuleManager class (first half)

*This is a large file - I'll create it in the next step*

**Effort:** 6-8 hours
**Risk:** HIGH

---

### Phase 2 Continued in Next Response...

Due to length, I'll continue with the complete ModuleManager implementation and remaining phases. Shall I proceed?