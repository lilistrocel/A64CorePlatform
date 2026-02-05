"""
Vehicle Repository

Data access layer for Vehicle operations.
Handles all database interactions for vehicles.
"""

from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime
import logging

from src.modules.logistics.models.vehicle import Vehicle, VehicleCreate, VehicleUpdate, VehicleStatus, VehicleType, VehicleOwnership
from src.modules.logistics.services.database import logistics_db

logger = logging.getLogger(__name__)


class VehicleRepository:
    """Repository for Vehicle data access"""

    def __init__(self):
        self.collection_name = "vehicles"

    def _normalize_legacy_vehicle(self, vehicle_doc: dict) -> dict:
        """
        Normalize legacy vehicle data to match current schema.

        Handles migration from old schema:
        - vehicleType -> type
        - plateNumber -> licensePlate
        - capacity: null -> default VehicleCapacity object
        - isActive -> status
        - Missing ownership, createdBy
        """
        normalized = vehicle_doc.copy()

        # Map vehicleType to type enum
        if "type" not in normalized and "vehicleType" in normalized:
            vehicle_type_str = normalized.get("vehicleType", "").upper()
            # Try to map to VehicleType enum
            if "TRUCK" in vehicle_type_str or "CANTER" in vehicle_type_str:
                normalized["type"] = VehicleType.TRUCK.value
            elif "VAN" in vehicle_type_str or "HIACE" in vehicle_type_str:
                normalized["type"] = VehicleType.VAN.value
            elif "PICKUP" in vehicle_type_str:
                normalized["type"] = VehicleType.PICKUP.value
            elif "REFRIG" in vehicle_type_str:
                normalized["type"] = VehicleType.REFRIGERATED.value
            else:
                normalized["type"] = VehicleType.VAN.value  # Default

        # Map plateNumber to licensePlate
        if "licensePlate" not in normalized and "plateNumber" in normalized:
            normalized["licensePlate"] = normalized.get("plateNumber", "UNKNOWN")

        # Provide default licensePlate if still missing
        if "licensePlate" not in normalized or not normalized["licensePlate"]:
            normalized["licensePlate"] = normalized.get("name", "UNKNOWN")[:50]

        # Provide default ownership if missing
        if "ownership" not in normalized:
            normalized["ownership"] = VehicleOwnership.OWNED.value

        # Provide default capacity if null or missing
        if normalized.get("capacity") is None:
            normalized["capacity"] = {
                "weight": 1000.0,  # Default 1000 kg
                "volume": 10.0,   # Default 10 m3
                "unit": "kg/m3"
            }

        # Map isActive to status
        if "status" not in normalized and "isActive" in normalized:
            normalized["status"] = VehicleStatus.AVAILABLE.value if normalized.get("isActive") else VehicleStatus.RETIRED.value

        # Provide default status if missing
        if "status" not in normalized:
            normalized["status"] = VehicleStatus.AVAILABLE.value

        # Provide default createdBy if missing (use a placeholder UUID)
        if "createdBy" not in normalized:
            normalized["createdBy"] = str(uuid4())  # System-generated placeholder

        return normalized

    def _get_collection(self):
        """Get vehicles collection"""
        return logistics_db.get_collection(self.collection_name)

    async def _get_next_vehicle_sequence(self) -> int:
        """
        Get next vehicle sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for vehicle codes.
        On first use or when counter is behind existing data, syncs with max existing code.

        Returns:
            Next sequence number for vehicle code
        """
        db = logistics_db.get_database()
        collection = self._get_collection()

        # Find the highest existing vehicle code number
        pipeline = [
            {"$match": {"vehicleCode": {"$regex": "^V\\d+"}}},
            {"$project": {
                "codeNum": {"$toInt": {"$substr": ["$vehicleCode", 1, -1]}}
            }},
            {"$sort": {"codeNum": -1}},
            {"$limit": 1}
        ]
        cursor = collection.aggregate(pipeline)
        max_existing = 0
        async for doc in cursor:
            max_existing = doc.get("codeNum", 0)

        # Get current counter value
        counter_doc = await db.counters.find_one({"_id": "vehicle_sequence"})
        current_value = counter_doc["value"] if counter_doc else 0

        # If counter is behind existing data, sync it up
        if current_value <= max_existing:
            await db.counters.update_one(
                {"_id": "vehicle_sequence"},
                {"$set": {"value": max_existing}},
                upsert=True
            )

        # Now atomically increment
        result = await db.counters.find_one_and_update(
            {"_id": "vehicle_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, vehicle_data: VehicleCreate, created_by: UUID) -> Vehicle:
        """
        Create a new vehicle with auto-generated vehicleCode

        Args:
            vehicle_data: Vehicle creation data
            created_by: ID of the user creating the vehicle

        Returns:
            Created vehicle
        """
        collection = self._get_collection()

        # Generate vehicle code (e.g., "V001", "V002")
        sequence = await self._get_next_vehicle_sequence()
        vehicle_code = f"V{sequence:03d}"

        vehicle_dict = vehicle_data.model_dump()
        vehicle = Vehicle(
            **vehicle_dict,
            vehicleCode=vehicle_code,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        vehicle_doc = vehicle.model_dump(by_alias=True)
        vehicle_doc["vehicleId"] = str(vehicle_doc["vehicleId"])  # Convert UUID to string for MongoDB
        vehicle_doc["createdBy"] = str(vehicle_doc["createdBy"])

        # Convert date to datetime for MongoDB
        if "purchaseDate" in vehicle_doc and vehicle_doc["purchaseDate"]:
            vehicle_doc["purchaseDate"] = datetime.combine(vehicle_doc["purchaseDate"], datetime.min.time())
        if "maintenanceSchedule" in vehicle_doc and vehicle_doc["maintenanceSchedule"]:
            vehicle_doc["maintenanceSchedule"] = datetime.combine(vehicle_doc["maintenanceSchedule"], datetime.min.time())

        await collection.insert_one(vehicle_doc)

        logger.info(f"Created vehicle: {vehicle.vehicleId} with code {vehicle_code}")
        return vehicle

    async def get_by_id(self, vehicle_id: UUID) -> Optional[Vehicle]:
        """
        Get vehicle by ID

        Args:
            vehicle_id: Vehicle ID

        Returns:
            Vehicle if found, None otherwise
        """
        collection = self._get_collection()
        vehicle_doc = await collection.find_one({"vehicleId": str(vehicle_id)})

        if vehicle_doc:
            vehicle_doc.pop("_id", None)  # Remove MongoDB _id
            # Normalize legacy data
            vehicle_doc = self._normalize_legacy_vehicle(vehicle_doc)
            # Convert datetime back to date
            if "purchaseDate" in vehicle_doc and isinstance(vehicle_doc["purchaseDate"], datetime):
                vehicle_doc["purchaseDate"] = vehicle_doc["purchaseDate"].date()
            if "maintenanceSchedule" in vehicle_doc and isinstance(vehicle_doc["maintenanceSchedule"], datetime):
                vehicle_doc["maintenanceSchedule"] = vehicle_doc["maintenanceSchedule"].date()
            return Vehicle(**vehicle_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[VehicleStatus] = None,
        type: Optional[str] = None
    ) -> tuple[List[Vehicle], int]:
        """
        Get all vehicles with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by vehicle status (optional)
            type: Filter by vehicle type (optional)

        Returns:
            Tuple of (list of vehicles, total count)
        """
        collection = self._get_collection()
        query = {}
        and_conditions = []

        if status:
            # Handle both new 'status' field and legacy 'isActive' field
            # Legacy mapping: isActive=true -> available; isActive=false -> retired
            if status == VehicleStatus.AVAILABLE:
                and_conditions.append({
                    "$or": [
                        {"status": status.value},
                        {"status": {"$exists": False}, "isActive": True},
                        {"status": {"$exists": False}, "isActive": {"$exists": False}},  # Default to available if no status fields
                    ]
                })
            elif status == VehicleStatus.RETIRED:
                and_conditions.append({
                    "$or": [
                        {"status": status.value},
                        {"status": {"$exists": False}, "isActive": False},
                    ]
                })
            else:
                # For in_use and maintenance, only match new status field (not in legacy)
                and_conditions.append({"status": status.value})
        if type:
            # Build query that matches both new 'type' field and legacy 'vehicleType' field
            # Legacy vehicleType values: CANTER, TRUCK -> truck; VAN, HIACE, VOLVO -> van; PICKUP -> pickup; REFRIG -> refrigerated
            legacy_patterns = {
                "truck": {"$regex": "TRUCK|CANTER", "$options": "i"},
                "van": {"$regex": "VAN|HIACE|VOLVO|HINO|OTHER", "$options": "i"},
                "pickup": {"$regex": "PICKUP", "$options": "i"},
                "refrigerated": {"$regex": "REFRIG", "$options": "i"},
            }
            legacy_match = legacy_patterns.get(type)
            if legacy_match:
                and_conditions.append({
                    "$or": [
                        {"type": type},
                        {"vehicleType": legacy_match},
                    ]
                })
            else:
                and_conditions.append({"type": type})

        # Build final query
        if len(and_conditions) == 1:
            query = and_conditions[0]
        elif len(and_conditions) > 1:
            query = {"$and": and_conditions}

        # Get total count
        total = await collection.count_documents(query)

        # Get vehicles
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        vehicles = []

        async for vehicle_doc in cursor:
            vehicle_doc.pop("_id", None)
            # Normalize legacy data
            vehicle_doc = self._normalize_legacy_vehicle(vehicle_doc)
            # Convert datetime back to date
            if "purchaseDate" in vehicle_doc and isinstance(vehicle_doc["purchaseDate"], datetime):
                vehicle_doc["purchaseDate"] = vehicle_doc["purchaseDate"].date()
            if "maintenanceSchedule" in vehicle_doc and isinstance(vehicle_doc["maintenanceSchedule"], datetime):
                vehicle_doc["maintenanceSchedule"] = vehicle_doc["maintenanceSchedule"].date()
            vehicles.append(Vehicle(**vehicle_doc))

        return vehicles, total

    async def get_available_vehicles(
        self,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[Vehicle], int]:
        """
        Get all available vehicles

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of vehicles, total count)
        """
        return await self.get_all(skip, limit, status=VehicleStatus.AVAILABLE)

    async def update(self, vehicle_id: UUID, update_data: VehicleUpdate) -> Optional[Vehicle]:
        """
        Update a vehicle

        Args:
            vehicle_id: Vehicle ID
            update_data: Fields to update

        Returns:
            Updated vehicle if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(vehicle_id)

        update_dict["updatedAt"] = datetime.utcnow()

        # Convert date to datetime for MongoDB
        if "purchaseDate" in update_dict and update_dict["purchaseDate"]:
            update_dict["purchaseDate"] = datetime.combine(update_dict["purchaseDate"], datetime.min.time())
        if "maintenanceSchedule" in update_dict and update_dict["maintenanceSchedule"]:
            update_dict["maintenanceSchedule"] = datetime.combine(update_dict["maintenanceSchedule"], datetime.min.time())

        result = await collection.update_one(
            {"vehicleId": str(vehicle_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated vehicle: {vehicle_id}")
            return await self.get_by_id(vehicle_id)

        return None

    async def delete(self, vehicle_id: UUID) -> bool:
        """
        Delete a vehicle (hard delete)

        Args:
            vehicle_id: Vehicle ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"vehicleId": str(vehicle_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted vehicle: {vehicle_id}")
            return True

        return False

    async def exists(self, vehicle_id: UUID) -> bool:
        """
        Check if vehicle exists

        Args:
            vehicle_id: Vehicle ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"vehicleId": str(vehicle_id)})
        return count > 0
