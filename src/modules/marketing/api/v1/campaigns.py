"""
Marketing Module - Campaign API Routes

Endpoints for marketing campaign CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from uuid import UUID
import logging

from ...models.campaign import Campaign, CampaignCreate, CampaignUpdate, CampaignStatus
from ...services.marketing import CampaignService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Campaign],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new marketing campaign",
    description="Create a new marketing campaign. Requires marketing.create permission."
)
async def create_campaign(
    campaign_data: CampaignCreate,
    current_user: CurrentUser = Depends(require_permission("marketing.create")),
    service: CampaignService = Depends()
):
    """
    Create a new marketing campaign

    - **name**: Campaign name (required)
    - **description**: Campaign description (optional)
    - **budgetId**: Associated budget ID (optional)
    - **channelIds**: List of marketing channel IDs (optional)
    - **startDate**: Campaign start date (required)
    - **endDate**: Campaign end date (required)
    - **targetAudience**: Target audience description (optional)
    - **goals**: Campaign goals (optional)
    - **status**: Campaign status (default: draft)
    - **budget**: Campaign budget amount (required)
    - **spent**: Amount spent on campaign (default: 0)
    - **metrics**: Campaign metrics (optional)
    """
    campaign = await service.create_campaign(
        campaign_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=campaign,
        message="Campaign created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Campaign],
    summary="Get all marketing campaigns",
    description="Get all marketing campaigns with pagination and filters. Requires marketing.view permission."
)
async def get_campaigns(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[CampaignStatus] = Query(None, description="Filter by campaign status"),
    budgetId: Optional[UUID] = Query(None, description="Filter by budget ID"),
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: CampaignService = Depends()
):
    """
    Get all marketing campaigns with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by campaign status (optional)
    - **budgetId**: Filter by budget ID (optional)
    """
    campaigns, total, total_pages = await service.get_all_campaigns(
        page, perPage, status, budgetId
    )

    return PaginatedResponse(
        data=campaigns,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{campaign_id}",
    response_model=SuccessResponse[Campaign],
    summary="Get campaign by ID",
    description="Get a specific campaign by ID. Requires marketing.view permission."
)
async def get_campaign(
    campaign_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: CampaignService = Depends()
):
    """
    Get campaign by ID

    - **campaign_id**: Campaign UUID
    """
    campaign = await service.get_campaign(campaign_id)

    return SuccessResponse(data=campaign)


@router.get(
    "/{campaign_id}/performance",
    response_model=SuccessResponse[dict],
    summary="Get campaign performance metrics",
    description="Get campaign performance metrics and analytics. Requires marketing.view permission."
)
async def get_campaign_performance(
    campaign_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.view")),
    service: CampaignService = Depends()
):
    """
    Get campaign performance metrics

    - **campaign_id**: Campaign UUID

    Returns detailed performance metrics including:
    - Budget utilization
    - Click-through rate (CTR)
    - Conversion rate
    - Cost per click (CPC)
    - Cost per acquisition (CPA)
    - Return on investment (ROI)
    """
    performance = await service.get_campaign_performance(campaign_id)

    return SuccessResponse(
        data=performance,
        message="Campaign performance retrieved successfully"
    )


@router.patch(
    "/{campaign_id}",
    response_model=SuccessResponse[Campaign],
    summary="Update campaign",
    description="Update a campaign. Requires marketing.edit permission."
)
async def update_campaign(
    campaign_id: UUID,
    update_data: CampaignUpdate,
    current_user: CurrentUser = Depends(require_permission("marketing.edit")),
    service: CampaignService = Depends()
):
    """
    Update a campaign

    - **campaign_id**: Campaign UUID
    - All fields are optional (partial update)
    """
    campaign = await service.update_campaign(
        campaign_id,
        update_data
    )

    return SuccessResponse(
        data=campaign,
        message="Campaign updated successfully"
    )


@router.delete(
    "/{campaign_id}",
    response_model=SuccessResponse[dict],
    summary="Delete campaign",
    description="Delete a campaign. Requires marketing.delete permission."
)
async def delete_campaign(
    campaign_id: UUID,
    current_user: CurrentUser = Depends(require_permission("marketing.delete")),
    service: CampaignService = Depends()
):
    """
    Delete a campaign

    - **campaign_id**: Campaign UUID
    """
    result = await service.delete_campaign(campaign_id)

    return SuccessResponse(
        data=result,
        message="Campaign deleted successfully"
    )
