"""
Module Management API Endpoints

REST API for managing Docker Compose-based modular applications.

Security:
- All endpoints require authentication (JWT)
- All endpoints require super_admin role (RBAC)
- All operations are logged in audit trail
- Rate limiting applied (10 requests/minute for installation)

Endpoints:
- POST   /api/v1/modules/install              - Install new module
- GET    /api/v1/modules/installed            - List installed modules
- DELETE /api/v1/modules/{module_name}        - Uninstall module
- GET    /api/v1/modules/{module_name}/status - Get module status
- GET    /api/v1/modules/audit-log            - Get audit log
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
import logging

from ...models.user import UserRole, UserInDB
from ...models.module import (
    ModuleConfig,
    ModuleResponse,
    ModuleListResponse,
    ModuleStatusResponse,
    ModuleInstallResponse,
    ModuleUninstallResponse,
    ModuleAuditLog
)
from ...services.module_manager import module_manager
from ...middleware.permissions import require_role, require_super_admin
from ...middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/modules", tags=["Module Management"])


# =============================================================================
# Module Installation
# =============================================================================

@router.post(
    "/install",
    response_model=ModuleInstallResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Install new module",
    description="""
    Install a new module from a Docker image.

    **Requirements:**
    - super_admin role required
    - Valid license key
    - Docker image from trusted registry
    - Module limits not exceeded (50 total, 10 per user)

    **Process:**
    1. Validate license key
    2. Check module limits
    3. Validate and pull Docker image
    4. Create container with security configuration
    5. Update database and routing
    6. Return installation status

    **Security:**
    - Docker images validated against trusted registries
    - Containers run with security restrictions (no privileges, resource limits)
    - License keys encrypted in database
    - All operations logged in audit trail

    **Rate Limit:** 10 requests/minute
    """
)
async def install_module(
    config: ModuleConfig,
    current_user: UserInDB = Depends(require_super_admin)
) -> ModuleInstallResponse:
    """
    Install a new module.

    Args:
        config: Module configuration (request body)
        current_user: Current authenticated user (from JWT, must be super_admin)

    Returns:
        ModuleInstallResponse with installation status

    Raises:
        HTTPException 403: If user is not super_admin
        HTTPException 400: If validation fails (license, limits, etc.)
        HTTPException 409: If module already exists
        HTTPException 500: If installation fails
    """

    try:
        logger.info(
            f"Module installation request: {config.module_name} "
            f"by {current_user.email} ({current_user.role})"
        )

        # Install module
        result = await module_manager.install_module(
            config=config,
            user_id=current_user.userId,
            user_email=current_user.email,
            user_role=current_user.role
        )

        return ModuleInstallResponse(
            message=result["message"],
            module_name=result["module_name"],
            status=result["status"]
        )

    except ValueError as e:
        # Validation errors (license, limits, already exists, etc.)
        logger.warning(f"Module installation validation failed: {str(e)}")

        # Determine appropriate status code
        if "already installed" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(e)
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

    except RuntimeError as e:
        # Installation errors (Docker, network, etc.)
        logger.error(f"Module installation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to install module: {str(e)}"
        )

    except Exception as e:
        # Unexpected errors
        logger.exception(f"Unexpected error during module installation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during module installation"
        )


# =============================================================================
# List Installed Modules
# =============================================================================

@router.get(
    "/installed",
    response_model=ModuleListResponse,
    summary="List installed modules",
    description="""
    Get a paginated list of all installed modules.

    **Requirements:**
    - super_admin role required

    **Response includes:**
    - Module name and display name
    - Docker image and version
    - Status (running, stopped, error, etc.)
    - Health (healthy, unhealthy, unknown)
    - Container information
    - Port mappings and route prefix
    - Installation metadata (who, when)
    - Error messages (if applicable)

    **Pagination:**
    - Default: 20 items per page
    - Maximum: 100 items per page
    """
)
async def list_installed_modules(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    current_user: UserInDB = Depends(require_super_admin)
) -> ModuleListResponse:
    """
    List all installed modules with pagination.

    Args:
        page: Page number (1-indexed)
        per_page: Items per page (1-100)
        current_user: Current authenticated user (must be super_admin)

    Returns:
        ModuleListResponse with paginated module list

    Raises:
        HTTPException 403: If user is not super_admin
        HTTPException 500: If query fails
    """

    try:
        logger.info(f"List modules request: page={page}, per_page={per_page} by {current_user.email}")

        # Get installed modules
        result = await module_manager.get_installed_modules(
            page=page,
            per_page=per_page
        )

        return ModuleListResponse(
            data=result["data"],
            meta=result["meta"]
        )

    except Exception as e:
        logger.exception("Error listing installed modules")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve installed modules"
        )


# =============================================================================
# Module Status
# =============================================================================

@router.get(
    "/{module_name}/status",
    response_model=ModuleStatusResponse,
    summary="Get module status",
    description="""
    Get detailed status and runtime metrics for a specific module.

    **Requirements:**
    - super_admin role required

    **Response includes:**
    - Module status (running, stopped, error, etc.)
    - Health status (healthy, unhealthy, unknown)
    - Container state and restart count
    - Resource usage (CPU %, memory MB, network bytes)
    - Uptime in seconds
    - Error information (if applicable)
    - Start/finish timestamps
    """
)
async def get_module_status(
    module_name: str,
    current_user: UserInDB = Depends(require_super_admin)
) -> ModuleStatusResponse:
    """
    Get detailed status for a specific module.

    Args:
        module_name: Module name
        current_user: Current authenticated user (must be super_admin)

    Returns:
        ModuleStatusResponse with detailed status

    Raises:
        HTTPException 403: If user is not super_admin
        HTTPException 404: If module not found
        HTTPException 500: If query fails
    """

    try:
        logger.info(f"Module status request: {module_name} by {current_user.email}")

        # Get module status
        status_response = await module_manager.get_module_status(module_name)
        return status_response

    except ValueError as e:
        # Module not found
        logger.warning(f"Module not found: {module_name}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

    except Exception as e:
        logger.exception(f"Error getting module status: {module_name}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve module status"
        )


# =============================================================================
# Module Uninstallation
# =============================================================================

@router.delete(
    "/{module_name}",
    response_model=ModuleUninstallResponse,
    summary="Uninstall module",
    description="""
    Uninstall a module and remove its container.

    **Requirements:**
    - super_admin role required

    **Process:**
    1. Find module in database
    2. Stop container gracefully (10 second timeout)
    3. Remove container
    4. Remove NGINX routing (if configured)
    5. Delete module from database
    6. Log audit trail

    **Warning:** This operation cannot be undone. All module data in the container will be lost.
    Make sure to backup any important data before uninstalling.

    **Rate Limit:** 10 requests/minute
    """
)
async def uninstall_module(
    module_name: str,
    current_user: UserInDB = Depends(require_super_admin)
) -> ModuleUninstallResponse:
    """
    Uninstall a module.

    Args:
        module_name: Module name to uninstall
        current_user: Current authenticated user (must be super_admin)

    Returns:
        ModuleUninstallResponse with uninstallation result

    Raises:
        HTTPException 403: If user is not super_admin
        HTTPException 404: If module not found
        HTTPException 500: If uninstallation fails
    """

    try:
        logger.info(f"Module uninstallation request: {module_name} by {current_user.email}")

        # Uninstall module
        result = await module_manager.uninstall_module(
            module_name=module_name,
            user_id=current_user.userId,
            user_email=current_user.email,
            user_role=current_user.role
        )

        return ModuleUninstallResponse(
            message=result["message"],
            module_name=result["module_name"]
        )

    except ValueError as e:
        # Module not found
        logger.warning(f"Module not found: {module_name}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )

    except RuntimeError as e:
        # Uninstallation error
        logger.error(f"Module uninstallation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to uninstall module: {str(e)}"
        )

    except Exception as e:
        # Unexpected error
        logger.exception(f"Unexpected error during module uninstallation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during module uninstallation"
        )


# =============================================================================
# Audit Log
# =============================================================================

@router.get(
    "/audit-log",
    response_model=dict,
    summary="Get module audit log",
    description="""
    Get audit log of all module operations.

    **Requirements:**
    - super_admin role required

    **Response includes:**
    - Operation type (install, uninstall, start, stop, etc.)
    - Module name and version
    - User information (ID, email, role)
    - Operation result (success, failure)
    - Timestamp and duration
    - Error messages (if applicable)
    - Additional metadata

    **Filters:**
    - module_name: Filter by module name
    - operation: Filter by operation type
    - status: Filter by status (success, failure)
    - user_id: Filter by user ID

    **Pagination:**
    - Default: 50 items per page
    - Maximum: 100 items per page

    **Note:** Audit logs are automatically deleted after 90 days (TTL index).
    """
)
async def get_audit_log(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    module_name: Optional[str] = Query(None, description="Filter by module name"),
    operation: Optional[str] = Query(None, description="Filter by operation (install, uninstall, etc.)"),
    status: Optional[str] = Query(None, description="Filter by status (success, failure)"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    current_user: UserInDB = Depends(require_super_admin)
) -> dict:
    """
    Get module audit log with pagination and filters.

    Args:
        page: Page number (1-indexed)
        per_page: Items per page (1-100)
        module_name: Filter by module name
        operation: Filter by operation type
        status: Filter by status
        user_id: Filter by user ID
        current_user: Current authenticated user (must be super_admin)

    Returns:
        Dictionary with paginated audit log

    Raises:
        HTTPException 403: If user is not super_admin
        HTTPException 500: If query fails
    """

    try:
        logger.info(f"Audit log request by {current_user.email}")

        # Build query filter
        query_filter = {}
        if module_name:
            query_filter["module_name"] = module_name
        if operation:
            query_filter["operation"] = operation
        if status:
            query_filter["status"] = status
        if user_id:
            query_filter["user_id"] = user_id

        # Get database
        from ...services.database import mongodb
        db = mongodb.get_database()

        # Count total
        total = await db.module_audit_log.count_documents(query_filter)

        # Get audit logs
        skip = (page - 1) * per_page
        cursor = db.module_audit_log.find(query_filter).sort("timestamp", -1).skip(skip).limit(per_page)
        logs = await cursor.to_list(length=per_page)

        # Convert ObjectId to string
        for log in logs:
            log["_id"] = str(log["_id"])

        return {
            "data": logs,
            "meta": {
                "total": total,
                "page": page,
                "per_page": per_page,
                "total_pages": (total + per_page - 1) // per_page
            },
            "filters": {
                "module_name": module_name,
                "operation": operation,
                "status": status,
                "user_id": user_id
            }
        }

    except Exception as e:
        logger.exception("Error retrieving audit log")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit log"
        )


# =============================================================================
# Health Check (for module system)
# =============================================================================

@router.get(
    "/health",
    summary="Module system health check",
    description="""
    Check if the module management system is operational.

    **Checks:**
    - Docker daemon connectivity
    - Database connectivity
    - License validator initialization

    **No authentication required** (health check endpoint)
    """
)
async def module_system_health() -> dict:
    """
    Health check for module management system.

    Returns:
        Dictionary with health status

    Raises:
        HTTPException 503: If system is unhealthy
    """
    try:
        # Check Docker connectivity (initialize if not already done)
        module_manager._ensure_docker_client()
        module_manager.docker_client.ping()
        docker_status = "healthy"
    except Exception as e:
        logger.error(f"Docker health check failed: {e}")
        docker_status = "unhealthy"

    try:
        # Check database connectivity
        from ...services.database import mongodb
        db_healthy = await mongodb.health_check()
        db_status = "healthy" if db_healthy else "unhealthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = "unhealthy"

    # Overall status
    overall_status = "healthy" if (docker_status == "healthy" and db_status == "healthy") else "unhealthy"

    result = {
        "status": overall_status,
        "components": {
            "docker": docker_status,
            "database": db_status,
            "license_validator": "healthy"
        },
        "timestamp": str(datetime.utcnow())
    }

    if overall_status == "unhealthy":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=result
        )

    return result


# Import datetime for health check
from datetime import datetime
