"""
Admin API Endpoints

Admin-only endpoints for user management and system administration.
Requires super_admin or admin role.

Following API-Structure.md and User-Structure.md specifications.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional
from datetime import datetime
import math
import logging

logger = logging.getLogger(__name__)

from ...models.user import (
    UserResponse,
    UserRoleUpdate,
    UserStatusUpdate,
    UserListResponse,
    UserRole
)
from ...services.database import mongodb
from ...middleware.auth import get_current_user
from ...middleware.permissions import require_role


router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    role: Optional[str] = Query(None, description="Filter by role"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    is_email_verified: Optional[bool] = Query(None, description="Filter by email verification"),
    search: Optional[str] = Query(None, max_length=200, description="Search email, firstName, lastName"),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    List all users (paginated)

    **Authentication:** Required (admin or super_admin)

    **Permissions:**
    - super_admin: Can view all users
    - admin: Can view all users (future: organization-scoped)

    **Query Parameters:**
    - page: Page number (default: 1)
    - per_page: Items per page (default: 20, max: 100)
    - role: Filter by role (optional)
    - is_active: Filter by active status (optional)
    - is_email_verified: Filter by email verification (optional)
    - search: Search in email, firstName, lastName (optional)

    **Returns:**
    - 200: Paginated user list
    - 401: Unauthorized
    - 403: Forbidden (insufficient permissions)
    """
    # Check permissions
    require_role([UserRole.SUPER_ADMIN, UserRole.ADMIN], current_user)

    db = mongodb.get_database()

    # Build query filter
    query_filter = {}

    if role:
        query_filter["role"] = role

    if is_active is not None:
        query_filter["isActive"] = is_active

    if is_email_verified is not None:
        query_filter["isEmailVerified"] = is_email_verified

    if search:
        # Case-insensitive search in email, firstName, lastName
        query_filter["$or"] = [
            {"email": {"$regex": search, "$options": "i"}},
            {"firstName": {"$regex": search, "$options": "i"}},
            {"lastName": {"$regex": search, "$options": "i"}}
        ]

    # Exclude soft-deleted users
    query_filter["deletedAt"] = None

    # Count total matching users
    total = await db.users.count_documents(query_filter)

    # Calculate pagination
    total_pages = math.ceil(total / per_page) if total > 0 else 1
    skip = (page - 1) * per_page

    # Fetch users
    cursor = db.users.find(query_filter).skip(skip).limit(per_page).sort("createdAt", -1)
    users = await cursor.to_list(length=per_page)

    # Convert to UserResponse models (exclude passwordHash)
    user_responses = []
    for user in users:
        user_responses.append(UserResponse(
            userId=user.get("userId"),
            email=user.get("email"),
            firstName=user.get("firstName"),
            lastName=user.get("lastName"),
            role=UserRole(user.get("role")),
            isActive=user.get("isActive"),
            isEmailVerified=user.get("isEmailVerified"),
            phone=user.get("phone"),
            avatar=user.get("avatar"),
            timezone=user.get("timezone"),
            locale=user.get("locale"),
            lastLoginAt=user.get("lastLoginAt"),
            createdAt=user.get("createdAt"),
            updatedAt=user.get("updatedAt")
        ))

    return UserListResponse(
        data=user_responses,
        total=total,
        page=page,
        perPage=per_page,
        totalPages=total_pages
    )


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get user details by ID

    **Authentication:** Required (admin or super_admin)

    **Returns:**
    - 200: User details
    - 401: Unauthorized
    - 403: Forbidden
    - 404: User not found
    """
    # Check permissions
    require_role([UserRole.SUPER_ADMIN, UserRole.ADMIN], current_user)

    db = mongodb.get_database()

    user = await db.users.find_one({"userId": user_id, "deletedAt": None})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return UserResponse(
        userId=user.get("userId"),
        email=user.get("email"),
        firstName=user.get("firstName"),
        lastName=user.get("lastName"),
        role=UserRole(user.get("role")),
        isActive=user.get("isActive"),
        isEmailVerified=user.get("isEmailVerified"),
        phone=user.get("phone"),
        avatar=user.get("avatar"),
        timezone=user.get("timezone"),
        locale=user.get("locale"),
        lastLoginAt=user.get("lastLoginAt"),
        createdAt=user.get("createdAt"),
        updatedAt=user.get("updatedAt")
    )


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    role_update: UserRoleUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Update user role

    **Authentication:** Required (admin or super_admin)

    **Permissions:**
    - super_admin: Can assign any role including super_admin and admin
    - admin: Can assign user, moderator (cannot create other admins)

    **Request Body:**
    - role: New role (user, moderator, admin, super_admin)

    **Returns:**
    - 200: Updated user details
    - 401: Unauthorized
    - 403: Forbidden (insufficient permissions)
    - 404: User not found
    """
    # Check permissions
    require_role([UserRole.SUPER_ADMIN, UserRole.ADMIN], current_user)

    # Admin role restrictions
    if current_user.role == UserRole.ADMIN:
        # Admins cannot create other admins or super admins
        if role_update.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admins cannot assign admin or super_admin roles"
            )

    db = mongodb.get_database()

    # Find user
    user = await db.users.find_one({"userId": user_id, "deletedAt": None})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent modifying own role
    if user_id == current_user.userId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify your own role"
        )

    # Prevent non-super-admins from modifying super admin roles
    if user.get("role") == UserRole.SUPER_ADMIN.value and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can modify other super admin roles"
        )

    # Update role
    result = await db.users.update_one(
        {"userId": user_id},
        {
            "$set": {
                "role": role_update.role.value,
                "updatedAt": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update user role"
        )

    # Fetch updated user
    updated_user = await db.users.find_one({"userId": user_id})

    return UserResponse(
        userId=updated_user.get("userId"),
        email=updated_user.get("email"),
        firstName=updated_user.get("firstName"),
        lastName=updated_user.get("lastName"),
        role=UserRole(updated_user.get("role")),
        isActive=updated_user.get("isActive"),
        isEmailVerified=updated_user.get("isEmailVerified"),
        phone=updated_user.get("phone"),
        avatar=updated_user.get("avatar"),
        timezone=updated_user.get("timezone"),
        locale=updated_user.get("locale"),
        lastLoginAt=updated_user.get("lastLoginAt"),
        createdAt=updated_user.get("createdAt"),
        updatedAt=updated_user.get("updatedAt")
    )


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def update_user_status(
    user_id: str,
    status_update: UserStatusUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Activate or deactivate user account

    **Authentication:** Required (admin or super_admin)

    **Request Body:**
    - isActive: true (activate) or false (deactivate/suspend)

    **Returns:**
    - 200: Updated user details
    - 401: Unauthorized
    - 403: Forbidden
    - 404: User not found
    """
    # Check permissions
    require_role([UserRole.SUPER_ADMIN, UserRole.ADMIN], current_user)

    db = mongodb.get_database()

    # Find user
    user = await db.users.find_one({"userId": user_id, "deletedAt": None})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent modifying own status
    if user_id == current_user.userId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify your own status"
        )

    # Prevent non-super-admins from modifying super admin status
    if user.get("role") == UserRole.SUPER_ADMIN.value and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can modify other super admin accounts"
        )

    # Update status
    result = await db.users.update_one(
        {"userId": user_id},
        {
            "$set": {
                "isActive": status_update.isActive,
                "updatedAt": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update user status"
        )

    # Fetch updated user
    updated_user = await db.users.find_one({"userId": user_id})

    return UserResponse(
        userId=updated_user.get("userId"),
        email=updated_user.get("email"),
        firstName=updated_user.get("firstName"),
        lastName=updated_user.get("lastName"),
        role=UserRole(updated_user.get("role")),
        isActive=updated_user.get("isActive"),
        isEmailVerified=updated_user.get("isEmailVerified"),
        phone=updated_user.get("phone"),
        avatar=updated_user.get("avatar"),
        timezone=updated_user.get("timezone"),
        locale=updated_user.get("locale"),
        lastLoginAt=updated_user.get("lastLoginAt"),
        createdAt=updated_user.get("createdAt"),
        updatedAt=updated_user.get("updatedAt")
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Soft delete user account

    **Authentication:** Required (admin or super_admin)

    **Note:** This performs a soft delete (sets deletedAt timestamp).
    User can be restored within 90 days.

    **Returns:**
    - 200: User deleted successfully
    - 401: Unauthorized
    - 403: Forbidden
    - 404: User not found
    """
    # Check permissions
    require_role([UserRole.SUPER_ADMIN, UserRole.ADMIN], current_user)

    db = mongodb.get_database()

    # Find user
    user = await db.users.find_one({"userId": user_id, "deletedAt": None})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent deleting own account
    if user_id == current_user.userId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete your own account"
        )

    # Prevent non-super-admins from deleting super admins
    if user.get("role") == UserRole.SUPER_ADMIN.value and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can delete other super admin accounts"
        )

    # Soft delete
    result = await db.users.update_one(
        {"userId": user_id},
        {
            "$set": {
                "deletedAt": datetime.utcnow(),
                "isActive": False,
                "updatedAt": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete user"
        )

    return {
        "message": "User deleted successfully",
        "userId": user_id,
        "deletedAt": datetime.utcnow().isoformat()
    }


@router.put("/users/{user_id}/mfa/reset")
async def reset_user_mfa(
    user_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Reset MFA for a user (admin action)

    Allows admin/super_admin to reset MFA for users who are locked out
    (lost phone, no backup codes remaining).

    **Authentication:** Required (admin or super_admin)

    **Security:**
    - Deletes user's TOTP secret and backup codes
    - Sets mfaSetupRequired=true to force new MFA setup on next login
    - Logs the action in admin audit trail
    - Sends email notification to the user

    **Returns:**
    - 200: MFA reset successfully
    - 401: Unauthorized
    - 403: Forbidden (insufficient permissions)
    - 404: User not found
    - 400: MFA is not enabled for this user
    """
    # Check permissions - require admin or super_admin
    require_role([UserRole.SUPER_ADMIN, UserRole.ADMIN], current_user)

    db = mongodb.get_database()

    # Find target user
    user = await db.users.find_one({"userId": user_id, "deletedAt": None})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Check if MFA is enabled for this user
    if not user.get("mfaEnabled", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA is not enabled for this user"
        )

    # Prevent admins from resetting super_admin MFA (only super_admins can)
    if user.get("role") == UserRole.SUPER_ADMIN.value and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can reset MFA for other super admin accounts"
        )

    # Reset MFA - remove TOTP secret, backup codes, and set mfaSetupRequired
    reset_time = datetime.utcnow()
    result = await db.users.update_one(
        {"userId": user_id},
        {
            "$set": {
                "mfaEnabled": False,
                "mfaSetupRequired": True,  # Force new MFA setup on next login
                "mfaResetAt": reset_time,
                "mfaResetBy": current_user.userId,
                "mfaResetByEmail": current_user.email,
                "updatedAt": reset_time
            },
            "$unset": {
                "mfaSecret": "",
                "mfaSecretEncrypted": "",
                "mfaBackupCodes": "",
                "mfaEnabledAt": "",
                "mfaPendingSecret": "",
                "mfaPendingSecretEncrypted": "",
                "mfaPendingSetupAt": "",
                "mfaLastUsedCounter": "",
                "mfaLastUsedAt": ""
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to reset MFA"
        )

    # Log admin action in audit trail
    audit_entry = {
        "action": "mfa_reset",
        "targetUserId": user_id,
        "targetUserEmail": user.get("email"),
        "performedBy": current_user.userId,
        "performedByEmail": current_user.email,
        "performedByRole": current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        "timestamp": reset_time,
        "details": {
            "reason": "Admin MFA reset for locked out user"
        }
    }
    await db.admin_audit_log.insert_one(audit_entry)

    # Log to console (email notification in dev mode)
    logger.info(
        f"[EMAIL NOTIFICATION - DEV MODE] "
        f"MFA Reset Notification for {user.get('email')}: "
        f"Your Multi-Factor Authentication has been reset by an administrator ({current_user.email}). "
        f"You will be required to set up MFA again on your next login. "
        f"If you did not request this, please contact support immediately."
    )

    logger.info(
        f"Admin MFA reset: {current_user.email} reset MFA for user {user.get('email')} (userId: {user_id})"
    )

    return {
        "message": "MFA has been reset successfully. User will be required to set up MFA on next login.",
        "userId": user_id,
        "userEmail": user.get("email"),
        "resetAt": reset_time.isoformat(),
        "resetBy": current_user.email
    }
