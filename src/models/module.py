"""
Module Data Models for A64 Core Platform

This module defines Pydantic models for the Docker Compose-based modular app system.
These models handle module configuration, installation, status tracking, and audit logging.

Security Notes:
- License keys are stored encrypted in database (ModuleInDB)
- License keys are NEVER exposed in API responses (ModuleResponse)
- All module operations are logged for audit trail (ModuleAuditLog)
- Only super_admin role can install/uninstall modules
"""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, validator, root_validator
import re


# =============================================================================
# Enums
# =============================================================================

class ModuleStatus(str, Enum):
    """Module lifecycle status"""
    PENDING = "pending"           # Installation queued
    INSTALLING = "installing"     # Currently being installed
    RUNNING = "running"           # Successfully running
    STOPPED = "stopped"           # Stopped but installed
    ERROR = "error"               # Installation or runtime error
    UNINSTALLING = "uninstalling" # Currently being removed


class ModuleHealth(str, Enum):
    """Module health status"""
    HEALTHY = "healthy"       # Container is running and responding
    UNHEALTHY = "unhealthy"   # Container is running but not responding
    UNKNOWN = "unknown"       # Health check not configured or status unknown


# =============================================================================
# Request/Response Models
# =============================================================================

class ModuleConfig(BaseModel):
    """
    Module installation configuration (Request body for POST /api/v1/modules/install)

    This model validates the module installation request from the user.
    """
    module_name: str = Field(
        ...,
        description="Unique module name (lowercase, alphanumeric, hyphens only)",
        min_length=3,
        max_length=50,
        example="analytics-dashboard"
    )

    display_name: str = Field(
        ...,
        description="Human-readable module name",
        min_length=3,
        max_length=100,
        example="Analytics Dashboard"
    )

    description: Optional[str] = Field(
        None,
        description="Module description",
        max_length=500,
        example="Real-time analytics and reporting dashboard"
    )

    docker_image: str = Field(
        ...,
        description="Docker image with tag (e.g., myregistry.com/analytics:1.0.0)",
        min_length=5,
        max_length=255,
        example="myregistry.com/analytics:1.0.0"
    )

    version: str = Field(
        ...,
        description="Module semantic version (e.g., 1.0.0)",
        pattern=r"^\d+\.\d+\.\d+$",
        example="1.0.0"
    )

    license_key: str = Field(
        ...,
        description="Module license key (will be encrypted in database)",
        min_length=10,
        max_length=500,
        example="XXX-YYY-ZZZ-AAA-BBB"
    )

    ports: Optional[List[str]] = Field(
        default_factory=list,
        description="Port mappings in format 'host:container' (e.g., ['8001:8000'])",
        example=["8001:8000", "8002:8080"]
    )

    environment: Optional[Dict[str, str]] = Field(
        default_factory=dict,
        description="Environment variables for the module",
        example={"DATABASE_URL": "mongodb://mongodb:27017/analytics", "DEBUG": "false"}
    )

    volumes: Optional[List[str]] = Field(
        default_factory=list,
        description="Volume mappings (e.g., ['./data:/app/data'])",
        example=["./modules/analytics/data:/app/data"]
    )

    cpu_limit: str = Field(
        default="1.0",
        description="CPU limit (e.g., '1.0' for 1 core, '0.5' for half core)",
        pattern=r"^\d+(\.\d+)?$",
        example="1.0"
    )

    memory_limit: str = Field(
        default="512m",
        description="Memory limit (e.g., '512m', '1g')",
        pattern=r"^\d+(m|g)$",
        example="512m"
    )

    network_mode: Optional[str] = Field(
        default="a64core-network",
        description="Docker network mode (default: a64core-network)",
        example="a64core-network"
    )

    depends_on: Optional[List[str]] = Field(
        default_factory=list,
        description="List of services this module depends on",
        example=["mongodb", "redis"]
    )

    health_check: Optional[Dict[str, str]] = Field(
        None,
        description="Container health check configuration",
        example={
            "test": "curl -f http://localhost:8000/health || exit 1",
            "interval": "30s",
            "timeout": "10s",
            "retries": "3",
            "start_period": "40s"
        }
    )

    route_prefix: Optional[str] = Field(
        None,
        description="NGINX route prefix (e.g., '/analytics')",
        pattern=r"^/[a-z0-9\-]+$",
        example="/analytics"
    )

    security_profile: Optional[str] = Field(
        default="auto",
        description="Security profile: 'strict' (run as UID 1000, drop caps), 'relaxed' (run as root), 'auto' (detect from image labels)",
        pattern=r"^(strict|relaxed|auto)$",
        example="auto"
    )

    @validator("module_name")
    def validate_module_name(cls, v):
        """Validate module name format"""
        if not re.match(r"^[a-z0-9\-]+$", v):
            raise ValueError("Module name must be lowercase, alphanumeric, and hyphens only")
        if v.startswith("-") or v.endswith("-"):
            raise ValueError("Module name cannot start or end with hyphen")
        return v

    @validator("docker_image")
    def validate_docker_image(cls, v):
        """Validate Docker image format and ensure tag is specified"""
        if ":latest" in v.lower():
            raise ValueError("Using 'latest' tag is not allowed for security reasons. Specify exact version.")

        # Docker image format: [registry[:port]/][namespace/]repository:tag
        # Examples:
        #   nginx:1.25
        #   localhost:5000/example-app:1.0.0
        #   docker.io/library/nginx:1.25
        #   ghcr.io/owner/repo:v1.0.0

        # Split by last colon to separate tag
        if ":" not in v:
            raise ValueError("Docker image must include a tag (e.g., myimage:1.0.0)")

        # Validate format: allows registry with port (localhost:5000) and tag
        # Pattern explanation:
        # ^[a-z0-9\.\-_:]+/ - Optional registry with optional port
        # [a-z0-9\.\-_/]+ - Repository path (can have multiple /)
        # :[a-z0-9\.\-_]+ - Tag (required)
        if not re.match(r"^([a-z0-9\.\-_]+(:[\d]+)?/)?[a-z0-9\.\-_/]+:[a-z0-9\.\-_]+$", v, re.IGNORECASE):
            raise ValueError("Invalid Docker image format")

        return v

    @validator("ports")
    def validate_ports(cls, v):
        """Validate port mapping format"""
        if v:
            for port_mapping in v:
                if not re.match(r"^\d+:\d+$", port_mapping):
                    raise ValueError(f"Invalid port mapping format: {port_mapping}. Use 'host:container' (e.g., '8001:8000')")
                host_port, container_port = port_mapping.split(":")
                if not (1 <= int(host_port) <= 65535):
                    raise ValueError(f"Invalid host port: {host_port}. Must be between 1-65535")
                if not (1 <= int(container_port) <= 65535):
                    raise ValueError(f"Invalid container port: {container_port}. Must be between 1-65535")
        return v

    @validator("environment")
    def validate_environment(cls, v):
        """Validate environment variables"""
        if v:
            # Check for common secrets that should use secret management
            dangerous_keys = ["PASSWORD", "SECRET", "KEY", "TOKEN", "CREDENTIAL"]
            for env_key in v.keys():
                if any(danger in env_key.upper() for danger in dangerous_keys):
                    # This is just a warning - in production, use proper secret management
                    pass
        return v

    class Config:
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "module_name": "analytics-dashboard",
                "display_name": "Analytics Dashboard",
                "description": "Real-time analytics and reporting dashboard",
                "docker_image": "myregistry.com/analytics:1.0.0",
                "version": "1.0.0",
                "license_key": "XXX-YYY-ZZZ-AAA-BBB",
                "ports": ["8001:8000"],
                "environment": {
                    "DATABASE_URL": "mongodb://mongodb:27017/analytics",
                    "REDIS_URL": "redis://:redispassword@redis:6379/1"
                },
                "cpu_limit": "1.0",
                "memory_limit": "512m",
                "route_prefix": "/analytics"
            }
        }


