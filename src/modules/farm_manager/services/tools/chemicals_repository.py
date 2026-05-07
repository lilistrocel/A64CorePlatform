"""
Chemicals Repository

CRUD data-access layer for the 'fertilizer_chemicals' collection.
Implements soft-delete (archivedAt) with dependency checking against
plant_data_enhanced fertigation schedules.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
import logging

from ...services.database import farm_db
from ...models.tools.fertilizer_chemical import (
    FertilizerChemical,
    ChemicalCreate,
    ChemicalUpdate,
)

logger = logging.getLogger(__name__)

COLLECTION = "fertilizer_chemicals"
PLANT_COLLECTION = "plant_data_enhanced"


class ChemicalsRepository:
    """
    Repository for FertilizerChemical documents.

    All queries are scoped to a single organisation and exclude archived
    documents by default (archived=False filter).
    """

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    @staticmethod
    async def create(
        data: ChemicalCreate,
        organization_id: UUID,
        created_by: UUID,
    ) -> FertilizerChemical:
        """
        Insert a new FertilizerChemical document.

        Enforces case-insensitive uniqueness of the canonical name within the
        organisation (only among non-archived records).

        Args:
            data: Creation payload.
            organization_id: Organisation scope.
            created_by: User performing the action.

        Returns:
            The newly created FertilizerChemical.

        Raises:
            ValueError: If a non-archived chemical with the same name already exists.
        """
        db = farm_db.get_database()

        # Reason: case-insensitive uniqueness check
        existing = await db[COLLECTION].find_one({
            "organizationId": str(organization_id),
            "archivedAt": None,
            "name": {"$regex": f"^{_escape_regex(data.name.strip())}$", "$options": "i"},
        })
        if existing:
            raise ValueError(f"A chemical named '{data.name}' already exists in this organisation")

        now = datetime.utcnow()
        chemical = FertilizerChemical(
            chemicalId=uuid4(),
            name=data.name.strip(),
            aliases=[a.strip() for a in data.aliases],
            category=data.category,
            defaultUnit=data.defaultUnit,
            notes=data.notes,
            archivedAt=None,
            organizationId=organization_id,
            createdBy=created_by,
            createdAt=now,
            updatedAt=now,
        )

        doc = _to_doc(chemical)
        await db[COLLECTION].insert_one(doc)

        logger.info(
            "[ChemicalsRepository] Created chemical %s — '%s'",
            chemical.chemicalId,
            chemical.name,
        )
        return chemical

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    @staticmethod
    async def list_all(
        organization_id: UUID,
        include_archived: bool = False,
    ) -> List[FertilizerChemical]:
        """
        List chemicals for an organisation.

        Args:
            organization_id: Organisation scope.
            include_archived: When True, archived chemicals are included.

        Returns:
            List of FertilizerChemical objects.
        """
        db = farm_db.get_database()

        query: Dict[str, Any] = {"organizationId": str(organization_id)}
        if not include_archived:
            query["archivedAt"] = None

        cursor = db[COLLECTION].find(query).sort("name", 1)
        docs = await cursor.to_list(length=None)
        return [_from_doc(d) for d in docs]

    @staticmethod
    async def get_by_id(
        chemical_id: UUID,
        organization_id: UUID,
    ) -> Optional[FertilizerChemical]:
        """
        Retrieve a chemical by ID, scoped to the organisation.

        Args:
            chemical_id: Target chemical UUID.
            organization_id: Organisation scope.

        Returns:
            FertilizerChemical or None if not found.
        """
        db = farm_db.get_database()
        doc = await db[COLLECTION].find_one({
            "chemicalId": str(chemical_id),
            "organizationId": str(organization_id),
        })
        return _from_doc(doc) if doc else None

    @staticmethod
    async def get_by_name(
        name: str,
        organization_id: UUID,
        include_archived: bool = False,
    ) -> Optional[FertilizerChemical]:
        """
        Retrieve a chemical by its canonical name (case-insensitive).

        Args:
            name: Name to search for.
            organization_id: Organisation scope.
            include_archived: Include archived records in the search.

        Returns:
            FertilizerChemical or None.
        """
        db = farm_db.get_database()
        query: Dict[str, Any] = {
            "organizationId": str(organization_id),
            "name": {"$regex": f"^{_escape_regex(name.strip())}$", "$options": "i"},
        }
        if not include_archived:
            query["archivedAt"] = None
        doc = await db[COLLECTION].find_one(query)
        return _from_doc(doc) if doc else None

    @staticmethod
    async def find_by_name_or_alias(
        name: str,
        organization_id: UUID,
        include_archived: bool = False,
    ) -> List[FertilizerChemical]:
        """
        Find chemicals whose canonical name OR any alias matches `name`
        (case-insensitive, exact match).

        Args:
            name: Name or alias to search.
            organization_id: Organisation scope.
            include_archived: Include archived records.

        Returns:
            List of matching FertilizerChemical objects (may contain >1 if there are
            conflicts between name/alias assignments across chemicals).
        """
        db = farm_db.get_database()
        pattern = {"$regex": f"^{_escape_regex(name.strip())}$", "$options": "i"}
        query: Dict[str, Any] = {
            "organizationId": str(organization_id),
            "$or": [{"name": pattern}, {"aliases": pattern}],
        }
        if not include_archived:
            query["archivedAt"] = None
        cursor = db[COLLECTION].find(query).sort("createdAt", 1)
        docs = await cursor.to_list(length=None)
        return [_from_doc(d) for d in docs]

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    @staticmethod
    async def update(
        chemical_id: UUID,
        organization_id: UUID,
        data: ChemicalUpdate,
    ) -> Optional[FertilizerChemical]:
        """
        Partially update a chemical.

        Args:
            chemical_id: Target chemical UUID.
            organization_id: Organisation scope.
            data: Fields to update.

        Returns:
            Updated FertilizerChemical, or None if not found.

        Raises:
            ValueError: If the new name conflicts with another existing chemical.
        """
        db = farm_db.get_database()

        updates: Dict[str, Any] = {"updatedAt": datetime.utcnow()}

        if data.name is not None:
            new_name = data.name.strip()
            # Reason: prevent name collision (case-insensitive)
            conflict = await db[COLLECTION].find_one({
                "organizationId": str(organization_id),
                "archivedAt": None,
                "chemicalId": {"$ne": str(chemical_id)},
                "name": {"$regex": f"^{_escape_regex(new_name)}$", "$options": "i"},
            })
            if conflict:
                raise ValueError(f"A chemical named '{new_name}' already exists")
            updates["name"] = new_name

        if data.aliases is not None:
            updates["aliases"] = [a.strip() for a in data.aliases]
        if data.category is not None:
            updates["category"] = data.category.value
        if data.defaultUnit is not None:
            updates["defaultUnit"] = data.defaultUnit
        if data.notes is not None:
            updates["notes"] = data.notes

        # Reason: 'archivedAt' can legitimately be set to None (unarchive) or a datetime
        # (archive), so we check model_fields_set rather than `is not None`.
        if "archivedAt" in data.model_fields_set:
            updates["archivedAt"] = data.archivedAt

        result = await db[COLLECTION].find_one_and_update(
            {"chemicalId": str(chemical_id), "organizationId": str(organization_id)},
            {"$set": updates},
            return_document=True,
        )
        return _from_doc(result) if result else None

    # ------------------------------------------------------------------
    # Soft-delete
    # ------------------------------------------------------------------

    @staticmethod
    async def check_dependents(
        chemical_id: UUID,
        organization_id: UUID,
    ) -> List[Dict[str, str]]:
        """
        Return plant_data_enhanced entries whose fertigation schedules reference
        this chemical (by name or alias match).

        Args:
            chemical_id: Chemical to check.
            organization_id: Organisation scope.

        Returns:
            List of dicts with 'plantDataId' and 'plantName'.
        """
        db = farm_db.get_database()

        chemical = await ChemicalsRepository.get_by_id(chemical_id, organization_id)
        if not chemical:
            return []

        all_names = [chemical.name] + list(chemical.aliases)
        # Reason: MongoDB rejects $regex inside $in. Combine all names into one
        # case-insensitive regex with alternation for the elemMatch lookup.
        combined = "|".join(_escape_regex(n) for n in all_names)
        name_match = {"$regex": f"^({combined})$", "$options": "i"}

        # Reason: search nested ingredient names inside fertigation schedule cards/rules
        cursor = db[PLANT_COLLECTION].find(
            {
                "deletedAt": None,
                "fertigationSchedule.cards": {
                    "$elemMatch": {
                        "rules": {
                            "$elemMatch": {
                                "$or": [
                                    {"ingredients": {"$elemMatch": {"name": name_match}}},
                                    {
                                        "applications": {
                                            "$elemMatch": {
                                                "ingredients": {
                                                    "$elemMatch": {"name": name_match}
                                                }
                                            }
                                        }
                                    },
                                ]
                            }
                        }
                    }
                },
            },
            {"plantDataId": 1, "plantName": 1},
        )
        docs = await cursor.to_list(length=None)
        return [{"plantDataId": d["plantDataId"], "plantName": d["plantName"]} for d in docs]

    @staticmethod
    async def archive(
        chemical_id: UUID,
        organization_id: UUID,
    ) -> Optional[FertilizerChemical]:
        """
        Soft-delete a chemical by setting archivedAt.

        Call check_dependents() first and enforce the 'force' policy in the
        service/API layer — this method always archives unconditionally.

        Args:
            chemical_id: Target chemical UUID.
            organization_id: Organisation scope.

        Returns:
            Updated FertilizerChemical, or None if not found.
        """
        db = farm_db.get_database()
        now = datetime.utcnow()
        result = await db[COLLECTION].find_one_and_update(
            {"chemicalId": str(chemical_id), "organizationId": str(organization_id)},
            {"$set": {"archivedAt": now, "updatedAt": now}},
            return_document=True,
        )
        return _from_doc(result) if result else None

    # ------------------------------------------------------------------
    # Bulk operations (used by discover service)
    # ------------------------------------------------------------------

    @staticmethod
    async def bulk_insert(chemicals: List[FertilizerChemical]) -> None:
        """
        Insert multiple chemicals at once.

        Args:
            chemicals: List of FertilizerChemical objects to insert.
        """
        if not chemicals:
            return
        db = farm_db.get_database()
        docs = [_to_doc(c) for c in chemicals]
        await db[COLLECTION].insert_many(docs, ordered=False)
        logger.info("[ChemicalsRepository] Bulk-inserted %d chemicals", len(chemicals))


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _escape_regex(text: str) -> str:
    """Escape special regex characters in a string for safe use in $regex."""
    special = r"\.^$*+?{}[]|()"
    return "".join(f"\\{c}" if c in special else c for c in text)


def _to_doc(chemical: FertilizerChemical) -> Dict[str, Any]:
    """
    Convert a FertilizerChemical Pydantic model to a MongoDB document dict.

    Converts UUID fields to strings so Motor can serialise them correctly.
    """
    doc = chemical.model_dump()
    doc["chemicalId"] = str(doc["chemicalId"])
    doc["organizationId"] = str(doc["organizationId"])
    doc["createdBy"] = str(doc["createdBy"])
    # category enum → string value
    if hasattr(doc.get("category"), "value"):
        doc["category"] = doc["category"].value
    return doc


def _from_doc(doc: Dict[str, Any]) -> FertilizerChemical:
    """
    Convert a raw MongoDB document to a FertilizerChemical Pydantic model.

    Args:
        doc: Raw dict from Motor.

    Returns:
        FertilizerChemical instance.
    """
    doc = dict(doc)
    doc.pop("_id", None)
    return FertilizerChemical(**doc)
