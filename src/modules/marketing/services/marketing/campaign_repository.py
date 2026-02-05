"""
Marketing Campaign Repository

Data access layer for Marketing Campaign operations.
Handles all database interactions for campaigns.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime, date
import logging

from ...models.campaign import Campaign, CampaignCreate, CampaignUpdate, CampaignStatus
from ..database import marketing_db

logger = logging.getLogger(__name__)


class CampaignRepository:
    """Repository for Campaign data access"""

    def __init__(self):
        self.collection_name = "marketing_campaigns"

    def _get_collection(self):
        """Get campaigns collection"""
        return marketing_db.get_collection(self.collection_name)

    async def _get_next_campaign_sequence(self) -> int:
        """
        Get next campaign sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for campaign codes.

        Returns:
            Next sequence number for campaign code
        """
        db = marketing_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "marketing_campaign_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, campaign_data: CampaignCreate, created_by: UUID) -> Campaign:
        """
        Create a new campaign with auto-generated campaignCode

        Args:
            campaign_data: Campaign creation data
            created_by: ID of the user creating the campaign

        Returns:
            Created campaign
        """
        collection = self._get_collection()

        # Generate campaign code (e.g., "MC001", "MC002")
        sequence = await self._get_next_campaign_sequence()
        campaign_code = f"MC{sequence:03d}"

        campaign_dict = campaign_data.model_dump()
        campaign = Campaign(
            **campaign_dict,
            campaignCode=campaign_code,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        campaign_doc = campaign.model_dump(by_alias=True)
        campaign_doc["campaignId"] = str(campaign_doc["campaignId"])
        campaign_doc["createdBy"] = str(campaign_doc["createdBy"])

        # Convert budgetId to string if present
        if campaign_doc.get("budgetId"):
            campaign_doc["budgetId"] = str(campaign_doc["budgetId"])

        # Convert channelIds to strings
        campaign_doc["channelIds"] = [str(cid) for cid in campaign_doc["channelIds"]]

        # Convert date objects to datetime for MongoDB BSON encoding
        for date_field in ["startDate", "endDate"]:
            if date_field in campaign_doc and isinstance(campaign_doc[date_field], date):
                campaign_doc[date_field] = datetime.combine(campaign_doc[date_field], datetime.min.time())

        await collection.insert_one(campaign_doc)

        logger.info(f"Created campaign: {campaign.campaignId} with code {campaign_code}")
        return campaign

    async def get_by_id(self, campaign_id: UUID) -> Optional[Campaign]:
        """
        Get campaign by ID

        Args:
            campaign_id: Campaign ID

        Returns:
            Campaign if found, None otherwise
        """
        collection = self._get_collection()
        campaign_doc = await collection.find_one({"campaignId": str(campaign_id)})

        if campaign_doc:
            campaign_doc.pop("_id", None)
            return Campaign(**campaign_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[CampaignStatus] = None,
        budget_id: Optional[UUID] = None,
        search: Optional[str] = None
    ) -> tuple[List[Campaign], int]:
        """
        Get all campaigns with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by campaign status (optional)
            budget_id: Filter by budget ID (optional)
            search: Search campaigns by name (optional)

        Returns:
            Tuple of (list of campaigns, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if budget_id:
            query["budgetId"] = str(budget_id)
        if search:
            # Case-insensitive search on campaign name
            query["name"] = {"$regex": search, "$options": "i"}

        # Get total count
        total = await collection.count_documents(query)

        # Get campaigns
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        campaigns = []

        async for campaign_doc in cursor:
            campaign_doc.pop("_id", None)
            campaigns.append(Campaign(**campaign_doc))

        return campaigns, total

    async def update(self, campaign_id: UUID, update_data: CampaignUpdate) -> Optional[Campaign]:
        """
        Update a campaign

        Args:
            campaign_id: Campaign ID
            update_data: Fields to update

        Returns:
            Updated campaign if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(campaign_id)

        # Convert UUIDs to strings for MongoDB
        if "budgetId" in update_dict and update_dict["budgetId"]:
            update_dict["budgetId"] = str(update_dict["budgetId"])

        if "channelIds" in update_dict:
            update_dict["channelIds"] = [str(cid) for cid in update_dict["channelIds"]]

        # Convert date objects to datetime for MongoDB BSON encoding
        for date_field in ["startDate", "endDate"]:
            if date_field in update_dict and isinstance(update_dict[date_field], date):
                update_dict[date_field] = datetime.combine(update_dict[date_field], datetime.min.time())

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"campaignId": str(campaign_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated campaign: {campaign_id}")
            return await self.get_by_id(campaign_id)

        return None

    async def delete(self, campaign_id: UUID) -> bool:
        """
        Delete a campaign (hard delete)

        Args:
            campaign_id: Campaign ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"campaignId": str(campaign_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted campaign: {campaign_id}")
            return True

        return False

    async def exists(self, campaign_id: UUID) -> bool:
        """
        Check if campaign exists

        Args:
            campaign_id: Campaign ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"campaignId": str(campaign_id)})
        return count > 0
