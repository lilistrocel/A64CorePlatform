"""
Genetics Repo Module - Dashboard Service

Rollups for the repo home header: what is alive, what is at risk, and what
happened recently.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List

from pydantic import BaseModel, Field

from ..models.enums import AccessionStatus
from .database import ACCESSIONS, BATCHES, LINES, OBSERVATIONS, PROPAGATIONS, genetics_db

logger = logging.getLogger(__name__)

# Clone generations at or above this depth are surfaced as a senescence watch.
# Vigour loss in serially transferred cultures typically shows somewhere past
# the fifth transfer, so this is a prompt to re-isolate, not a hard rule.
SENESCENCE_WATCH_GENERATION = 5

RECENT_ACTIVITY_DAYS = 30


class KindBreakdown(BaseModel):
    """Line counts per biological domain."""
    plant: int = 0
    fungus: int = 0
    animal: int = 0
    other: int = 0


class GeneticsDashboard(BaseModel):
    """Summary payload for the genetics repo home."""

    totalLines: int = 0
    activeLines: int = 0
    linesByKind: KindBreakdown = Field(default_factory=KindBreakdown)

    totalAccessions: int = 0
    activeAccessions: int = 0
    contaminatedAccessions: int = 0
    totalVessels: int = Field(0, description="Vessels/head held across active accessions")

    propagationsLast30Days: int = 0
    observationsLast30Days: int = 0
    novelTraitsPending: int = Field(
        0, description="Observations flagged novel but not yet promoted"
    )

    senescenceWatchCount: int = Field(
        0, description=f"Active accessions at G{SENESCENCE_WATCH_GENERATION} or deeper"
    )
    mediumBatchesActive: int = 0


class DashboardService:
    """Aggregates repo-wide counters."""

    @staticmethod
    async def get_dashboard() -> GeneticsDashboard:
        db = genetics_db.get_database()
        since = datetime.utcnow() - timedelta(days=RECENT_ACTIVITY_DAYS)

        total_lines = await db[LINES].count_documents({})
        active_lines = await db[LINES].count_documents({"isActive": True})

        kinds: Dict[str, int] = {}
        async for row in db[LINES].aggregate(
            [{"$group": {"_id": "$kind", "count": {"$sum": 1}}}]
        ):
            if row["_id"]:
                kinds[row["_id"]] = row["count"]

        total_accessions = await db[ACCESSIONS].count_documents({})
        active_accessions = await db[ACCESSIONS].count_documents(
            {"status": AccessionStatus.ACTIVE.value}
        )
        contaminated = await db[ACCESSIONS].count_documents(
            {"status": AccessionStatus.CONTAMINATED.value}
        )

        vessel_rows: List[Dict[str, Any]] = [
            row
            async for row in db[ACCESSIONS].aggregate(
                [
                    {"$match": {"status": AccessionStatus.ACTIVE.value}},
                    {"$group": {"_id": None, "total": {"$sum": "$quantity"}}},
                ]
            )
        ]
        total_vessels = vessel_rows[0]["total"] if vessel_rows else 0

        senescence_watch = await db[ACCESSIONS].count_documents(
            {
                "status": AccessionStatus.ACTIVE.value,
                "cloneGeneration": {"$gte": SENESCENCE_WATCH_GENERATION},
            }
        )

        propagations = await db[PROPAGATIONS].count_documents(
            {"performedAt": {"$gte": since}}
        )
        observations = await db[OBSERVATIONS].count_documents(
            {"observedAt": {"$gte": since}}
        )
        novel_pending = await db[OBSERVATIONS].count_documents(
            {"isNovelTrait": True, "promotedToLineId": None}
        )

        batches_active = await db[BATCHES].count_documents(
            {"status": {"$in": ["prepared", "in_use"]}}
        )

        return GeneticsDashboard(
            totalLines=total_lines,
            activeLines=active_lines,
            linesByKind=KindBreakdown(
                plant=kinds.get("plant", 0),
                fungus=kinds.get("fungus", 0),
                animal=kinds.get("animal", 0),
                other=kinds.get("other", 0),
            ),
            totalAccessions=total_accessions,
            activeAccessions=active_accessions,
            contaminatedAccessions=contaminated,
            totalVessels=total_vessels,
            propagationsLast30Days=propagations,
            observationsLast30Days=observations,
            novelTraitsPending=novel_pending,
            senescenceWatchCount=senescence_watch,
            mediumBatchesActive=batches_active,
        )
