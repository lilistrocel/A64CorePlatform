"""
Organization Service

Business logic for CRUD operations on organizations.
Organizations are the top-level tenancy unit; each may have multiple divisions.
"""

import logging
from datetime import datetime
from typing import Optional, List

from fastapi import HTTPException, status

from ..models.organization import (
    Organization,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
)
from .database import mongodb

logger = logging.getLogger(__name__)


class OrganizationService:
    """Service for organization management operations."""

    @staticmethod
    async def create_organization(data: OrganizationCreate) -> OrganizationResponse:
        """
        Create a new organization.

        Args:
            data: Validated organization creation payload.

        Returns:
            The newly created organization as OrganizationResponse.

        Raises:
            HTTPException 409: If an organization with the same slug already exists.
        """
        db = mongodb.get_database()
        collection = db["organizations"]

        # Reason: slug must be globally unique — used as human-friendly identifier
        existing = await collection.find_one({"slug": data.slug})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An organization with slug '{data.slug}' already exists.",
            )

        org = Organization(**data.model_dump())
        doc = org.model_dump()

        await collection.insert_one(doc)
        logger.info(f"Created organization '{org.name}' (id={org.organizationId})")

        return OrganizationResponse(
            organizationId=org.organizationId,
            name=org.name,
            slug=org.slug,
            industries=org.industries,
            logoUrl=org.logoUrl,
            isActive=org.isActive,
            createdAt=org.createdAt,
            updatedAt=org.updatedAt,
        )

    @staticmethod
    async def get_organization(organization_id: str) -> Optional[OrganizationResponse]:
        """
        Retrieve a single organization by its ID.

        Args:
            organization_id: The UUID string of the organization.

        Returns:
            OrganizationResponse if found, None otherwise.
        """
        db = mongodb.get_database()
        collection = db["organizations"]

        doc = await collection.find_one({"organizationId": organization_id})
        if not doc:
            return None

        return OrganizationResponse(
            organizationId=doc["organizationId"],
            name=doc["name"],
            slug=doc["slug"],
            industries=doc.get("industries", []),
            logoUrl=doc.get("logoUrl"),
            isActive=doc["isActive"],
            createdAt=doc["createdAt"],
            updatedAt=doc["updatedAt"],
        )

    @staticmethod
    async def list_organizations(
        skip: int = 0, limit: int = 50, active_only: bool = True
    ) -> List[OrganizationResponse]:
        """
        List organizations with optional pagination.

        Args:
            skip: Number of documents to skip (for pagination).
            limit: Maximum number of documents to return.
            active_only: When True, only return active organizations.

        Returns:
            List of OrganizationResponse objects.
        """
        db = mongodb.get_database()
        collection = db["organizations"]

        query: dict = {}
        if active_only:
            query["isActive"] = True

        cursor = collection.find(query).sort("name", 1).skip(skip).limit(limit)
        results = []

        async for doc in cursor:
            results.append(
                OrganizationResponse(
                    organizationId=doc["organizationId"],
                    name=doc["name"],
                    slug=doc["slug"],
                    industries=doc.get("industries", []),
                    logoUrl=doc.get("logoUrl"),
                    isActive=doc["isActive"],
                    createdAt=doc["createdAt"],
                    updatedAt=doc["updatedAt"],
                )
            )

        return results

    @staticmethod
    async def update_organization(
        organization_id: str, data: OrganizationUpdate
    ) -> OrganizationResponse:
        """
        Partially update an organization.

        Args:
            organization_id: The UUID string of the organization to update.
            data: Fields to update (only set fields are applied).

        Returns:
            Updated OrganizationResponse.

        Raises:
            HTTPException 404: If the organization does not exist.
            HTTPException 409: If the new slug conflicts with another organization.
        """
        db = mongodb.get_database()
        collection = db["organizations"]

        existing = await collection.find_one({"organizationId": organization_id})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{organization_id}' not found.",
            )

        # Reason: prevent slug collision with a different organization
        update_fields = data.model_dump(exclude_none=True)
        if "slug" in update_fields and update_fields["slug"] != existing["slug"]:
            slug_conflict = await collection.find_one(
                {"slug": update_fields["slug"], "organizationId": {"$ne": organization_id}}
            )
            if slug_conflict:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Slug '{update_fields['slug']}' is already in use.",
                )

        update_fields["updatedAt"] = datetime.utcnow()

        await collection.update_one(
            {"organizationId": organization_id},
            {"$set": update_fields},
        )

        updated_doc = await collection.find_one({"organizationId": organization_id})
        logger.info(f"Updated organization '{organization_id}'")

        return OrganizationResponse(
            organizationId=updated_doc["organizationId"],
            name=updated_doc["name"],
            slug=updated_doc["slug"],
            industries=updated_doc.get("industries", []),
            logoUrl=updated_doc.get("logoUrl"),
            isActive=updated_doc["isActive"],
            createdAt=updated_doc["createdAt"],
            updatedAt=updated_doc["updatedAt"],
        )


organization_service = OrganizationService()
