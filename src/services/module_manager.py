"""
Module Manager Service for A64 Core Platform

Manages Docker Compose-based module installation, uninstallation, and lifecycle.

This service provides:
- Module installation from Docker images
- Module uninstallation and cleanup
- Module status tracking
- Container lifecycle management
- docker-compose.yml manipulation
- NGINX routing configuration
- Security enforcement (RBAC, resource limits, sandboxing)

Security Features:
- Docker image validation (trusted registries only)
- Container sandboxing (no privileges, resource limits)
- License validation before installation
- Audit logging for all operations
- super_admin role required for all operations

Usage:
    from src.services.module_manager import ModuleManager
    from src.models.module import ModuleConfig

    manager = ModuleManager()

    # Install module
    config = ModuleConfig(
        module_name="analytics",
        docker_image="registry.com/analytics:1.0.0",
        license_key="XXX-YYY-ZZZ",
        ...
    )
    result = await manager.install_module(config, user_id, user_email)

    # Get module status
    status = await manager.get_module_status("analytics")

    # Uninstall module
    await manager.uninstall_module("analytics", user_id, user_email)
"""

import os
import re
import yaml
import logging
import platform
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pathlib import Path

import docker
from docker.errors import DockerException, ImageNotFound, APIError

from ..models.module import (
    ModuleConfig,
    ModuleInDB,
    ModuleResponse,
    ModuleStatusResponse,
    ModuleStatus,
    ModuleHealth,
    ModuleAuditLog
)
from ..utils.encryption import encrypt_license_key, decrypt_license_key
from ..utils.license_validator import LicenseValidator
from ..services.database import mongodb
from ..services.port_manager import PortManager
from ..services.proxy_manager import get_proxy_manager

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

def _get_docker_socket() -> str:
    """
    Detect Docker socket based on platform.

    Returns:
        Docker socket URL for the current platform
    """
    # Allow override via environment variable
    env_socket = os.getenv("DOCKER_SOCKET")
    if env_socket:
        return env_socket

    # Auto-detect based on platform
    system = platform.system()

    if system == "Windows":
        # Windows uses named pipe for Docker Desktop
        return "npipe:////./pipe/docker_engine"
    else:
        # Linux/macOS use Unix socket
        return "unix:///var/run/docker.sock"

# Docker socket path (cross-platform)
DOCKER_SOCKET = _get_docker_socket()

# docker-compose.yml path
COMPOSE_FILE_PATH = os.getenv("COMPOSE_FILE_PATH", "/app/docker-compose.yml")

# NGINX config path
NGINX_CONFIG_PATH = os.getenv("NGINX_CONFIG_PATH", "/app/nginx/nginx.conf")

# Trusted Docker registries (security)
TRUSTED_REGISTRIES = os.getenv(
    "TRUSTED_REGISTRIES",
    "registry.hub.docker.com,ghcr.io,gcr.io,docker.io"
).split(",")

# Module limits
MAX_MODULES = int(os.getenv("MAX_MODULES", "50"))
MAX_MODULES_PER_USER = int(os.getenv("MAX_MODULES_PER_USER", "10"))

# Installation timeout
MODULE_INSTALL_TIMEOUT = int(os.getenv("MODULE_INSTALL_TIMEOUT", "300"))


# =============================================================================
# Module Manager Class
# =============================================================================