class ModuleInDB(BaseModel):
    """
    Module representation in database (MongoDB: installed_modules collection)

    This model includes the encrypted license key and full installation metadata.
    NEVER expose this model directly in API responses.
    """
    module_name: str
    display_name: str
    description: Optional[str] = None
    docker_image: str
    version: str
    license_key_encrypted: str  # Encrypted with Fernet
    ports: List[str] = Field(default_factory=list)
    allocated_ports: Dict[str, int] = Field(
        default_factory=dict,
        description="Auto-allocated ports mapping: {internal_port: external_port}"
    )  # e.g., {"8080": 9001, "3000": 9002}
    environment: Dict[str, str] = Field(default_factory=dict)
    volumes: List[str] = Field(default_factory=list)
    cpu_limit: str = "1.0"
    memory_limit: str = "512m"
    network_mode: str = "a64core-network"
    depends_on: List[str] = Field(default_factory=list)
    health_check: Optional[Dict[str, str]] = None
    route_prefix: Optional[str] = None
    proxy_route: Optional[str] = Field(
        None,
        description="Reverse proxy route path (e.g., /example-app)"
    )

    # Metadata
    status: ModuleStatus = ModuleStatus.PENDING
    health: ModuleHealth = ModuleHealth.UNKNOWN
    container_id: Optional[str] = None
    container_name: Optional[str] = None

    # Audit fields
    installed_by_user_id: str
    installed_by_email: str
    installed_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Error tracking
    error_message: Optional[str] = None
    error_count: int = 0
    last_error_at: Optional[datetime] = None

    class Config:
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "module_name": "analytics-dashboard",
                "display_name": "Analytics Dashboard",
                "docker_image": "myregistry.com/analytics:1.0.0",
                "version": "1.0.0",
                "license_key_encrypted": "gAAAAABf...",  # Fernet encrypted
                "status": "running",
                "installed_by_user_id": "0224a4f2-916d-4434-8f50-871fa9f65cd6",
                "installed_by_email": "admin@a64platform.com"
            }
        }


