"""
Price Book

Resolves the price of a set of chemicals for a given organisation.

Resolution order:
1. fertilizer_price_overrides (manual override)
2. inventory_input where category='fertilizer' and name matches chemical name or alias
3. source='none' — price unknown
"""

from typing import Dict, List
from uuid import UUID
import logging

from ...services.database import farm_db
from ...models.tools.fertilizer_chemical import FertilizerChemical
from ...models.tools.fertilizer_price import ResolvedPrice
from .chemicals_repository import ChemicalsRepository, _escape_regex

logger = logging.getLogger(__name__)

OVERRIDES_COLLECTION = "fertilizer_price_overrides"
INVENTORY_COLLECTION = "inventory_input"


class PriceBook:
    """
    Resolves prices for a list of chemicals.

    Uses a two-step lookup:
    1. Check fertilizer_price_overrides for a manual AED price per defaultUnit.
    2. Fall back to inventory_input (category=fertilizer) using itemName match
       against chemical.name or chemical.aliases.
    """

    @staticmethod
    async def resolve_prices(
        chemicals: List[FertilizerChemical],
        organization_id: UUID,
    ) -> Dict[str, ResolvedPrice]:
        """
        Resolve prices for a list of chemicals.

        Args:
            chemicals: Chemicals to price.
            organization_id: Organisation scope.

        Returns:
            Dict mapping str(chemicalId) → ResolvedPrice.
        """
        db = farm_db.get_database()
        org_str = str(organization_id)
        result: Dict[str, ResolvedPrice] = {}

        # --- Step 1: batch-fetch all overrides for this org ---
        chemical_ids = [str(c.chemicalId) for c in chemicals]
        override_cursor = db[OVERRIDES_COLLECTION].find(
            {"organizationId": org_str, "chemicalId": {"$in": chemical_ids}}
        )
        override_docs = await override_cursor.to_list(length=None)
        overrides_by_chemical: Dict[str, float] = {
            d["chemicalId"]: d["price"] for d in override_docs
        }

        # --- Step 2: for chemicals without an override, check inventory ---
        unresolved: List[FertilizerChemical] = []
        for chemical in chemicals:
            cid = str(chemical.chemicalId)
            if cid in overrides_by_chemical:
                result[cid] = ResolvedPrice(
                    chemicalId=chemical.chemicalId,
                    price=overrides_by_chemical[cid],
                    source="override",
                )
            else:
                unresolved.append(chemical)

        if unresolved:
            await _resolve_from_inventory(unresolved, org_str, db, result)

        # --- Step 3: any still unresolved → source='none' ---
        for chemical in chemicals:
            cid = str(chemical.chemicalId)
            if cid not in result:
                result[cid] = ResolvedPrice(
                    chemicalId=chemical.chemicalId,
                    price=None,
                    source="none",
                )

        return result


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

async def _resolve_from_inventory(
    chemicals: List[FertilizerChemical],
    org_str: str,
    db,
    result: Dict[str, ResolvedPrice],
) -> None:
    """
    Attempt to resolve prices from inventory_input for the given chemicals.

    Matches inventory itemName against chemical.name OR any alias using
    case-insensitive exact match.

    Args:
        chemicals: Chemicals that still need pricing.
        org_str: Organisation ID string.
        db: Motor database handle.
        result: Accumulator dict to write results into.
    """
    for chemical in chemicals:
        all_names = [chemical.name] + list(chemical.aliases)
        # Reason: MongoDB rejects $regex inside $in. Use $or with one $regex per name.
        name_clauses = [
            {"itemName": {"$regex": f"^{_escape_regex(n)}$", "$options": "i"}}
            for n in all_names
        ]

        # Reason: look up fertilizer inventory by name match; prefer non-null unitCost
        inv_doc = await db[INVENTORY_COLLECTION].find_one(
            {
                "organizationId": org_str,
                "category": "fertilizer",
                "$or": name_clauses,
                "unitCost": {"$ne": None},
            }
        )

        cid = str(chemical.chemicalId)
        if inv_doc and inv_doc.get("unitCost") is not None:
            result[cid] = ResolvedPrice(
                chemicalId=chemical.chemicalId,
                price=float(inv_doc["unitCost"]),
                source="inventory",
            )
