"""
Marketing Campaign Service

Business logic layer for Marketing Campaign operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from ...models.campaign import Campaign, CampaignCreate, CampaignUpdate, CampaignStatus
from .campaign_repository import CampaignRepository
from .budget_repository import BudgetRepository
from .channel_repository import ChannelRepository

logger = logging.getLogger(__name__)


class CampaignService:
    """Service for Campaign business logic"""

    def __init__(self):
        self.repository = CampaignRepository()
        self.budget_repository = BudgetRepository()
        self.channel_repository = ChannelRepository()

    async def _validate_budget_exists(self, budget_id: UUID) -> None:
        """
        Validate that budget exists

        Args:
            budget_id: Budget ID to validate

        Raises:
            HTTPException: If budget not found
        """
        if not await self.budget_repository.exists(budget_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Budget {budget_id} not found"
            )

    async def _validate_channels_exist(self, channel_ids: List[UUID]) -> None:
        """
        Validate that all channels exist

        Args:
            channel_ids: List of channel IDs to validate

        Raises:
            HTTPException: If any channel not found
        """
        for channel_id in channel_ids:
            if not await self.channel_repository.exists(channel_id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Channel {channel_id} not found"
                )

    async def create_campaign(
        self,
        campaign_data: CampaignCreate,
        created_by: UUID
    ) -> Campaign:
        """
        Create a new campaign

        Args:
            campaign_data: Campaign creation data
            created_by: ID of the user creating the campaign

        Returns:
            Created campaign

        Raises:
            HTTPException: If validation fails
        """
        try:
            # Validate budget exists if provided
            if campaign_data.budgetId:
                await self._validate_budget_exists(campaign_data.budgetId)

            # Validate channels exist if provided
            if campaign_data.channelIds:
                await self._validate_channels_exist(campaign_data.channelIds)

            # Business logic validation
            if campaign_data.endDate < campaign_data.startDate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date must be after start date"
                )

            if campaign_data.spent > campaign_data.budget:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Spent amount cannot exceed campaign budget"
                )

            campaign = await self.repository.create(campaign_data, created_by)
            logger.info(f"Campaign created: {campaign.campaignId} by user {created_by}")
            return campaign

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating campaign: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create campaign"
            )

    async def get_campaign(self, campaign_id: UUID) -> Campaign:
        """
        Get campaign by ID

        Args:
            campaign_id: Campaign ID

        Returns:
            Campaign

        Raises:
            HTTPException: If campaign not found
        """
        campaign = await self.repository.get_by_id(campaign_id)
        if not campaign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Campaign {campaign_id} not found"
            )
        return campaign

    async def get_all_campaigns(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[CampaignStatus] = None,
        budget_id: Optional[UUID] = None
    ) -> tuple[List[Campaign], int, int]:
        """
        Get all campaigns with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by campaign status (optional)
            budget_id: Filter by budget ID (optional)

        Returns:
            Tuple of (campaigns, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        campaigns, total = await self.repository.get_all(skip, per_page, status, budget_id)

        total_pages = (total + per_page - 1) // per_page  # Ceiling division

        return campaigns, total, total_pages

    async def update_campaign(
        self,
        campaign_id: UUID,
        update_data: CampaignUpdate
    ) -> Campaign:
        """
        Update a campaign

        Args:
            campaign_id: Campaign ID
            update_data: Fields to update

        Returns:
            Updated campaign

        Raises:
            HTTPException: If campaign not found or validation fails
        """
        # Check campaign exists
        current_campaign = await self.get_campaign(campaign_id)

        # Validate budget if updating
        if update_data.budgetId:
            await self._validate_budget_exists(update_data.budgetId)

        # Validate channels if updating
        if update_data.channelIds:
            await self._validate_channels_exist(update_data.channelIds)

        # Validate dates if updating
        if update_data.startDate or update_data.endDate:
            start = update_data.startDate if update_data.startDate else current_campaign.startDate
            end = update_data.endDate if update_data.endDate else current_campaign.endDate

            if end < start:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date must be after start date"
                )

        # Validate amounts if updating
        if update_data.spent is not None or update_data.budget is not None:
            budget = update_data.budget if update_data.budget is not None else current_campaign.budget
            spent = update_data.spent if update_data.spent is not None else current_campaign.spent

            if spent > budget:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Spent amount cannot exceed campaign budget"
                )

        updated_campaign = await self.repository.update(campaign_id, update_data)
        if not updated_campaign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Campaign {campaign_id} not found"
            )

        logger.info(f"Campaign updated: {campaign_id}")
        return updated_campaign

    async def delete_campaign(self, campaign_id: UUID) -> dict:
        """
        Delete a campaign

        Args:
            campaign_id: Campaign ID

        Returns:
            Success message

        Raises:
            HTTPException: If campaign not found
        """
        # Check campaign exists
        await self.get_campaign(campaign_id)

        success = await self.repository.delete(campaign_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Campaign {campaign_id} not found"
            )

        logger.info(f"Campaign deleted: {campaign_id}")
        return {"message": "Campaign deleted successfully"}

    async def get_campaign_performance(self, campaign_id: UUID) -> dict:
        """
        Get campaign performance metrics

        Args:
            campaign_id: Campaign ID

        Returns:
            Campaign performance data

        Raises:
            HTTPException: If campaign not found
        """
        campaign = await self.get_campaign(campaign_id)

        # Calculate performance metrics
        ctr = (campaign.metrics.clicks / campaign.metrics.impressions * 100) if campaign.metrics.impressions > 0 else 0
        conversion_rate = (campaign.metrics.conversions / campaign.metrics.clicks * 100) if campaign.metrics.clicks > 0 else 0
        cpc = (campaign.spent / campaign.metrics.clicks) if campaign.metrics.clicks > 0 else 0
        cpa = (campaign.spent / campaign.metrics.conversions) if campaign.metrics.conversions > 0 else 0
        budget_utilization = (campaign.spent / campaign.budget * 100) if campaign.budget > 0 else 0

        return {
            "campaignId": str(campaign.campaignId),
            "campaignCode": campaign.campaignCode,
            "name": campaign.name,
            "status": campaign.status,
            "budget": campaign.budget,
            "spent": campaign.spent,
            "budgetRemaining": campaign.budget - campaign.spent,
            "budgetUtilization": round(budget_utilization, 2),
            "metrics": {
                "impressions": campaign.metrics.impressions,
                "clicks": campaign.metrics.clicks,
                "conversions": campaign.metrics.conversions,
                "roi": campaign.metrics.roi,
                "ctr": round(ctr, 2),
                "conversionRate": round(conversion_rate, 2),
                "costPerClick": round(cpc, 2),
                "costPerAcquisition": round(cpa, 2)
            }
        }
