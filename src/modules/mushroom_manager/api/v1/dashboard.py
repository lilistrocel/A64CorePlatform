"""
Mushroom Management Module - Dashboard API Routes

Summary statistics and facility-level analytics endpoints.
Provides high-level operational overview for the mushroom module.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, status

from ...services.database import mushroom_db
from ...utils.responses import SuccessResponse

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    CurrentUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /dashboard
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=SuccessResponse[Dict[str, Any]],
    summary="Get mushroom module dashboard",
    description=(
        "Return summary statistics across all facilities: "
        "total facilities, total rooms, rooms by phase, "
        "recent harvests, and active contamination alerts."
    ),
)
async def get_dashboard(
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[Dict[str, Any]]:
    """
    Get global dashboard statistics for the mushroom module.

    Returns:
    - totalFacilities: Count of all facilities.
    - totalRooms: Count of all growing rooms.
    - roomsByPhase: Dict mapping each phase to the count of rooms in that phase.
    - recentHarvests: Last 10 harvest records across all facilities.
    - activeContaminationAlerts: Count and list of unresolved contamination reports.
    """
    db = mushroom_db.get_database()

    # Total facilities
    total_facilities = await db.mushroom_facilities.count_documents({})

    # Total rooms
    total_rooms = await db.growing_rooms.count_documents({})

    # Rooms by phase (aggregation)
    phase_pipeline = [
        {"$group": {"_id": "$currentPhase", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    rooms_by_phase: Dict[str, int] = {}
    async for doc in db.growing_rooms.aggregate(phase_pipeline):
        rooms_by_phase[doc["_id"]] = doc["count"]

    # Recent harvests (last 10)
    recent_harvests: List[Dict[str, Any]] = []
    async for doc in (
        db.mushroom_harvests
        .find({})
        .sort("harvestedAt", -1)
        .limit(10)
    ):
        doc.pop("_id", None)
        # Serialise datetime objects for JSON response
        for key, value in doc.items():
            if isinstance(value, datetime):
                doc[key] = value.isoformat()
        recent_harvests.append(doc)

    # Active contamination alerts (unresolved)
    active_contamination_count = await db.contamination_reports.count_documents(
        {"isResolved": False}
    )
    active_contamination: List[Dict[str, Any]] = []
    async for doc in (
        db.contamination_reports
        .find({"isResolved": False})
        .sort("reportedAt", -1)
        .limit(20)
    ):
        doc.pop("_id", None)
        for key, value in doc.items():
            if isinstance(value, datetime):
                doc[key] = value.isoformat()
        active_contamination.append(doc)

    dashboard = {
        "totalFacilities": total_facilities,
        "totalRooms": total_rooms,
        "roomsByPhase": rooms_by_phase,
        "recentHarvests": recent_harvests,
        "activeContaminationAlerts": {
            "count": active_contamination_count,
            "reports": active_contamination,
        },
    }

    logger.info(
        f"[Dashboard] Generated dashboard for user {current_user.userId}: "
        f"{total_facilities} facilities, {total_rooms} rooms, "
        f"{active_contamination_count} active contamination alerts"
    )

    return SuccessResponse(data=dashboard)


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/analytics
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/analytics",
    response_model=SuccessResponse[Dict[str, Any]],
    summary="Get facility analytics",
    description=(
        "Return analytics for a specific facility: "
        "yield totals, biological efficiency, flush distribution, "
        "and contamination incident rate."
    ),
)
async def get_facility_analytics(
    facility_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[Dict[str, Any]]:
    """
    Get analytics for a specific mushroom facility.

    Returns:
    - facilityId: The requested facility ID.
    - totalRooms: Count of rooms in this facility.
    - roomsByPhase: Rooms grouped by current lifecycle phase.
    - totalYieldKg: Sum of all harvests in kg.
    - avgBiologicalEfficiency: Average BE% across all harvests with BE data.
    - harvestsByFlush: Yield and count per flush number.
    - totalHarvests: Total harvest records.
    - contaminationStats: Total, resolved, and active contamination reports.
    """
    db = mushroom_db.get_database()

    # Validate facility exists
    facility_doc = await db.mushroom_facilities.find_one(
        {"facilityId": facility_id},
        {"name": 1, "status": 1}
    )
    if not facility_doc:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Facility '{facility_id}' not found"
        )

    # Room counts by phase
    phase_pipeline = [
        {"$match": {"facilityId": facility_id}},
        {"$group": {"_id": "$currentPhase", "count": {"$sum": 1}}},
    ]
    rooms_by_phase: Dict[str, int] = {}
    total_rooms = 0
    async for doc in db.growing_rooms.aggregate(phase_pipeline):
        rooms_by_phase[doc["_id"]] = doc["count"]
        total_rooms += doc["count"]

    # Harvest aggregation
    harvest_pipeline = [
        {"$match": {"facilityId": facility_id}},
        {
            "$group": {
                "_id": None,
                "totalYieldKg": {"$sum": "$weightKg"},
                "totalHarvests": {"$sum": 1},
                "avgBE": {"$avg": "$biologicalEfficiency"},
            }
        },
    ]
    harvest_summary: Dict[str, Any] = {
        "totalYieldKg": 0.0,
        "totalHarvests": 0,
        "avgBiologicalEfficiency": None,
    }
    async for doc in db.mushroom_harvests.aggregate(harvest_pipeline):
        harvest_summary["totalYieldKg"] = round(doc.get("totalYieldKg", 0.0), 3)
        harvest_summary["totalHarvests"] = doc.get("totalHarvests", 0)
        avg_be = doc.get("avgBE")
        harvest_summary["avgBiologicalEfficiency"] = (
            round(avg_be, 2) if avg_be is not None else None
        )

    # Yield per flush number
    flush_pipeline = [
        {"$match": {"facilityId": facility_id}},
        {
            "$group": {
                "_id": "$flushNumber",
                "totalYieldKg": {"$sum": "$weightKg"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    harvests_by_flush: List[Dict[str, Any]] = []
    async for doc in db.mushroom_harvests.aggregate(flush_pipeline):
        harvests_by_flush.append({
            "flushNumber": doc["_id"],
            "totalYieldKg": round(doc["totalYieldKg"], 3),
            "harvestCount": doc["count"],
        })

    # Contamination stats
    total_contamination = await db.contamination_reports.count_documents(
        {"facilityId": facility_id}
    )
    resolved_contamination = await db.contamination_reports.count_documents(
        {"facilityId": facility_id, "isResolved": True}
    )

    analytics = {
        "facilityId": facility_id,
        "facilityName": facility_doc.get("name"),
        "facilityStatus": facility_doc.get("status"),
        "totalRooms": total_rooms,
        "roomsByPhase": rooms_by_phase,
        "totalYieldKg": harvest_summary["totalYieldKg"],
        "totalHarvests": harvest_summary["totalHarvests"],
        "avgBiologicalEfficiency": harvest_summary["avgBiologicalEfficiency"],
        "harvestsByFlush": harvests_by_flush,
        "contaminationStats": {
            "total": total_contamination,
            "resolved": resolved_contamination,
            "active": total_contamination - resolved_contamination,
        },
    }

    logger.info(
        f"[Dashboard] Generated analytics for facility {facility_id}: "
        f"{total_rooms} rooms, {harvest_summary['totalHarvests']} harvests, "
        f"{harvest_summary['totalYieldKg']}kg total yield"
    )

    return SuccessResponse(data=analytics)
