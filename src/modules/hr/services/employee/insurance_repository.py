"""
Insurance Repository

Data access layer for Insurance operations.
Handles all database interactions for employee insurance policies.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.modules.hr.models.insurance import Insurance, InsuranceCreate, InsuranceUpdate, InsuranceType
from src.modules.hr.services.database import hr_db

logger = logging.getLogger(__name__)


class InsuranceRepository:
    """Repository for Insurance data access"""

    def __init__(self):
        self.collection_name = "employee_insurance"

    def _get_collection(self):
        """Get insurance collection"""
        return hr_db.get_collection(self.collection_name)

    async def create(self, insurance_data: InsuranceCreate) -> Insurance:
        """
        Create a new insurance policy

        Args:
            insurance_data: Insurance creation data

        Returns:
            Created insurance
        """
        collection = self._get_collection()

        insurance_dict = insurance_data.model_dump()
        insurance = Insurance(
            **insurance_dict,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        insurance_doc = insurance.model_dump(by_alias=True)
        insurance_doc["insuranceId"] = str(insurance_doc["insuranceId"])
        insurance_doc["employeeId"] = str(insurance_doc["employeeId"])

        # Convert dates to datetime for MongoDB
        if "startDate" in insurance_doc:
            insurance_doc["startDate"] = datetime.combine(insurance_doc["startDate"], datetime.min.time())
        if "endDate" in insurance_doc:
            insurance_doc["endDate"] = datetime.combine(insurance_doc["endDate"], datetime.min.time())

        await collection.insert_one(insurance_doc)

        logger.info(f"Created insurance: {insurance.insuranceId} for employee {insurance.employeeId}")
        return insurance

    async def get_by_id(self, insurance_id: UUID) -> Optional[Insurance]:
        """
        Get insurance by ID

        Args:
            insurance_id: Insurance ID

        Returns:
            Insurance if found, None otherwise
        """
        collection = self._get_collection()
        insurance_doc = await collection.find_one({"insuranceId": str(insurance_id)})

        if insurance_doc:
            insurance_doc.pop("_id", None)
            # Convert datetime back to date
            if "startDate" in insurance_doc and isinstance(insurance_doc["startDate"], datetime):
                insurance_doc["startDate"] = insurance_doc["startDate"].date()
            if "endDate" in insurance_doc and isinstance(insurance_doc["endDate"], datetime):
                insurance_doc["endDate"] = insurance_doc["endDate"].date()
            return Insurance(**insurance_doc)
        return None

    async def get_by_employee_id(
        self,
        employee_id: UUID,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[Insurance], int]:
        """
        Get insurance policies for a specific employee

        Args:
            employee_id: Employee ID
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of insurance policies, total count)
        """
        collection = self._get_collection()
        query = {"employeeId": str(employee_id)}

        # Get total count
        total = await collection.count_documents(query)

        # Get insurance policies
        cursor = collection.find(query).sort("startDate", -1).skip(skip).limit(limit)
        insurance_list = []

        async for insurance_doc in cursor:
            insurance_doc.pop("_id", None)
            # Convert datetime back to date
            if "startDate" in insurance_doc and isinstance(insurance_doc["startDate"], datetime):
                insurance_doc["startDate"] = insurance_doc["startDate"].date()
            if "endDate" in insurance_doc and isinstance(insurance_doc["endDate"], datetime):
                insurance_doc["endDate"] = insurance_doc["endDate"].date()
            insurance_list.append(Insurance(**insurance_doc))

        return insurance_list, total

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        insurance_type: Optional[InsuranceType] = None
    ) -> tuple[List[Insurance], int]:
        """
        Get all insurance policies with pagination

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            insurance_type: Filter by insurance type (optional)

        Returns:
            Tuple of (list of insurance policies, total count)
        """
        collection = self._get_collection()
        query = {}

        if insurance_type:
            query["type"] = insurance_type.value

        # Get total count
        total = await collection.count_documents(query)

        # Get insurance policies
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        insurance_list = []

        async for insurance_doc in cursor:
            insurance_doc.pop("_id", None)
            # Convert datetime back to date
            if "startDate" in insurance_doc and isinstance(insurance_doc["startDate"], datetime):
                insurance_doc["startDate"] = insurance_doc["startDate"].date()
            if "endDate" in insurance_doc and isinstance(insurance_doc["endDate"], datetime):
                insurance_doc["endDate"] = insurance_doc["endDate"].date()
            insurance_list.append(Insurance(**insurance_doc))

        return insurance_list, total

    async def update(self, insurance_id: UUID, update_data: InsuranceUpdate) -> Optional[Insurance]:
        """
        Update an insurance policy

        Args:
            insurance_id: Insurance ID
            update_data: Fields to update

        Returns:
            Updated insurance if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(insurance_id)

        update_dict["updatedAt"] = datetime.utcnow()

        # Convert dates to datetime for MongoDB
        if "startDate" in update_dict:
            update_dict["startDate"] = datetime.combine(update_dict["startDate"], datetime.min.time())
        if "endDate" in update_dict:
            update_dict["endDate"] = datetime.combine(update_dict["endDate"], datetime.min.time())

        result = await collection.update_one(
            {"insuranceId": str(insurance_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated insurance: {insurance_id}")
            return await self.get_by_id(insurance_id)

        return None

    async def delete(self, insurance_id: UUID) -> bool:
        """
        Delete an insurance policy (hard delete)

        Args:
            insurance_id: Insurance ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"insuranceId": str(insurance_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted insurance: {insurance_id}")
            return True

        return False

    async def exists(self, insurance_id: UUID) -> bool:
        """
        Check if insurance exists

        Args:
            insurance_id: Insurance ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"insuranceId": str(insurance_id)})
        return count > 0
