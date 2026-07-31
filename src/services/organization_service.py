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
    OrganizationModules,
    OrganizationResponse,
    OrganizationUpdate,
    PublicInfoPageConfig,
    PublicInfoPageConfigUpdate,
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
            modules=org.modules,
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
            modules=OrganizationModules(**doc.get("modules", {})),
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
                    modules=OrganizationModules(**doc.get("modules", {})),
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
            modules=OrganizationModules(**updated_doc.get("modules", {})),
            isActive=updated_doc["isActive"],
            createdAt=updated_doc["createdAt"],
            updatedAt=updated_doc["updatedAt"],
        )

    @staticmethod
    async def update_modules(
        organization_id: str,
        financeEnabled: Optional[bool],
        publicInfoPage: Optional[PublicInfoPageConfigUpdate] = None,
    ) -> OrganizationResponse:
        """
        Partially update a tenant's per-module toggles (Wave 0 — T-059.4;
        `publicInfoPage` added as the T-804 follow-up making that page's
        `enabled` switch operable).

        Only set fields are applied. Returns the updated organization.

        Args:
            organization_id: UUID string of the organization.
            financeEnabled: New value for modules.financeEnabled, or None
                to leave unchanged.
            publicInfoPage: Partial update for modules.publicInfoPage — only
                the fields explicitly set on it are merged into the stored
                config. Fields left `None` keep their current stored value
                (or the `PublicInfoPageConfig` default for a tenant that
                predates this field entirely); they are never reset to the
                model's defaults as a side effect of an unrelated flag
                changing. See `PublicInfoPageConfigUpdate` for why this
                can't just be a full `PublicInfoPageConfig`.

        Returns:
            Updated OrganizationResponse.

        Raises:
            HTTPException 404: If the organization does not exist.
        """
        db = mongodb.get_database()
        collection = db["organizations"]

        existing = await collection.find_one({"organizationId": organization_id})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{organization_id}' not found.",
            )

        set_fields: dict = {"updatedAt": datetime.utcnow()}
        if financeEnabled is not None:
            set_fields["modules.financeEnabled"] = financeEnabled

        if publicInfoPage is not None:
            patch = publicInfoPage.model_dump(exclude_none=True)
            if patch:
                # Reason: merge onto the stored config (falling back to
                # PublicInfoPageConfig's own defaults for a tenant that
                # predates this field) so patching one flag can never
                # silently reset a sibling privacy flag — e.g. sending
                # {"enabled": false} must not also zero out
                # showOperatorName.
                stored_public_info = (
                    existing.get("modules", {}).get("publicInfoPage") or {}
                )
                merged_public_info = {
                    **PublicInfoPageConfig().model_dump(),
                    **stored_public_info,
                    **patch,
                }
                set_fields["modules.publicInfoPage"] = merged_public_info

        if len(set_fields) == 1:
            # Reason: nothing to change beyond updatedAt — skip the write.
            updated_doc = existing
        else:
            await collection.update_one(
                {"organizationId": organization_id},
                {"$set": set_fields},
            )
            updated_doc = await collection.find_one(
                {"organizationId": organization_id}
            )
            logger.info(
                f"Updated organization modules for '{organization_id}': "
                f"{set_fields}"
            )

        return OrganizationResponse(
            organizationId=updated_doc["organizationId"],
            name=updated_doc["name"],
            slug=updated_doc["slug"],
            industries=updated_doc.get("industries", []),
            logoUrl=updated_doc.get("logoUrl"),
            modules=OrganizationModules(**updated_doc.get("modules", {})),
            isActive=updated_doc["isActive"],
            createdAt=updated_doc["createdAt"],
            updatedAt=updated_doc["updatedAt"],
        )


organization_service = OrganizationService()
