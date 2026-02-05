"""
User Service Layer

Business logic for user management
Following User-Structure.md specifications
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
import logging

from fastapi import HTTPException, status

from ..models.user import UserResponse, UserUpdate, UserRole
from .database import mongodb

logger = logging.getLogger(__name__)


class UserService:
    """User management service"""

    @staticmethod
    async def get_user_by_id(user_id: str) -> Optional[UserResponse]:
        """
        Get user by ID

        Args:
            user_id: User's UUID

        Returns:
            UserResponse if found, None otherwise
        """
        db = mongodb.get_database()
        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            return None

        # Don't return deleted users
        if user_doc.get("deletedAt") is not None:
            return None

        return UserResponse(
            userId=user_doc["userId"],
            email=user_doc["email"],
            firstName=user_doc["firstName"],
            lastName=user_doc["lastName"],
            role=UserRole(user_doc["role"]),
            isActive=user_doc["isActive"],
            isEmailVerified=user_doc["isEmailVerified"],
            phone=user_doc.get("phone"),
            avatar=user_doc.get("avatar"),
            timezone=user_doc.get("timezone"),
            locale=user_doc.get("locale"),
            lastLoginAt=user_doc.get("lastLoginAt"),
            createdAt=user_doc["createdAt"],
            updatedAt=user_doc["updatedAt"]
        )

    @staticmethod
    async def get_user_by_email(email: str) -> Optional[UserResponse]:
        """
        Get user by email

        Args:
            email: User's email address

        Returns:
            UserResponse if found, None otherwise
        """
        db = mongodb.get_database()
        user_doc = await db.users.find_one({"email": email})

        if not user_doc or user_doc.get("deletedAt") is not None:
            return None

        return UserResponse(
            userId=user_doc["userId"],
            email=user_doc["email"],
            firstName=user_doc["firstName"],
            lastName=user_doc["lastName"],
            role=UserRole(user_doc["role"]),
            isActive=user_doc["isActive"],
            isEmailVerified=user_doc["isEmailVerified"],
            phone=user_doc.get("phone"),
            avatar=user_doc.get("avatar"),
            timezone=user_doc.get("timezone"),
            locale=user_doc.get("locale"),
            lastLoginAt=user_doc.get("lastLoginAt"),
            createdAt=user_doc["createdAt"],
            updatedAt=user_doc["updatedAt"]
        )

    @staticmethod
    async def list_users(
        skip: int = 0,
        limit: int = 20,
        role: Optional[UserRole] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        List users with pagination

        Args:
            skip: Number of users to skip (offset)
            limit: Maximum number of users to return (max 100)
            role: Optional role filter
            search: Optional search term for email, firstName, or lastName

        Returns:
            Dict with data, meta, and links for pagination
        """
        import re
        db = mongodb.get_database()

        # Limit max page size per User-Structure.md (max 100)
        limit = min(limit, 100)

        # Build query
        query: Dict[str, Any] = {"deletedAt": None}  # Exclude deleted users

        if role:
            query["role"] = role.value

        # Add search filter (partial match on email, firstName, lastName)
        if search and search.strip():
            escaped_search = re.escape(search.strip())
            regex_pattern = {"$regex": escaped_search, "$options": "i"}
            query["$or"] = [
                {"email": regex_pattern},
                {"firstName": regex_pattern},
                {"lastName": regex_pattern}
            ]

        # Get total count
        total = await db.users.count_documents(query)

        # Get users
        cursor = db.users.find(query).skip(skip).limit(limit).sort("createdAt", -1)
        user_docs = await cursor.to_list(length=limit)

        # Convert to UserResponse objects
        users = []
        for user_doc in user_docs:
            users.append(UserResponse(
                userId=user_doc["userId"],
                email=user_doc["email"],
                firstName=user_doc["firstName"],
                lastName=user_doc["lastName"],
                role=UserRole(user_doc["role"]),
                isActive=user_doc["isActive"],
                isEmailVerified=user_doc["isEmailVerified"],
                phone=user_doc.get("phone"),
                avatar=user_doc.get("avatar"),
                timezone=user_doc.get("timezone"),
                locale=user_doc.get("locale"),
                lastLoginAt=user_doc.get("lastLoginAt"),
                createdAt=user_doc["createdAt"],
                updatedAt=user_doc["updatedAt"]
            ))

        # Calculate pagination metadata
        current_page = (skip // limit) + 1
        total_pages = (total + limit - 1) // limit  # Ceiling division

        return {
            "data": users,
            "meta": {
                "total": total,
                "page": current_page,
                "perPage": limit,
                "totalPages": total_pages
            },
            "links": {
                "first": f"/api/v1/users?page=1&perPage={limit}",
                "last": f"/api/v1/users?page={total_pages}&perPage={limit}",
                "prev": f"/api/v1/users?page={current_page - 1}&perPage={limit}" if current_page > 1 else None,
                "next": f"/api/v1/users?page={current_page + 1}&perPage={limit}" if current_page < total_pages else None
            }
        }

    @staticmethod
    async def update_user(user_id: str, update_data: UserUpdate) -> UserResponse:
        """
        Update user information

        Args:
            user_id: User's UUID
            update_data: Fields to update

        Returns:
            Updated UserResponse

        Raises:
            HTTPException: 404 if user not found
        """
        db = mongodb.get_database()

        # Check if user exists
        user_doc = await db.users.find_one({"userId": user_id, "deletedAt": None})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Build update document (only update provided fields)
        update_dict = update_data.model_dump(exclude_unset=True)

        if not update_dict:
            # No fields to update
            return await UserService.get_user_by_id(user_id)

        # Add updatedAt timestamp
        update_dict["updatedAt"] = datetime.utcnow()

        # Update user
        await db.users.update_one(
            {"userId": user_id},
            {"$set": update_dict}
        )

        logger.info(f"User updated: {user_id}")

        # Return updated user
        updated_user = await UserService.get_user_by_id(user_id)
        return updated_user

    @staticmethod
    async def delete_user(user_id: str) -> bool:
        """
        Soft delete user

        Args:
            user_id: User's UUID

        Returns:
            True if successful

        Raises:
            HTTPException: 404 if user not found

        Note: Implements soft delete per User-Structure.md
        User data retained for 90 days before hard delete
        """
        db = mongodb.get_database()

        # Check if user exists
        user_doc = await db.users.find_one({"userId": user_id, "deletedAt": None})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Soft delete - set deletedAt timestamp
        await db.users.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "deletedAt": datetime.utcnow(),
                    "isActive": False,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        # Revoke all refresh tokens
        await db.refresh_tokens.update_many(
            {"userId": user_id, "isRevoked": False},
            {"$set": {"isRevoked": True}}
        )

        logger.info(f"User soft deleted: {user_id}")

        return True

    @staticmethod
    async def change_user_role(user_id: str, new_role: UserRole) -> UserResponse:
        """
        Change user's role

        Args:
            user_id: User's UUID
            new_role: New role to assign

        Returns:
            Updated UserResponse

        Raises:
            HTTPException: 404 if user not found

        Note: Permission checks done at endpoint level using can_change_role()
        """
        db = mongodb.get_database()

        # Check if user exists
        user_doc = await db.users.find_one({"userId": user_id, "deletedAt": None})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Update role
        await db.users.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "role": new_role.value,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        logger.info(f"User role changed: {user_id} -> {new_role.value}")

        # Return updated user
        updated_user = await UserService.get_user_by_id(user_id)
        return updated_user

    @staticmethod
    async def activate_user(user_id: str) -> UserResponse:
        """
        Activate user account

        Args:
            user_id: User's UUID

        Returns:
            Updated UserResponse

        Raises:
            HTTPException: 404 if user not found
        """
        db = mongodb.get_database()

        user_doc = await db.users.find_one({"userId": user_id})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        await db.users.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "isActive": True,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        logger.info(f"User activated: {user_id}")

        return await UserService.get_user_by_id(user_id)

    @staticmethod
    async def deactivate_user(user_id: str) -> UserResponse:
        """
        Deactivate user account (suspend)

        Args:
            user_id: User's UUID

        Returns:
            Updated UserResponse

        Raises:
            HTTPException: 404 if user not found

        Note: Deactivated users cannot login but data is preserved
        """
        db = mongodb.get_database()

        user_doc = await db.users.find_one({"userId": user_id, "deletedAt": None})

        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        await db.users.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "isActive": False,
                    "updatedAt": datetime.utcnow()
                }
            }
        )

        # Revoke all refresh tokens
        await db.refresh_tokens.update_many(
            {"userId": user_id, "isRevoked": False},
            {"$set": {"isRevoked": True}}
        )

        logger.info(f"User deactivated: {user_id}")

        return await UserService.get_user_by_id(user_id)


# Service instance
user_service = UserService()
