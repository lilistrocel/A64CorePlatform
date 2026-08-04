"""
Chemicals Service

High-level business logic for the FertilizerChemical catalog:
- discover_from_plant_library: walks all plant_data_enhanced documents and
  auto-creates chemicals for ingredient names not yet in the catalog.
  Archive-aware: names that match an archived chemical are NOT auto-created
  (doing so would silently defeat the archive).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from uuid import UUID
import logging

from ...services.database import farm_db
from ...models.tools.fertilizer_chemical import FertilizerChemical, ChemicalCreate
from ...models.plant_data_enhanced import (
    IngredientCategoryEnum,
    FertigationRuleTypeEnum,
)
from .chemicals_repository import ChemicalsRepository

logger = logging.getLogger(__name__)

# Unit → defaultUnit mapping for auto-discovered chemicals
# Only g→kg and ml→L conversions are supported for pricing purposes.
_UNIT_TO_DEFAULT: dict = {
    "g": "kg",
    "kg": "kg",
    "ml": "L",
    "L": "L",
}


@dataclass
class ArchivedChemicalMatch:
    """
    Sentinel returned by resolve_ingredient_name when the ingredient matches
    an archived (soft-deleted) chemical.

    The calculator uses this to emit a warning and leave cost fields as None
    without re-creating the archived record.
    """

    canonical_name: str
    archived_at: datetime


class ChemicalsService:
    """
    High-level service for the chemical catalog.

    Discover mode scans the entire plant library for ingredient names and
    auto-creates FertilizerChemical entries for any that are missing.
    Archive-aware: if an ingredient name matches an archived chemical it is
    silently skipped — the chemical is NOT auto-resurrected or duplicated.
    """

    @staticmethod
    async def discover_from_plant_library(
        organization_id: UUID,
        created_by: UUID,
    ) -> List[FertilizerChemical]:
        """
        Walk all active plant_data_enhanced documents, collect unique ingredient
        names from fertigation schedules, and insert chemicals for those not
        already in the catalog.

        This is idempotent: running it multiple times will only create chemicals
        for names that have not been seen before.

        Archive-aware behaviour:
        - If a name matches an ACTIVE chemical (by name or alias) → skip (already
          catalogued), existing behaviour unchanged.
        - If a name matches an ARCHIVED chemical (by name or alias) → skip WITHOUT
          auto-creating, so the archive is not defeated.
        - If a name has no match at all → auto-create as new active chemical,
          existing behaviour unchanged.

        Args:
            organization_id: Organisation scope for the new chemicals.
            created_by: User triggering the discovery (for audit trail).

        Returns:
            List of newly created FertilizerChemical documents (empty if none found).
        """
        db = farm_db.get_database()

        # Reason: only walk active plant docs that have a fertigation schedule
        cursor = db.plant_data_enhanced.find(
            {
                "deletedAt": None,
                "fertigationSchedule": {"$ne": None},
            },
            {"fertigationSchedule": 1, "plantName": 1},
        )
        docs = await cursor.to_list(length=None)

        # Collect (name, category, unit) tuples from every ingredient
        # Keys: ingredient name (stripped lowercase) → (original_name, category, unit)
        seen: dict = {}

        for doc in docs:
            schedule = doc.get("fertigationSchedule") or {}
            for card in schedule.get("cards", []):
                for rule in card.get("rules", []):
                    rule_type = rule.get("type", "")

                    if rule_type == FertigationRuleTypeEnum.INTERVAL.value:
                        for ing in rule.get("ingredients") or []:
                            _record_ingredient(ing, seen)

                    elif rule_type == FertigationRuleTypeEnum.CUSTOM.value:
                        for app in rule.get("applications") or []:
                            for ing in app.get("ingredients") or []:
                                _record_ingredient(ing, seen)

        if not seen:
            logger.info(
                "[ChemicalsService] No ingredients found in plant library for org %s",
                organization_id,
            )
            return []

        # Reason: fetch ALL chemicals (including archived) so we can detect archived matches
        # and skip them rather than auto-creating duplicates.
        all_existing = await ChemicalsRepository.list_all(
            organization_id, include_archived=True
        )

        # Build two lookup sets:
        # - active_names_lower: names/aliases of ACTIVE chemicals → already catalogued, skip
        # - archived_names_lower: names/aliases of ARCHIVED chemicals → do not auto-resurrect
        active_names_lower: set = set()
        archived_names_lower: set = set()

        for c in all_existing:
            names = [c.name.strip().lower()] + [a.strip().lower() for a in c.aliases]
            if c.archivedAt is None:
                active_names_lower.update(names)
            else:
                archived_names_lower.update(names)

        new_chemicals: List[FertilizerChemical] = []

        for key, (original_name, category, unit) in seen.items():
            if key in active_names_lower:
                continue  # Already catalogued as active

            if key in archived_names_lower:
                # Reason: do NOT auto-resurrect an archived chemical — the archive was
                # intentional. The calculator will emit a warning separately.
                logger.debug(
                    "[ChemicalsService] Skipping archived match '%s' — will not auto-resurrect",
                    original_name,
                )
                continue

            default_unit = _UNIT_TO_DEFAULT.get(unit, "kg")

            try:
                chemical = await ChemicalsRepository.create(
                    ChemicalCreate(
                        name=original_name,
                        aliases=[],
                        category=category,
                        defaultUnit=default_unit,
                        notes="Auto-discovered from plant library",
                    ),
                    organization_id=organization_id,
                    created_by=created_by,
                )
                new_chemicals.append(chemical)
                active_names_lower.add(key)  # Prevent duplicate inserts in same pass
            except ValueError:
                # Reason: another concurrent call may have inserted the same name
                logger.debug(
                    "[ChemicalsService] Skipping duplicate '%s' — already exists",
                    original_name,
                )

        logger.info(
            "[ChemicalsService] Discovered %d new chemicals for org %s",
            len(new_chemicals),
            organization_id,
        )
        return new_chemicals

    @staticmethod
    async def build_chemical_lookup(
        organization_id: UUID,
    ) -> Tuple[Dict[str, FertilizerChemical], Dict[str, "ArchivedChemicalMatch"]]:
        """
        Build two name-keyed lookup dictionaries for all chemicals in the org.

        Used by the calculator so it can distinguish between:
        - Active chemical  → resolve price normally
        - Archived chemical → emit warning, leave cost as None
        - Unknown name     → auto-discover (separate step)

        Args:
            organization_id: Organisation scope.

        Returns:
            Tuple of:
              - active_by_name: lower-case name/alias → FertilizerChemical (active only)
              - archived_by_name: lower-case name/alias → ArchivedChemicalMatch
        """
        all_chemicals = await ChemicalsRepository.list_all(
            organization_id, include_archived=True
        )

        active_by_name: Dict[str, FertilizerChemical] = {}
        archived_by_name: Dict[str, ArchivedChemicalMatch] = {}

        for c in sorted(all_chemicals, key=lambda x: str(x.chemicalId)):
            all_names = [c.name.strip().lower()] + [
                a.strip().lower() for a in c.aliases
            ]
            if c.archivedAt is None:
                for n in all_names:
                    if n not in active_by_name:
                        active_by_name[n] = c
            else:
                sentinel = ArchivedChemicalMatch(
                    canonical_name=c.name,
                    archived_at=c.archivedAt,
                )
                for n in all_names:
                    # Reason: active chemicals take priority if a name appears in both
                    if n not in active_by_name and n not in archived_by_name:
                        archived_by_name[n] = sentinel

        return active_by_name, archived_by_name


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _record_ingredient(ing: dict, seen: dict) -> None:
    """
    Add an ingredient to the discovery map.

    Args:
        ing: Raw ingredient dict from a MongoDB document.
        seen: Accumulator dict mapping name_lower → (original_name, category, unit).
    """
    name = (ing.get("name") or "").strip()
    if not name:
        return
    key = name.lower()
    if key in seen:
        return  # First occurrence wins for category/unit

    category_str = ing.get("category", IngredientCategoryEnum.OTHER.value)
    try:
        category = IngredientCategoryEnum(category_str)
    except ValueError:
        category = IngredientCategoryEnum.OTHER

    unit = (ing.get("unit") or "g").strip()
    seen[key] = (name, category, unit)
