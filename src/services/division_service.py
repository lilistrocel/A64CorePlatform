"""
Division Service

Business logic for CRUD operations on divisions.
Divisions are scoped to an organization and map to a specific industry type.
The select_division method updates the user's defaultDivisionId so subsequent
requests automatically context-switch to that division.
"""

import logging
from datetime import datetime
from typing import Optional, List

from fastapi import HTTPException, status

from ..models.division import (
    Division,
    DivisionCreate,
    DivisionResponse,
    DivisionSelectResponse,
    DivisionUpdate,
)
from .database import mongodb

logger = logging.getLogger(__name__)


class DivisionService:
    """Service for division management operations."""

    @staticmethod
    async def create_division(data: DivisionCreate) -> DivisionResponse:
        """
        Create a new division within an organization.

        Args:
            data: Validated division creation payload (includes organizationId).

        Returns:
            The newly created division as DivisionResponse.

        Raises:
            HTTPException 404: If the parent organization does not exist.
            HTTPException 409: If a division with the same divisionCode already exists
                               in the organization.
        """
        db = mongodb.get_database()
        orgs = db["organizations"]
        divisions = db["divisions"]

        # Reason: validate parent organization exists before creating child division
        org_doc = await orgs.find_one({"organizationId": data.organizationId})
        if not org_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{data.organizationId}' not found.",
            )

        # Reason: division codes must be unique per organization
        conflict = await divisions.find_one(
            {
                "organizationId": data.organizationId,
                "divisionCode": data.divisionCode,
            }
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Division code '{data.divisionCode}' already exists "
                    f"in organization '{data.organizationId}'."
                ),
            )

        division = Division(**data.model_dump())
        doc = division.model_dump()

        await divisions.insert_one(doc)
        logger.info(
            f"Created division '{division.name}' (id={division.divisionId}) "
            f"in organization '{division.organizationId}'"
        )

        return _doc_to_response(doc)

    @staticmethod
    async def get_division(division_id: str) -> Optional[DivisionResponse]:
        """
        Retrieve a single division by its ID.

        Args:
            division_id: The UUID string of the division.

        Returns:
            DivisionResponse if found, None otherwise.
        """
        db = mongodb.get_database()
        doc = await db["divisions"].find_one({"divisionId": division_id})
        if not doc:
            return None
        return _doc_to_response(doc)

    @staticmethod
    async def list_divisions(
        organization_id: Optional[str] = None,
        active_only: bool = True,
        skip: int = 0,
        limit: int = 50,
    ) -> List[DivisionResponse]:
        """
        List divisions, optionally filtered by organization.

        Args:
            organization_id: When provided, restrict results to this organization.
            active_only: When True, only return active divisions.
            skip: Number of documents to skip (for pagination).
            limit: Maximum number of documents to return.

        Returns:
            List of DivisionResponse objects.
        """
        db = mongodb.get_database()
        query: dict = {}
        if organization_id:
            query["organizationId"] = organization_id
        if active_only:
            query["isActive"] = True

        cursor = db["divisions"].find(query).sort("name", 1).skip(skip).limit(limit)
        results = []
        async for doc in cursor:
            results.append(_doc_to_response(doc))
        return results

    @staticmethod
    async def list_divisions_for_user(user_id: str) -> List[DivisionResponse]:
        """
        List all divisions accessible to a specific user.

        Currently returns all active divisions across all organizations.
        This will be restricted by user-organization membership in a future phase.

        Args:
            user_id: The UUID of the requesting user (reserved for future ACL use).

        Returns:
            List of DivisionResponse objects the user can access.
        """
        db = mongodb.get_database()
        # Reason: user document may carry an organizationId to scope their divisions
        user_doc = await db["users"].find_one({"userId": user_id})

        query: dict = {"isActive": True}
        if user_doc and user_doc.get("organizationId"):
            query["organizationId"] = user_doc["organizationId"]

        cursor = db["divisions"].find(query).sort("name", 1)
        results = []
        async for doc in cursor:
            results.append(_doc_to_response(doc))
        return results

    @staticmethod
    async def update_division(
        division_id: str, data: DivisionUpdate
    ) -> DivisionResponse:
        """
        Partially update a division.

        Args:
            division_id: The UUID string of the division to update.
            data: Fields to update (only set fields are applied).

        Returns:
            Updated DivisionResponse.

        Raises:
            HTTPException 404: If the division does not exist.
            HTTPException 409: If the new divisionCode conflicts within the same org.
        """
        db = mongodb.get_database()
        collection = db["divisions"]

        existing = await collection.find_one({"divisionId": division_id})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Division '{division_id}' not found.",
            )

        update_fields = data.model_dump(exclude_none=True)

        # Reason: prevent duplicate division codes within the same organization
        if (
            "divisionCode" in update_fields
            and update_fields["divisionCode"] != existing["divisionCode"]
        ):
            conflict = await collection.find_one(
                {
                    "organizationId": existing["organizationId"],
                    "divisionCode": update_fields["divisionCode"],
                    "divisionId": {"$ne": division_id},
                }
            )
            if conflict:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Division code '{update_fields['divisionCode']}' already "
                        f"exists in this organization."
                    ),
                )

        update_fields["updatedAt"] = datetime.utcnow()

        await collection.update_one(
            {"divisionId": division_id},
            {"$set": update_fields},
        )

        updated_doc = await collection.find_one({"divisionId": division_id})
        logger.info(f"Updated division '{division_id}'")
        return _doc_to_response(updated_doc)

    @staticmethod
    async def select_division(
        user_id: str, division_id: str
    ) -> DivisionSelectResponse:
        """
        Set the active division for a user by updating their defaultDivisionId.

        Args:
            user_id: The UUID of the user switching divisions.
            division_id: The UUID of the division to activate.

        Returns:
            DivisionSelectResponse with confirmation details.

        Raises:
            HTTPException 404: If the division does not exist or is not active.
        """
        db = mongodb.get_database()

        division_doc = await db["divisions"].find_one(
            {"divisionId": division_id, "isActive": True}
        )
        if not division_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Division '{division_id}' not found or is inactive.",
            )

        # Reason: persist the user's preferred division so future sessions
        # can restore it automatically without requiring the header every time
        await db["users"].update_one(
            {"userId": user_id},
            {
                "$set": {
                    "defaultDivisionId": division_id,
                    "updatedAt": datetime.utcnow(),
                }
            },
        )

        logger.info(f"User '{user_id}' selected division '{division_id}'")

        return DivisionSelectResponse(
            divisionId=division_doc["divisionId"],
            divisionName=division_doc["name"],
            industryType=division_doc["industryType"],
            message="Division selected successfully",
        )


def _doc_to_response(doc: dict) -> DivisionResponse:
    """
    Convert a raw MongoDB document to a DivisionResponse.

    Args:
        doc: Raw MongoDB document from the divisions collection.

    Returns:
        DivisionResponse populated from the document.
    """
    return DivisionResponse(
        divisionId=doc["divisionId"],
        organizationId=doc["organizationId"],
        name=doc["name"],
        divisionCode=doc["divisionCode"],
        industryType=doc["industryType"],
        description=doc.get("description"),
        settings=doc.get("settings", {}),
        isActive=doc["isActive"],
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
    )


division_service = DivisionService()