class ModuleResponse(BaseModel):
    """
    Module response for API (GET /api/v1/modules/installed)

    This model is safe to return in API responses - excludes sensitive data.
    NEVER include license_key_encrypted in this model.
    """
    module_name: str
    display_name: str
    description: Optional[str] = None
    docker_image: str
    version: str
    status: ModuleStatus
    health: ModuleHealth
    container_id: Optional[str] = None
    container_name: Optional[str] = None
    ports: List[str] = Field(default_factory=list)
    route_prefix: Optional[str] = None
    cpu_limit: str
    memory_limit: str

    # Audit fields (safe to expose)
    installed_by_email: str
    installed_at: datetime
    updated_at: datetime

    # Error info (if applicable)
    error_message: Optional[str] = None

    class Config:
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "module_name": "analytics-dashboard",
                "display_name": "Analytics Dashboard",
                "description": "Real-time analytics and reporting dashboard",
                "docker_image": "myregistry.com/analytics:1.0.0",
                "version": "1.0.0",
                "status": "running",
                "health": "healthy",
                "container_id": "abc123def456",
                "container_name": "a64core-analytics-dashboard",
                "ports": ["8001:8000"],
                "route_prefix": "/analytics",
                "cpu_limit": "1.0",
                "memory_limit": "512m",
                "installed_by_email": "admin@a64platform.com",
                "installed_at": "2025-10-17T10:30:00.000Z",
                "updated_at": "2025-10-17T10:30:00.000Z"
            }
        }


class ModuleListResponse(BaseModel):
    """Paginated list of installed modules"""
    data: List[ModuleResponse]
    meta: Dict[str, int] = Field(
        description="Pagination metadata",
        example={
            "total": 5,
            "page": 1,
            "per_page": 20,
            "total_pages": 1
        }
    )

    class Config:
        json_schema_extra = {
            "example": {
                "data": [
                    {
                        "module_name": "analytics-dashboard",
                        "display_name": "Analytics Dashboard",
                        "version": "1.0.0",
                        "status": "running",
                        "health": "healthy"
                    }
                ],
                "meta": {
                    "total": 5,
                    "page": 1,
                    "per_page": 20,
                    "total_pages": 1
                }
            }
        }


