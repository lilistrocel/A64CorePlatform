"""
Farm Management Module - Managers API Routes

Endpoints for fetching users who can be assigned as farm managers.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from pydantic import BaseModel, Field
import logging

from ...middleware.auth import get_current_active_user, CurrentUser
from ...services.database import farm_db
from ...utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class ManagerResponse(BaseModel):
    """Manager user information for farm assignment"""
    userId: str = Field(..., description="User unique identifier")
    name: str = Field(..., description="User full name (firstName + lastName)")
    email: str = Field(..., description="User email address")
    role: str = Field(..., description="User role")

    class Config:
        json_schema_extra = {
            "example": {
                "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "name": "John Doe",
                "email": "john.doe@example.com",
                "role": "admin"
            }
        }


class ManagersListResponse(BaseModel):
    """Response containing list of manager users"""
    managers: List[ManagerResponse] = Field(..., description="List of users who can be assigned as farm managers")


@router.get(
    "/managers",
    response_model=SuccessResponse[ManagersListResponse],
    status_code=status.HTTP_200_OK,
    summary="Get list of users who can be farm managers",
    description="Fetch users with manager role (admin, super_admin, moderator) who can be assigned as farm managers"
)
async def get_managers(
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of users who can be assigned as farm managers

    Queries the users collection for active users with roles that have farm.manage permission:
    - super_admin
    - admin
    - moderator

    Returns:
        List of users with userId, name, and email

    Raises:
        HTTPException: 401 if user not authenticated
        HTTPException: 500 if database query fails
    """
    try:
        # Get database instance
        db = farm_db.get_database()

        # Query users with manager roles (roles that can manage farms)
        # Reason: Based on require_permission("farm.manage") which allows admin, super_admin, moderator
        manager_roles = ["super_admin", "admin", "moderator"]

        # Fetch active users with manager roles
        cursor = db.users.find(
            {
                "role": {"$in": manager_roles},
                "isActive": True,
                "deletedAt": None
            },
            {
                "_id": 0,
                "userId": 1,
                "firstName": 1,
                "lastName": 1,
                "email": 1,
                "role": 1
            }
        ).sort("firstName", 1)

        # Build manager list
        managers = []
        async for user_doc in cursor:
            managers.append(
                ManagerResponse(
                    userId=user_doc["userId"],
                    name=f"{user_doc['firstName']} {user_doc['lastName']}",
                    email=user_doc["email"],
                    role=user_doc["role"]
                )
            )

        logger.info(f"[Managers API] Retrieved {len(managers)} manager users for user {current_user.userId}")

        return SuccessResponse(
            data=ManagersListResponse(managers=managers),
            message=f"Retrieved {len(managers)} manager users"
        )

    except Exception as e:
        logger.error(f"[Managers API] Error fetching managers: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch manager users: {str(e)}"
        )