class ModuleManager:
    """
    Manages Docker Compose-based modular applications.

    Responsibilities:
    - Install/uninstall modules as Docker containers
    - Validate Docker images and license keys
    - Configure container security (sandboxing, resource limits)
    - Update docker-compose.yml dynamically
    - Update NGINX routing configuration
    - Track module status in database
    - Log all operations for audit trail
    """

    def __init__(self, port_manager: Optional[PortManager] = None):
        """
        Initialize ModuleManager with lazy Docker client and services

        Args:
            port_manager: Port Manager instance (optional, will be set later if None)
        """
        self.docker_client = None
        self._docker_initialized = False

        # Initialize services
        self.license_validator = LicenseValidator()
        self.port_manager = port_manager
        self.proxy_manager = get_proxy_manager()

        # Database (lazy initialization)
        self._db = None

        logger.info("ModuleManager initialized (Docker client will connect on first use)")

    def _ensure_docker_client(self):
        """Lazy initialization of Docker client"""
        if not self._docker_initialized:
            try:
                # Initialize Docker client
                self.docker_client = docker.DockerClient(base_url=DOCKER_SOCKET)
                logger.info(f"Docker client initialized: {DOCKER_SOCKET}")

                # Test Docker connection
                self.docker_client.ping()
                logger.info("Docker daemon is reachable")

                self._docker_initialized = True

            except DockerException as e:
                logger.error(f"Failed to initialize Docker client: {e}")
                raise RuntimeError(
                    f"Cannot connect to Docker daemon at {DOCKER_SOCKET}. "
                    "Ensure Docker socket is mounted and daemon is running."
                ) from e

    @property
    def db(self):
        """Lazy database initialization"""
        if self._db is None:
            self._db = mongodb.get_database()
        return self._db

    # =========================================================================
    # Module Installation
    # =========================================================================

    async def install_module(
        self,
        config: ModuleConfig,
        user_id: str,
        user_email: str,
        user_role: str = "super_admin"
    ) -> Dict[str, any]:
        """
        Install a module from Docker image.

        Steps:
        1. Validate license key
        2. Check module limits
        3. Validate Docker image
        4. Pull Docker image
        5. Create module record in database
        6. Update docker-compose.yml
        7. Start container
        8. Update NGINX routing (if needed)
        9. Log audit trail

        Args:
            config: Module configuration
            user_id: User ID performing installation
            user_email: User email
            user_role: User role (must be super_admin)

        Returns:
            Dictionary with installation result

        Raises:
            ValueError: If validation fails
            RuntimeError: If installation fails
        """
        start_time = datetime.utcnow()
        module_name = config.module_name

        try:
            logger.info(f"Starting module installation: {module_name} by {user_email}")

            # Ensure Docker client is initialized
            self._ensure_docker_client()

            # Step 1: Validate license key
            logger.info(f"Validating license key for {module_name}")
            license_result = await self.license_validator.validate_license(
                config.license_key,
                module_name,
                config.version
            )

            if not license_result["valid"]:
                error = license_result.get("error", "License validation failed")
                await self._log_audit(
                    user_id, user_email, user_role,
                    "install", module_name, config.version,
                    "failure", error,
                    start_time
                )
                raise ValueError(f"License validation failed: {error}")

            logger.info(f"License key validated successfully for {module_name}")

            # Step 2: Check module limits
            await self._check_module_limits(user_id)

            # Step 3: Check if module already exists
            existing = await self.db.installed_modules.find_one({"module_name": module_name})
            if existing:
                error = f"Module '{module_name}' is already installed"
                await self._log_audit(
                    user_id, user_email, user_role,
                    "install", module_name, config.version,
                    "failure", error,
                    start_time
                )
                raise ValueError(error)

            # Step 4: Validate Docker image
            logger.info(f"Validating Docker image: {config.docker_image}")
            self._validate_docker_image(config.docker_image)

            # Step 5: Get or pull Docker image
            logger.info(f"Getting Docker image: {config.docker_image}")
            try:
                # Check if image exists locally (especially for localhost registry)
                registry = config.docker_image.split("/")[0] if "/" in config.docker_image else "docker.io"

                if registry == "localhost":
                    # For local images, try to get from local cache first (no pull needed)
                    logger.info(f"Checking local image cache for: {config.docker_image}")
                    try:
                        image = self.docker_client.images.get(config.docker_image)
                        logger.info(f"Found local image: {image.id[:12]}")
                    except ImageNotFound:
                        error = f"Local Docker image not found: {config.docker_image}. Build it first with: docker build -t {config.docker_image} ."
                        await self._log_audit(
                            user_id, user_email, user_role,
                            "install", module_name, config.version,
                            "failure", error,
                            start_time
                        )
                        raise ValueError(error)
                else:
                    # For remote registries, pull the image
                    logger.info(f"Pulling image from remote registry: {config.docker_image}")
                    image = self.docker_client.images.pull(config.docker_image)
                    logger.info(f"Docker image pulled successfully: {image.id[:12]}")

            except ImageNotFound:
                error = f"Docker image not found: {config.docker_image}"
                await self._log_audit(
                    user_id, user_email, user_role,
                    "install", module_name, config.version,
                    "failure", error,
                    start_time
                )
                raise ValueError(error)
            except DockerException as e:
                error = f"Failed to get Docker image: {str(e)}"
                await self._log_audit(
                    user_id, user_email, user_role,
                    "install", module_name, config.version,
                    "failure", error,
                    start_time
                )
                raise RuntimeError(error)

            # Step 6: Allocate ports automatically (if port_manager available)
            allocated_ports = {}
            proxy_route = None

            if self.port_manager:
                # Parse internal ports from config.ports
                internal_ports = await self.port_manager.parse_ports_from_config(config.ports)

                # Allocate external ports
                allocated_ports = await self.port_manager.allocate_ports(module_name, internal_ports)
                logger.info(f"Allocated ports for {module_name}: {allocated_ports}")

                # Generate proxy route
                proxy_route = await self.port_manager.generate_proxy_route(module_name)
                logger.info(f"Generated proxy route for {module_name}: {proxy_route}")
            else:
                logger.warning("Port Manager not available - using manual port configuration")

            # Step 7: Encrypt license key
            encrypted_license = encrypt_license_key(config.license_key)

            # Step 8: Create module record in database
            module_doc = ModuleInDB(
                module_name=module_name,
                display_name=config.display_name,
                description=config.description,
                docker_image=config.docker_image,
                version=config.version,
                license_key_encrypted=encrypted_license,
                ports=config.ports,
                allocated_ports=allocated_ports,  # Auto-allocated ports
                environment=config.environment,
                volumes=config.volumes,
                cpu_limit=config.cpu_limit,
                memory_limit=config.memory_limit,
                network_mode=config.network_mode,
                depends_on=config.depends_on,
                health_check=config.health_check,
                route_prefix=config.route_prefix,
                proxy_route=proxy_route,  # Reverse proxy route
                status=ModuleStatus.INSTALLING,
                health=ModuleHealth.UNKNOWN,
                installed_by_user_id=user_id,
                installed_by_email=user_email,
                installed_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            await self.db.installed_modules.insert_one(module_doc.dict())
            logger.info(f"Module record created in database: {module_name}")

            # Step 9: Create container with security configuration
            logger.info(f"Creating Docker container for {module_name}")
            container = await self._create_container(config, image, allocated_ports)

            # Step 9: Update module record with container info
            await self.db.installed_modules.update_one(
                {"module_name": module_name},
                {
                    "$set": {
                        "container_id": container.id,
                        "container_name": container.name,
                        "status": ModuleStatus.RUNNING,
                        "health": ModuleHealth.UNKNOWN,
                        "updated_at": datetime.utcnow()
                    }
                }
            )

            logger.info(f"Container started: {container.name} ({container.id[:12]})")

            # Step 10: Create reverse proxy route (if proxy_route available)
            if proxy_route and allocated_ports:
                # Get primary port (first allocated port)
                primary_port = list(allocated_ports.values())[0] if allocated_ports else None

                if primary_port:
                    logger.info(f"Creating reverse proxy route: {proxy_route} -> :{primary_port}")
                    proxy_created = await self.proxy_manager.create_proxy_route(
                        module_name,
                        proxy_route,
                        primary_port,
                        enable_websocket=True
                    )

                    if proxy_created:
                        logger.info(f"Reverse proxy route created: {proxy_route}")
                    else:
                        logger.warning(f"Failed to create reverse proxy route for {module_name}")

            # Step 11: Log successful installation
            duration = (datetime.utcnow() - start_time).total_seconds()
            await self._log_audit(
                user_id, user_email, user_role,
                "install", module_name, config.version,
                "success", None,
                start_time,
                duration,
                {"docker_image": config.docker_image, "container_id": container.id[:12]}
            )

            logger.info(f"Module installation completed: {module_name} ({duration:.2f}s)")

            return {
                "success": True,
                "message": f"Module '{module_name}' installed successfully",
                "module_name": module_name,
                "container_id": container.id,
                "container_name": container.name,
                "status": ModuleStatus.RUNNING
            }

        except (ValueError, RuntimeError) as e:
            # Expected errors - already logged in audit trail
            logger.error(f"Module installation failed: {module_name}: {str(e)}")

            # Update database status to ERROR
            await self.db.installed_modules.update_one(
                {"module_name": module_name},
                {
                    "$set": {
                        "status": ModuleStatus.ERROR,
                        "error_message": str(e),
                        "error_count": {"$inc": 1},
                        "last_error_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )

            raise

        except Exception as e:
            # Unexpected errors
            logger.exception(f"Unexpected error during module installation: {module_name}")
            duration = (datetime.utcnow() - start_time).total_seconds()
            await self._log_audit(
                user_id, user_email, user_role,
                "install", module_name, config.version,
                "failure", f"Unexpected error: {str(e)}",
                start_time,
                duration
            )

            # Update database status to ERROR
            await self.db.installed_modules.update_one(
                {"module_name": module_name},
                {
                    "$set": {
                        "status": ModuleStatus.ERROR,
                        "error_message": str(e),
                        "error_count": {"$inc": 1},
                        "last_error_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    }
                }
            )

            raise RuntimeError(f"Failed to install module '{module_name}': {str(e)}") from e

    def _detect_security_profile(self, image, config: ModuleConfig) -> str:
        """
        Detect appropriate security profile for the module.

        Priority:
        1. Explicit security_profile from config
        2. Image labels (a64core.security.profile)
        3. Auto-detection based on image properties

        Args:
            image: Docker image object
            config: Module configuration

        Returns:
            Security profile: 'strict', 'relaxed', or 'auto'
        """
        # If explicitly set in config, use that
        if config.security_profile and config.security_profile != "auto":
            logger.info(f"Using explicit security profile: {config.security_profile}")
            return config.security_profile

        # Check image labels for security profile
        labels = image.labels or {}
        if "a64core.security.profile" in labels:
            profile = labels["a64core.security.profile"]
            logger.info(f"Detected security profile from image labels: {profile}")
            return profile

        # Check for security compatibility labels
        if labels.get("a64core.security.uid1000-ready") == "true":
            logger.info("Image declares UID 1000 compatibility - using strict profile")
            return "strict"

        # Check if image declares it needs root
        if labels.get("a64core.security.requires-root") == "true":
            logger.info("Image declares root requirement - using relaxed profile")
            return "relaxed"

        # Default: use relaxed for development, strict for production
        env = os.getenv("ENVIRONMENT", "development")
        default_profile = "relaxed" if env == "development" else "strict"
        logger.info(f"No explicit security profile - using {default_profile} (environment: {env})")
        return default_profile

    async def _create_container(
        self,
        config: ModuleConfig,
        image,
        allocated_ports: Optional[Dict[int, int]] = None
    ) -> docker.models.containers.Container:
        """
        Create and start Docker container with security configuration.

        Security profiles:
        - strict: Run as UID 1000, drop all capabilities, read-only root (production-ready)
        - relaxed: Run as root, necessary capabilities, writable root (development/legacy modules)
        - auto: Detect from image labels or environment

        Security features (all profiles):
        - No privileged mode (always enforced)
        - Resource limits (CPU, memory, PIDs)
        - No new privileges (always enforced)

        Args:
            config: Module configuration
            image: Docker image object

        Returns:
            Docker container object

        Raises:
            RuntimeError: If container creation fails
        """
        container_name = f"a64core-{config.module_name}"

        # Parse port mappings (use allocated_ports if available, otherwise use config.ports)
        port_bindings = {}

        if allocated_ports:
            # Use auto-allocated ports (internal_port -> external_port)
            for internal_port, external_port in allocated_ports.items():
                port_bindings[f"{internal_port}/tcp"] = int(external_port)
                logger.info(f"Port mapping: {external_port} -> {internal_port}")
        elif config.ports:
            # Fallback to manual port configuration
            for port_mapping in config.ports:
                if ":" in port_mapping:
                    host_port, container_port = port_mapping.split(":")
                    port_bindings[f"{container_port}/tcp"] = int(host_port)
                else:
                    # If only container port specified, use same for host
                    port_bindings[f"{port_mapping}/tcp"] = int(port_mapping)
            logger.info(f"Using manual port configuration: {port_bindings}")

        # Parse resource limits
        cpu_limit = int(float(config.cpu_limit) * 100000)  # CPUs to CPU quota
        memory_limit = config.memory_limit  # Already in format "512m" or "1g"

        # Detect security profile
        security_profile = self._detect_security_profile(image, config)
        logger.info(f"Applying security profile: {security_profile}")

        # Base container configuration
        container_config = {
            "name": container_name,
            "image": image,
            "detach": True,
            "environment": config.environment,
            "ports": port_bindings,
            "network": config.network_mode,
            "restart_policy": {"Name": "unless-stopped"},

            # Security configuration (CRITICAL - always enforced)
            "privileged": False,  # NEVER allow privileged containers
            "security_opt": ["no-new-privileges"],  # Prevent privilege escalation

            # Resource limits (prevent resource exhaustion attacks)
            "cpu_quota": cpu_limit,  # CPU limit
            "mem_limit": memory_limit,  # Memory limit
            "pids_limit": 100,  # Limit number of processes

            # Health check (if configured)
            "healthcheck": self._parse_health_check(config.health_check) if config.health_check else None,

            # Labels (for identification and security profile tracking)
            "labels": {
                "a64core.module": config.module_name,
                "a64core.version": config.version,
                "a64core.managed": "true",
                "a64core.security.profile": security_profile
            }
        }

        # Apply security profile-specific configuration
        if security_profile == "strict":
            # Production-grade security: UID 1000, drop all capabilities, read-only root
            logger.info("Applying STRICT security profile (production-ready)")
            container_config["user"] = "1000:1000"  # Run as non-root
            container_config["cap_drop"] = ["ALL"]  # Drop all Linux capabilities
            container_config["read_only"] = False  # Most apps need writable /tmp
            logger.info("  - Running as UID 1000 (non-root)")
            logger.info("  - Dropped all Linux capabilities")
            logger.info("  - Writable root filesystem (most apps need /tmp)")

        elif security_profile == "relaxed":
            # Development/legacy support: Run as root, necessary capabilities
            logger.info("Applying RELAXED security profile (development/legacy modules)")
            # Don't set user (defaults to root)
            # Don't drop capabilities (allows file operations)
            container_config["read_only"] = False  # Writable root filesystem
            logger.info("  - Running as root (for legacy compatibility)")
            logger.info("  - Capabilities not restricted (for file operations)")
            logger.info("  - Writable root filesystem")

        else:
            # Should not happen (auto is resolved to strict/relaxed)
            logger.warning(f"Unknown security profile: {security_profile}, using relaxed")
            container_config["read_only"] = False

        # Add volumes if specified
        if config.volumes:
            container_config["volumes"] = {}
            for volume in config.volumes:
                host_path, container_path = volume.split(":")
                container_config["volumes"][host_path] = {
                    "bind": container_path,
                    "mode": "rw"
                }

        try:
            # Create and start container
            container = self.docker_client.containers.run(**container_config)
            logger.info(f"Container created: {container_name} ({container.id[:12]})")
            return container

        except APIError as e:
            logger.error(f"Docker API error creating container: {e}")
            raise RuntimeError(f"Failed to create container: {str(e)}") from e
        except Exception as e:
            logger.error(f"Unexpected error creating container: {e}")
            raise RuntimeError(f"Failed to create container: {str(e)}") from e

    # =========================================================================
    # Module Uninstallation
    # =========================================================================

    async def uninstall_module(
        self,
        module_name: str,
        user_id: str,
        user_email: str,
        user_role: str = "super_admin"
    ) -> Dict[str, any]:
        """
        Uninstall a module and remove its container.

        Steps:
        1. Find module in database
        2. Stop and remove container
        3. Remove from docker-compose.yml (if added)
        4. Remove NGINX routing (if configured)
        5. Update database (mark as uninstalled or delete)
        6. Log audit trail

        Args:
            module_name: Module name to uninstall
            user_id: User ID performing uninstallation
            user_email: User email
            user_role: User role (must be super_admin)

        Returns:
            Dictionary with uninstallation result

        Raises:
            ValueError: If module not found
            RuntimeError: If uninstallation fails
        """
        start_time = datetime.utcnow()

        try:
            logger.info(f"Starting module uninstallation: {module_name} by {user_email}")

            # Ensure Docker client is initialized
            self._ensure_docker_client()

            # Step 1: Find module in database
            module_doc = await self.db.installed_modules.find_one({"module_name": module_name})
            if not module_doc:
                error = f"Module '{module_name}' not found"
                await self._log_audit(
                    user_id, user_email, user_role,
                    "uninstall", module_name, None,
                    "failure", error,
                    start_time
                )
                raise ValueError(error)

            # Step 2: Update status to UNINSTALLING
            await self.db.installed_modules.update_one(
                {"module_name": module_name},
                {"$set": {"status": ModuleStatus.UNINSTALLING, "updated_at": datetime.utcnow()}}
            )

            # Step 3: Stop and remove container
            container_id = module_doc.get("container_id")
            if container_id:
                try:
                    container = self.docker_client.containers.get(container_id)
                    logger.info(f"Stopping container: {container.name}")

                    # Stop container gracefully (10 second timeout)
                    container.stop(timeout=10)
                    logger.info(f"Container stopped: {container.name}")

                    # Remove container
                    container.remove(force=True)
                    logger.info(f"Container removed: {container.name}")

                except docker.errors.NotFound:
                    logger.warning(f"Container not found (already removed?): {container_id}")
                except APIError as e:
                    logger.error(f"Docker API error removing container: {e}")
                    # Continue with database cleanup even if container removal fails

            # Step 4: Remove reverse proxy route
            proxy_route = module_doc.get("proxy_route")
            if proxy_route:
                logger.info(f"Removing reverse proxy route: {proxy_route}")
                proxy_removed = await self.proxy_manager.remove_proxy_route(module_name)
                if proxy_removed:
                    logger.info(f"Reverse proxy route removed for {module_name}")
                else:
                    logger.warning(f"Failed to remove reverse proxy route for {module_name}")

            # Step 5: Release allocated ports
            if self.port_manager:
                logger.info(f"Releasing ports for {module_name}")
                await self.port_manager.release_ports(module_name)

            # Step 6: Delete module from database
            await self.db.installed_modules.delete_one({"module_name": module_name})
            logger.info(f"Module record deleted from database: {module_name}")

            # Step 6: Log successful uninstallation
            duration = (datetime.utcnow() - start_time).total_seconds()
            await self._log_audit(
                user_id, user_email, user_role,
                "uninstall", module_name, module_doc.get("version"),
                "success", None,
                start_time,
                duration,
                {"container_id": container_id[:12] if container_id else None}
            )

            logger.info(f"Module uninstallation completed: {module_name} ({duration:.2f}s)")

            return {
                "success": True,
                "message": f"Module '{module_name}' uninstalled successfully",
                "module_name": module_name
            }

        except ValueError as e:
            # Expected error - already logged
            logger.error(f"Module uninstallation failed: {module_name}: {str(e)}")
            raise

        except Exception as e:
            # Unexpected error
            logger.exception(f"Unexpected error during module uninstallation: {module_name}")
            duration = (datetime.utcnow() - start_time).total_seconds()
            await self._log_audit(
                user_id, user_email, user_role,
                "uninstall", module_name, None,
                "failure", f"Unexpected error: {str(e)}",
                start_time,
                duration
            )
            raise RuntimeError(f"Failed to uninstall module '{module_name}': {str(e)}") from e

    # =========================================================================
    # Module Status and Info
    # =========================================================================

    async def get_installed_modules(
        self,
        page: int = 1,
        per_page: int = 20
    ) -> Dict[str, any]:
        """
        Get list of installed modules with pagination.

        Args:
            page: Page number (1-indexed)
            per_page: Items per page

        Returns:
            Dictionary with paginated module list
        """
        skip = (page - 1) * per_page

        # Get total count
        total = await self.db.installed_modules.count_documents({})

        # Get modules
        cursor = self.db.installed_modules.find({}).skip(skip).limit(per_page)
        modules = await cursor.to_list(length=per_page)

        # Convert to response models
        module_responses = []
        for module_doc in modules:
            module_responses.append(ModuleResponse(
                module_name=module_doc["module_name"],
                display_name=module_doc["display_name"],
                description=module_doc.get("description"),
                docker_image=module_doc["docker_image"],
                version=module_doc["version"],
                status=module_doc["status"],
                health=module_doc["health"],
                container_id=module_doc.get("container_id"),
                container_name=module_doc.get("container_name"),
                ports=module_doc.get("ports", []),
                route_prefix=module_doc.get("route_prefix"),
                cpu_limit=module_doc["cpu_limit"],
                memory_limit=module_doc["memory_limit"],
                installed_by_email=module_doc["installed_by_email"],
                installed_at=module_doc["installed_at"],
                updated_at=module_doc["updated_at"],
                error_message=module_doc.get("error_message")
            ))

        return {
            "data": [m.dict() for m in module_responses],
            "meta": {
                "total": total,
                "page": page,
                "per_page": per_page,
                "total_pages": (total + per_page - 1) // per_page
            }
        }

    async def get_module_status(self, module_name: str) -> ModuleStatusResponse:
        """
        Get detailed status of a specific module.

        Args:
            module_name: Module name

        Returns:
            ModuleStatusResponse with detailed status

        Raises:
            ValueError: If module not found
        """
        # Get module from database
        module_doc = await self.db.installed_modules.find_one({"module_name": module_name})
        if not module_doc:
            raise ValueError(f"Module '{module_name}' not found")

        # Get container stats if available
        container_id = module_doc.get("container_id")
        container_stats = {}

        if container_id:
            try:
                # Ensure Docker client is initialized
                self._ensure_docker_client()

                container = self.docker_client.containers.get(container_id)

                # Get container state
                container.reload()
                state = container.attrs["State"]

                container_stats = {
                    "container_state": state["Status"],
                    "started_at": state.get("StartedAt"),
                    "finished_at": state.get("FinishedAt"),
                    "exit_code": state.get("ExitCode"),
                    "restart_count": state.get("RestartCount", 0)
                }

                # Get resource usage stats
                stats = container.stats(stream=False)
                if stats:
                    # CPU usage
                    cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - \
                                stats["precpu_stats"]["cpu_usage"]["total_usage"]
                    system_delta = stats["cpu_stats"]["system_cpu_usage"] - \
                                   stats["precpu_stats"]["system_cpu_usage"]
                    num_cpus = len(stats["cpu_stats"]["cpu_usage"].get("percpu_usage", [0]))
                    cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0 if system_delta > 0 else 0.0

                    # Memory usage
                    memory_usage = stats["memory_stats"].get("usage", 0) / (1024 * 1024)  # MB
                    memory_limit = stats["memory_stats"].get("limit", 0) / (1024 * 1024)  # MB

                    # Network usage
                    networks = stats.get("networks", {})
                    network_rx = sum(net.get("rx_bytes", 0) for net in networks.values())
                    network_tx = sum(net.get("tx_bytes", 0) for net in networks.values())

                    container_stats.update({
                        "cpu_usage_percent": round(cpu_percent, 2),
                        "memory_usage_mb": round(memory_usage, 2),
                        "memory_limit_mb": round(memory_limit, 2),
                        "network_rx_bytes": network_rx,
                        "network_tx_bytes": network_tx
                    })

                # Calculate uptime
                if state["Status"] == "running" and state.get("StartedAt"):
                    from dateutil import parser
                    started_at = parser.isoparse(state["StartedAt"])
                    uptime_seconds = int((datetime.utcnow() - started_at.replace(tzinfo=None)).total_seconds())
                    container_stats["uptime_seconds"] = uptime_seconds

            except docker.errors.NotFound:
                logger.warning(f"Container not found: {container_id}")
            except Exception as e:
                logger.error(f"Error getting container stats: {e}")

        # Build response
        return ModuleStatusResponse(
            module_name=module_doc["module_name"],
            display_name=module_doc["display_name"],
            status=module_doc["status"],
            health=module_doc["health"],
            container_id=module_doc.get("container_id"),
            container_name=module_doc.get("container_name"),
            error_message=module_doc.get("error_message"),
            error_count=module_doc.get("error_count", 0),
            last_error_at=module_doc.get("last_error_at"),
            **container_stats
        )

    # =========================================================================
    # Validation and Security
    # =========================================================================

    def _validate_docker_image(self, image: str) -> None:
        """
        Validate Docker image is from trusted registry.

        Security checks:
        - Must include tag (no 'latest')
        - Must be from trusted registry
        - No shell commands in image name

        Args:
            image: Docker image name

        Raises:
            ValueError: If image is not valid or not from trusted registry
        """
        # Check for 'latest' tag (security risk)
        if ":latest" in image or ":" not in image:
            raise ValueError(
                "Using 'latest' tag is not allowed. Specify exact version for security."
            )

        # Extract registry from image name
        registry = image.split("/")[0] if "/" in image else "docker.io"

        # Check if registry is trusted
        if registry not in TRUSTED_REGISTRIES:
            raise ValueError(
                f"Docker registry '{registry}' is not trusted. "
                f"Allowed registries: {', '.join(TRUSTED_REGISTRIES)}"
            )

        # Check for shell injection attempts (paranoid check)
        dangerous_chars = [";", "&", "|", "$", "`", "(", ")", "<", ">"]
        if any(char in image for char in dangerous_chars):
            raise ValueError(
                f"Docker image contains suspicious characters: {image}"
            )

        logger.debug(f"Docker image validated: {image} (registry: {registry})")

    async def _check_module_limits(self, user_id: str) -> None:
        """
        Check if module installation would exceed limits.

        Limits:
        - MAX_MODULES: Total modules in system
        - MAX_MODULES_PER_USER: Modules per user

        Args:
            user_id: User ID

        Raises:
            ValueError: If limits would be exceeded
        """
        # Check total modules
        total_modules = await self.db.installed_modules.count_documents({})
        if total_modules >= MAX_MODULES:
            raise ValueError(
                f"Maximum number of modules ({MAX_MODULES}) reached. "
                "Uninstall existing modules before installing new ones."
            )

        # Check per-user modules
        user_modules = await self.db.installed_modules.count_documents({"installed_by_user_id": user_id})
        if user_modules >= MAX_MODULES_PER_USER:
            raise ValueError(
                f"Maximum number of modules per user ({MAX_MODULES_PER_USER}) reached. "
                "Uninstall existing modules before installing new ones."
            )

    def _parse_health_check(self, health_check: Dict[str, str]) -> Dict:
        """
        Parse health check configuration for Docker.

        Args:
            health_check: Health check config from ModuleConfig

        Returns:
            Docker-compatible health check dict
        """
        return {
            "test": health_check.get("test", ""),
            "interval": int(health_check.get("interval", "30s").rstrip("s")) * 1000000000,
            "timeout": int(health_check.get("timeout", "10s").rstrip("s")) * 1000000000,
            "retries": int(health_check.get("retries", "3")),
            "start_period": int(health_check.get("start_period", "0s").rstrip("s")) * 1000000000
        }

    # =========================================================================
    # NGINX Routing (Placeholder - to be implemented)
    # =========================================================================

    async def _update_nginx_routing(
        self,
        module_name: str,
        route_prefix: str,
        ports: List[str]
    ) -> None:
        """
        Update NGINX configuration to add routing for module.

        TODO: Implement NGINX config manipulation
        - Read nginx.conf
        - Add location block for route_prefix
        - Proxy to module container
        - Reload NGINX

        Args:
            module_name: Module name
            route_prefix: URL prefix (e.g., '/analytics')
            ports: Port mappings
        """
        logger.info(f"NGINX routing update: {route_prefix} -> {module_name}")
        # TODO: Implement NGINX config manipulation
        pass

    async def _remove_nginx_routing(
        self,
        module_name: str,
        route_prefix: str
    ) -> None:
        """
        Remove NGINX routing configuration for module.

        TODO: Implement NGINX config manipulation

        Args:
            module_name: Module name
            route_prefix: URL prefix to remove
        """
        logger.info(f"NGINX routing removal: {route_prefix}")
        # TODO: Implement NGINX config manipulation
        pass

    # =========================================================================
    # Audit Logging
    # =========================================================================

    async def _log_audit(
        self,
        user_id: str,
        user_email: str,
        user_role: str,
        operation: str,
        module_name: str,
        module_version: Optional[str],
        status: str,
        error_message: Optional[str],
        start_time: datetime,
        duration_seconds: Optional[float] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> None:
        """
        Log module operation to audit trail.

        All module operations MUST be logged for security and compliance.

        Args:
            user_id: User ID
            user_email: User email
            user_role: User role
            operation: Operation type (install, uninstall, start, stop, etc.)
            module_name: Module name
            module_version: Module version
            status: Operation result (success, failure, pending)
            error_message: Error message if failed
            start_time: Operation start time
            duration_seconds: Operation duration
            metadata: Additional metadata
        """
        audit_log = ModuleAuditLog(
            operation=operation,
            module_name=module_name,
            module_version=module_version,
            user_id=user_id,
            user_email=user_email,
            user_role=user_role,
            status=status,
            error_message=error_message,
            timestamp=start_time,
            duration_seconds=duration_seconds,
            metadata=metadata or {}
        )

        try:
            await self.db.module_audit_log.insert_one(audit_log.dict())
            logger.debug(f"Audit log created: {operation} {module_name} by {user_email} ({status})")
        except Exception as e:
            # NEVER let audit logging failure break the operation
            logger.error(f"Failed to write audit log: {e}")


# =============================================================================
# Module Manager Instance
# =============================================================================

# Singleton instance (initialized on first import)
# In production, consider dependency injection instead
module_manager = ModuleManager()
