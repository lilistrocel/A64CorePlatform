"""
Marketing Module - Dashboard API Routes

Endpoints for marketing dashboard and analytics.
"""

from fastapi import APIRouter, Depends, status
import logging

from ...services.database import marketing_db
from ...middleware.auth import require_permission, CurrentUser
from ...utils.responses import SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=SuccessResponse[dict],
    summary="Get marketing dashboard statistics",
    description="Get marketing dashboard statistics and metrics. Requires marketing.view permission."
)
async def get_dashboard_stats(
    current_user: CurrentUser = Depends(require_permission("marketing.view"))
):
    """
    Get marketing dashboard statistics

    Returns comprehensive marketing metrics including:
    - Total budgets and spending
    - Campaign statistics
    - Channel performance
    - Event statistics
    """
    try:
        db = marketing_db.get_database()

        # Budget statistics
        budgets_collection = db.marketing_budgets
        total_budgets = await budgets_collection.count_documents({})

        budget_pipeline = [
            {
                "$group": {
                    "_id": None,
                    "totalBudgetAmount": {"$sum": "$totalAmount"},
                    "totalAllocated": {"$sum": "$allocatedAmount"},
                    "totalSpent": {"$sum": "$spentAmount"}
                }
            }
        ]
        budget_stats = await budgets_collection.aggregate(budget_pipeline).to_list(1)
        budget_summary = budget_stats[0] if budget_stats else {
            "totalBudgetAmount": 0,
            "totalAllocated": 0,
            "totalSpent": 0
        }

        # Campaign statistics
        campaigns_collection = db.marketing_campaigns
        total_campaigns = await campaigns_collection.count_documents({})
        active_campaigns = await campaigns_collection.count_documents({"status": "active"})
        draft_campaigns = await campaigns_collection.count_documents({"status": "draft"})
        completed_campaigns = await campaigns_collection.count_documents({"status": "completed"})

        campaign_pipeline = [
            {
                "$group": {
                    "_id": None,
                    "totalCampaignBudget": {"$sum": "$budget"},
                    "totalCampaignSpent": {"$sum": "$spent"},
                    "totalImpressions": {"$sum": "$metrics.impressions"},
                    "totalClicks": {"$sum": "$metrics.clicks"},
                    "totalConversions": {"$sum": "$metrics.conversions"}
                }
            }
        ]
        campaign_stats = await campaigns_collection.aggregate(campaign_pipeline).to_list(1)
        campaign_summary = campaign_stats[0] if campaign_stats else {
            "totalCampaignBudget": 0,
            "totalCampaignSpent": 0,
            "totalImpressions": 0,
            "totalClicks": 0,
            "totalConversions": 0
        }

        # Channel statistics
        channels_collection = db.marketing_channels
        total_channels = await channels_collection.count_documents({})
        active_channels = await channels_collection.count_documents({"isActive": True})

        # Event statistics
        events_collection = db.marketing_events
        total_events = await events_collection.count_documents({})
        upcoming_events = await events_collection.count_documents({"status": "planned"})
        ongoing_events = await events_collection.count_documents({"status": "ongoing"})
        completed_events = await events_collection.count_documents({"status": "completed"})

        event_pipeline = [
            {
                "$group": {
                    "_id": None,
                    "totalEventBudget": {"$sum": "$budget"},
                    "totalEventCost": {"$sum": "$actualCost"},
                    "totalExpectedAttendees": {"$sum": "$expectedAttendees"},
                    "totalActualAttendees": {"$sum": "$actualAttendees"}
                }
            }
        ]
        event_stats = await events_collection.aggregate(event_pipeline).to_list(1)
        event_summary = event_stats[0] if event_stats else {
            "totalEventBudget": 0,
            "totalEventCost": 0,
            "totalExpectedAttendees": 0,
            "totalActualAttendees": 0
        }

        # Calculate performance metrics
        ctr = (campaign_summary["totalClicks"] / campaign_summary["totalImpressions"] * 100) if campaign_summary["totalImpressions"] > 0 else 0
        conversion_rate = (campaign_summary["totalConversions"] / campaign_summary["totalClicks"] * 100) if campaign_summary["totalClicks"] > 0 else 0
        budget_utilization = (budget_summary["totalSpent"] / budget_summary["totalBudgetAmount"] * 100) if budget_summary["totalBudgetAmount"] > 0 else 0

        dashboard_data = {
            "budgets": {
                "total": total_budgets,
                "totalAmount": budget_summary["totalBudgetAmount"],
                "allocated": budget_summary["totalAllocated"],
                "spent": budget_summary["totalSpent"],
                "remaining": budget_summary["totalBudgetAmount"] - budget_summary["totalSpent"],
                "utilizationPercentage": round(budget_utilization, 2)
            },
            "campaigns": {
                "total": total_campaigns,
                "active": active_campaigns,
                "draft": draft_campaigns,
                "completed": completed_campaigns,
                "totalBudget": campaign_summary["totalCampaignBudget"],
                "totalSpent": campaign_summary["totalCampaignSpent"],
                "performance": {
                    "impressions": campaign_summary["totalImpressions"],
                    "clicks": campaign_summary["totalClicks"],
                    "conversions": campaign_summary["totalConversions"],
                    "ctr": round(ctr, 2),
                    "conversionRate": round(conversion_rate, 2)
                }
            },
            "channels": {
                "total": total_channels,
                "active": active_channels
            },
            "events": {
                "total": total_events,
                "upcoming": upcoming_events,
                "ongoing": ongoing_events,
                "completed": completed_events,
                "totalBudget": event_summary["totalEventBudget"],
                "totalCost": event_summary["totalEventCost"],
                "expectedAttendees": event_summary["totalExpectedAttendees"],
                "actualAttendees": event_summary["totalActualAttendees"]
            }
        }

        return SuccessResponse(
            data=dashboard_data,
            message="Dashboard statistics retrieved successfully"
        )

    except Exception as e:
        logger.error(f"Error fetching dashboard statistics: {e}")
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve dashboard statistics"
        )