class ModuleStatusResponse(BaseModel):
    """
    Detailed module status (GET /api/v1/modules/{module_name}/status)

    Includes runtime metrics and resource usage.
    """
    module_name: str
    display_name: str
    status: ModuleStatus
    health: ModuleHealth
    container_id: Optional[str] = None
    container_name: Optional[str] = None

    # Runtime info
    uptime_seconds: Optional[int] = None
    restart_count: int = 0

    # Resource usage
    cpu_usage_percent: Optional[float] = None
    memory_usage_mb: Optional[float] = None
    memory_limit_mb: Optional[float] = None
    network_rx_bytes: Optional[int] = None
    network_tx_bytes: Optional[int] = None

    # Container state
    container_state: Optional[str] = None  # running, exited, restarting, etc.
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    exit_code: Optional[int] = None

    # Error info
    error_message: Optional[str] = None
    error_count: int = 0
    last_error_at: Optional[datetime] = None

    class Config:
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "module_name": "analytics-dashboard",
                "display_name": "Analytics Dashboard",
                "status": "running",
                "health": "healthy",
                "container_id": "abc123def456",
                "uptime_seconds": 86400,
                "restart_count": 0,
                "cpu_usage_percent": 5.2,
                "memory_usage_mb": 256.8,
                "memory_limit_mb": 512.0,
                "container_state": "running",
                "started_at": "2025-10-16T10:30:00.000Z"
            }
        }


class ModuleAuditLog(BaseModel):
    """
    Module operation audit log (MongoDB: module_audit_log collection)

    This model tracks ALL module operations for security and compliance.
    Logs are immutable and should never be deleted (use TTL indexes for automatic cleanup).
    """
    # Operation details
    operation: str = Field(
        ...,
        description="Operation type (install, uninstall, start, stop, restart)",
        example="install"
    )
    module_name: str
    module_version: Optional[str] = None

    # User context
    user_id: str
    user_email: str
    user_role: str

    # Result
    status: str = Field(
        ...,
        description="Operation result (success, failure, pending)",
        example="success"
    )
    error_message: Optional[str] = None

    # Request metadata
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    # Timestamps
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    duration_seconds: Optional[float] = None

    # Additional context
    metadata: Optional[Dict[str, str]] = Field(
        default_factory=dict,
        description="Additional operation-specific metadata",
        example={"docker_image": "myregistry.com/analytics:1.0.0"}
    )

    class Config:
        json_schema_extra = {
            "example": {
                "operation": "install",
                "module_name": "analytics-dashboard",
                "module_version": "1.0.0",
                "user_id": "0224a4f2-916d-4434-8f50-871fa9f65cd6",
                "user_email": "admin@a64platform.com",
                "user_role": "super_admin",
                "status": "success",
                "timestamp": "2025-10-17T10:30:00.000Z",
                "duration_seconds": 45.2,
                "metadata": {
                    "docker_image": "myregistry.com/analytics:1.0.0",
                    "ports": "8001:8000"
                }
            }
        }


# =============================================================================
# Utility Models
# =============================================================================

class ModuleInstallResponse(BaseModel):
    """Response for module installation request"""
    message: str
    module_name: str
    status: ModuleStatus

    class Config:
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "message": "Module installation started successfully",
                "module_name": "analytics-dashboard",
                "status": "installing"
            }
        }


class ModuleUninstallResponse(BaseModel):
    """Response for module uninstallation request"""
    message: str
    module_name: str

    class Config:
        json_schema_extra = {
            "example": {
                "message": "Module uninstalled successfully",
                "module_name": "analytics-dashboard"
            }
        }


# =============================================================================
# Port Management Models
# =============================================================================

class PortAllocation(BaseModel):
    """
    Port allocation record (MongoDB: port_registry collection)

    Tracks which external ports are allocated to which modules.
    Prevents port conflicts and enables automatic port assignment.
    """
    port: int = Field(
        ...,
        ge=9000,
        le=65535,
        description="Allocated external port (9000-65535)"
    )
    module_name: str = Field(..., description="Module that owns this port")
    internal_port: int = Field(..., description="Module's internal container port")
    allocated_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = Field(
        default="active",
        description="Port status: active, reserved, released"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "port": 9001,
                "module_name": "example-app",
                "internal_port": 8080,
                "allocated_at": "2025-10-17T10:00:00Z",
                "status": "active"
            }
        }


class PortRange(BaseModel):
    """Port range configuration for different module types"""
    start_port: int = Field(default=9000, description="Start of port range")
    end_port: int = Field(default=19999, description="End of port range (supports 10,000+ modules)")
    reserved_ports: List[int] = Field(
        default_factory=list,
        description="Ports reserved for specific purposes"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "start_port": 9000,
                "end_port": 19999,
                "reserved_ports": [9000, 9999]  # Reserved for system use
            }
        }
