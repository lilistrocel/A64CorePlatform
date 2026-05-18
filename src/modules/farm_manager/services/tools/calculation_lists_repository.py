"""
Calculation Lists Repository

CRUD data-access layer for 'fertilizer_calculation_lists'.
Each list belongs to an organisation and was created by a user.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID, uuid4
import logging
import re

from ...services.database import farm_db
from ...models.tools.calculation_list import (
    CalculationList,
    CalculationListCreate,
    CalculationListUpdate,
)

logger = logging.getLogger(__name__)

COLLECTION = "fertilizer_calculation_lists"


class CalculationListsRepository:
    """Repository for saved fertilizer-cost calculation lists."""

    @staticmethod
    async def create(
        data: CalculationListCreate,
        organization_id: UUID,
        created_by: UUID,
    ) -> CalculationList:
        """
        Create a new saved calculation list.

        Args:
            data: Creation payload.
            organization_id: Organisation scope.
            created_by: User performing the action.

        Returns:
            The newly created CalculationList.
        """
        db = farm_db.get_database()
        now = datetime.utcnow()

        calc_list = CalculationList(
            listId=uuid4(),
            name=data.name,
            items=data.items,
            organizationId=organization_id,
            createdBy=created_by,
            createdAt=now,
            updatedAt=now,
        )

        doc = _to_doc(calc_list)
        await db[COLLECTION].insert_one(doc)

        logger.info(
            "[CalcListsRepo] Created list %s — '%s'",
            calc_list.listId,
            calc_list.name,
        )
        return calc_list

    @staticmethod
    async def list_paginated(
        organization_id: UUID,
        page: int = 1,
        size: int = 20,
        search: Optional[str] = None,
    ) -> Tuple[List[CalculationList], int]:
        """
        List saved lists for an organisation, newest first, paginated and
        optionally filtered by case-insensitive substring on `name`.

        Args:
            organization_id: Organisation scope.
            page: 1-indexed page number.
            size: Page size (max 200).
            search: Optional case-insensitive name substring filter.

        Returns:
            (items_for_page, total_match_count)
        """
        db = farm_db.get_database()
        query: Dict[str, Any] = {"organizationId": str(organization_id)}
        if search and search.strip():
            query["name"] = {
                "$regex": re.escape(search.strip()),
                "$options": "i",
            }

        total = await db[COLLECTION].count_documents(query)
        skip = max(0, (page - 1) * size)
        cursor = (
            db[COLLECTION]
            .find(query)
            .sort("createdAt", -1)
            .skip(skip)
            .limit(size)
        )
        docs = await cursor.to_list(length=size)
        return [_from_doc(d) for d in docs], total

    @staticmethod
    async def get_by_id(
        list_id: UUID,
        organization_id: UUID,
    ) -> Optional[CalculationList]:
        """
        Retrieve a list by ID, scoped to the organisation.

        Args:
            list_id: Target list UUID.
            organization_id: Organisation scope.

        Returns:
            CalculationList or None if not found.
        """
        db = farm_db.get_database()
        doc = await db[COLLECTION].find_one({
            "listId": str(list_id),
            "organizationId": str(organization_id),
        })
        return _from_doc(doc) if doc else None

    @staticmethod
    async def update(
        list_id: UUID,
        organization_id: UUID,
        data: CalculationListUpdate,
    ) -> Optional[CalculationList]:
        """
        Partially update a saved list.

        Args:
            list_id: Target list UUID.
            organization_id: Organisation scope.
            data: Fields to update.

        Returns:
            Updated CalculationList, or None if not found.
        """
        db = farm_db.get_database()
        updates: Dict[str, Any] = {"updatedAt": datetime.utcnow()}

        if data.name is not None:
            updates["name"] = data.name
        if data.items is not None:
            updates["items"] = [
                {"plantDataId": str(item.plantDataId), "points": item.points}
                for item in data.items
            ]

        result = await db[COLLECTION].find_one_and_update(
            {"listId": str(list_id), "organizationId": str(organization_id)},
            {"$set": updates},
            return_document=True,
        )
        return _from_doc(result) if result else None

    @staticmethod
    async def delete(
        list_id: UUID,
        organization_id: UUID,
    ) -> bool:
        """
        Hard-delete a saved list.

        Args:
            list_id: Target list UUID.
            organization_id: Organisation scope.

        Returns:
            True if deleted, False if not found.
        """
        db = farm_db.get_database()
        result = await db[COLLECTION].delete_one({
            "listId": str(list_id),
            "organizationId": str(organization_id),
        })
        return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _to_doc(calc_list: CalculationList) -> Dict[str, Any]:
    """Convert a CalculationList to a MongoDB document."""
    doc = calc_list.model_dump()
    doc["listId"] = str(doc["listId"])
    doc["organizationId"] = str(doc["organizationId"])
    doc["createdBy"] = str(doc["createdBy"])
    doc["items"] = [
        {"plantDataId": str(item["plantDataId"]), "points": item["points"]}
        for item in doc["items"]
    ]
    return doc


def _from_doc(doc: Dict[str, Any]) -> CalculationList:
    """Convert a raw MongoDB document to a CalculationList."""
    doc = dict(doc)
    doc.pop("_id", None)
    return CalculationList(**doc)
