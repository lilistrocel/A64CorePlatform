"""
Shipment Repository

Data access layer for Shipment operations.
Handles all database interactions for shipments.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.modules.logistics.models.shipment import Shipment, ShipmentCreate, ShipmentUpdate, ShipmentStatus
from src.modules.logistics.services.database import logistics_db
from src.modules.farm_manager.models.farming_year_config import get_farming_year, DEFAULT_FARMING_YEAR_START_MONTH

logger = logging.getLogger(__name__)


class ShipmentRepository:
    """Repository for Shipment data access"""

    def __init__(self):
        self.collection_name = "shipments"

    def _get_collection(self):
        """Get shipments collection"""
        return logistics_db.get_collection(self.collection_name)

    async def _get_next_shipment_sequence(self) -> int:
        """
        Get next shipment sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for shipment codes.

        Returns:
            Next sequence number for shipment code
        """
        db = logistics_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "shipment_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, shipment_data: ShipmentCreate, created_by: UUID) -> Shipment:
        """
        Create a new shipment with auto-generated shipmentCode

        Args:
            shipment_data: Shipment creation data
            created_by: ID of the user creating the shipment

        Returns:
            Created shipment
        """
        collection = self._get_collection()

        # Generate shipment code (e.g., "SH001", "SH002")
        sequence = await self._get_next_shipment_sequence()
        shipment_code = f"SH{sequence:03d}"

        shipment_dict = shipment_data.model_dump()

        # Calculate farming year from actualDepartureDate, scheduledDate, or createdAt
        now = datetime.utcnow()
        date_for_farming_year = (
            shipment_dict.get("actualDepartureDate") or
            shipment_dict.get("scheduledDate") or
            now
        )
        farming_year = get_farming_year(date_for_farming_year, DEFAULT_FARMING_YEAR_START_MONTH)
        shipment_dict["farmingYear"] = farming_year

        shipment = Shipment(
            **shipment_dict,
            shipmentCode=shipment_code,
            createdBy=created_by,
            createdAt=now,
            updatedAt=now
        )

        shipment_doc = shipment.model_dump(by_alias=True)
        shipment_doc["shipmentId"] = str(shipment_doc["shipmentId"])  # Convert UUID to string for MongoDB
        shipment_doc["routeId"] = str(shipment_doc["routeId"])
        shipment_doc["vehicleId"] = str(shipment_doc["vehicleId"])
        shipment_doc["driverId"] = str(shipment_doc["driverId"])
        shipment_doc["createdBy"] = str(shipment_doc["createdBy"])

        await collection.insert_one(shipment_doc)

        logger.info(f"Created shipment: {shipment.shipmentId} with code {shipment_code}")
        return shipment

    async def get_by_id(self, shipment_id: UUID) -> Optional[Shipment]:
        """
        Get shipment by ID

        Args:
            shipment_id: Shipment ID

        Returns:
            Shipment if found, None otherwise
        """
        collection = self._get_collection()
        shipment_doc = await collection.find_one({"shipmentId": str(shipment_id)})

        if shipment_doc:
            shipment_doc.pop("_id", None)  # Remove MongoDB _id
            return Shipment(**shipment_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[ShipmentStatus] = None,
        vehicle_id: Optional[UUID] = None,
        route_id: Optional[UUID] = None,
        farming_year: Optional[int] = None
    ) -> tuple[List[Shipment], int]:
        """
        Get all shipments with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by shipment status (optional)
            vehicle_id: Filter by vehicle ID (optional)
            route_id: Filter by route ID (optional)
            farming_year: Filter by farming year (optional)

        Returns:
            Tuple of (list of shipments, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if vehicle_id:
            query["vehicleId"] = str(vehicle_id)
        if route_id:
            query["routeId"] = str(route_id)
        if farming_year is not None:
            query["farmingYear"] = farming_year

        # Get total count
        total = await collection.count_documents(query)

        # Get shipments
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        shipments = []

        async for shipment_doc in cursor:
            shipment_doc.pop("_id", None)
            shipments.append(Shipment(**shipment_doc))

        return shipments, total

    async def update(self, shipment_id: UUID, update_data: ShipmentUpdate) -> Optional[Shipment]:
        """
        Update a shipment

        Args:
            shipment_id: Shipment ID
            update_data: Fields to update

        Returns:
            Updated shipment if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(shipment_id)

        update_dict["updatedAt"] = datetime.utcnow()

        # Convert UUIDs to strings if present
        if "routeId" in update_dict:
            update_dict["routeId"] = str(update_dict["routeId"])
        if "vehicleId" in update_dict:
            update_dict["vehicleId"] = str(update_dict["vehicleId"])
        if "driverId" in update_dict:
            update_dict["driverId"] = str(update_dict["driverId"])
        if "orderIds" in update_dict:
            update_dict["orderIds"] = [str(oid) for oid in update_dict["orderIds"]]

        result = await collection.update_one(
            {"shipmentId": str(shipment_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated shipment: {shipment_id}")
            return await self.get_by_id(shipment_id)

        return None

    async def update_status(self, shipment_id: UUID, new_status: ShipmentStatus) -> Optional[Shipment]:
        """
        Update shipment status

        Args:
            shipment_id: Shipment ID
            new_status: New status

        Returns:
            Updated shipment if found, None otherwise
        """
        collection = self._get_collection()

        now = datetime.utcnow()
        update_dict = {
            "status": new_status.value,
            "updatedAt": now
        }

        # Update departure/arrival dates based on status
        if new_status == ShipmentStatus.IN_TRANSIT:
            update_dict["actualDepartureDate"] = now
            # Recalculate farming year based on actual departure date
            update_dict["farmingYear"] = get_farming_year(now, DEFAULT_FARMING_YEAR_START_MONTH)
        elif new_status == ShipmentStatus.DELIVERED:
            update_dict["actualArrivalDate"] = now

        result = await collection.update_one(
            {"shipmentId": str(shipment_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated shipment status: {shipment_id} to {new_status.value}")
            return await self.get_by_id(shipment_id)

        return None

    async def delete(self, shipment_id: UUID) -> bool:
        """
        Delete a shipment (hard delete)

        Args:
            shipment_id: Shipment ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"shipmentId": str(shipment_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted shipment: {shipment_id}")
            return True

        return False

    async def exists(self, shipment_id: UUID) -> bool:
        """
        Check if shipment exists

        Args:
            shipment_id: Shipment ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"shipmentId": str(shipment_id)})
        return count > 0
