"""
Visa Repository

Data access layer for Visa operations.
Handles all database interactions for employee visas.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.modules.hr.models.visa import Visa, VisaCreate, VisaUpdate, VisaStatus
from src.modules.hr.services.database import hr_db

logger = logging.getLogger(__name__)


class VisaRepository:
    """Repository for Visa data access"""

    def __init__(self):
        self.collection_name = "employee_visas"

    def _get_collection(self):
        """Get visas collection"""
        return hr_db.get_collection(self.collection_name)

    async def create(self, visa_data: VisaCreate) -> Visa:
        """
        Create a new visa

        Args:
            visa_data: Visa creation data

        Returns:
            Created visa
        """
        collection = self._get_collection()

        visa_dict = visa_data.model_dump()
        visa = Visa(
            **visa_dict,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        visa_doc = visa.model_dump(by_alias=True)
        visa_doc["visaId"] = str(visa_doc["visaId"])
        visa_doc["employeeId"] = str(visa_doc["employeeId"])

        # Convert dates to datetime for MongoDB
        if "issueDate" in visa_doc:
            visa_doc["issueDate"] = datetime.combine(visa_doc["issueDate"], datetime.min.time())
        if "expiryDate" in visa_doc:
            visa_doc["expiryDate"] = datetime.combine(visa_doc["expiryDate"], datetime.min.time())

        await collection.insert_one(visa_doc)

        logger.info(f"Created visa: {visa.visaId} for employee {visa.employeeId}")
        return visa

    async def get_by_id(self, visa_id: UUID) -> Optional[Visa]:
        """
        Get visa by ID

        Args:
            visa_id: Visa ID

        Returns:
            Visa if found, None otherwise
        """
        collection = self._get_collection()
        visa_doc = await collection.find_one({"visaId": str(visa_id)})

        if visa_doc:
            visa_doc.pop("_id", None)
            # Convert datetime back to date
            if "issueDate" in visa_doc and isinstance(visa_doc["issueDate"], datetime):
                visa_doc["issueDate"] = visa_doc["issueDate"].date()
            if "expiryDate" in visa_doc and isinstance(visa_doc["expiryDate"], datetime):
                visa_doc["expiryDate"] = visa_doc["expiryDate"].date()
            return Visa(**visa_doc)
        return None

    async def get_by_employee_id(
        self,
        employee_id: UUID,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[Visa], int]:
        """
        Get visas for a specific employee

        Args:
            employee_id: Employee ID
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of visas, total count)
        """
        collection = self._get_collection()
        query = {"employeeId": str(employee_id)}

        # Get total count
        total = await collection.count_documents(query)

        # Get visas
        cursor = collection.find(query).sort("expiryDate", -1).skip(skip).limit(limit)
        visas = []

        async for visa_doc in cursor:
            visa_doc.pop("_id", None)
            # Convert datetime back to date
            if "issueDate" in visa_doc and isinstance(visa_doc["issueDate"], datetime):
                visa_doc["issueDate"] = visa_doc["issueDate"].date()
            if "expiryDate" in visa_doc and isinstance(visa_doc["expiryDate"], datetime):
                visa_doc["expiryDate"] = visa_doc["expiryDate"].date()
            visas.append(Visa(**visa_doc))

        return visas, total

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[VisaStatus] = None
    ) -> tuple[List[Visa], int]:
        """
        Get all visas with pagination

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by visa status (optional)

        Returns:
            Tuple of (list of visas, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value

        # Get total count
        total = await collection.count_documents(query)

        # Get visas
        cursor = collection.find(query).sort("expiryDate", -1).skip(skip).limit(limit)
        visas = []

        async for visa_doc in cursor:
            visa_doc.pop("_id", None)
            # Convert datetime back to date
            if "issueDate" in visa_doc and isinstance(visa_doc["issueDate"], datetime):
                visa_doc["issueDate"] = visa_doc["issueDate"].date()
            if "expiryDate" in visa_doc and isinstance(visa_doc["expiryDate"], datetime):
                visa_doc["expiryDate"] = visa_doc["expiryDate"].date()
            visas.append(Visa(**visa_doc))

        return visas, total

    async def update(self, visa_id: UUID, update_data: VisaUpdate) -> Optional[Visa]:
        """
        Update a visa

        Args:
            visa_id: Visa ID
            update_data: Fields to update

        Returns:
            Updated visa if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(visa_id)

        update_dict["updatedAt"] = datetime.utcnow()

        # Convert dates to datetime for MongoDB
        if "issueDate" in update_dict:
            update_dict["issueDate"] = datetime.combine(update_dict["issueDate"], datetime.min.time())
        if "expiryDate" in update_dict:
            update_dict["expiryDate"] = datetime.combine(update_dict["expiryDate"], datetime.min.time())

        result = await collection.update_one(
            {"visaId": str(visa_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated visa: {visa_id}")
            return await self.get_by_id(visa_id)

        return None

    async def delete(self, visa_id: UUID) -> bool:
        """
        Delete a visa (hard delete)

        Args:
            visa_id: Visa ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"visaId": str(visa_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted visa: {visa_id}")
            return True

        return False

    async def exists(self, visa_id: UUID) -> bool:
        """
        Check if visa exists

        Args:
            visa_id: Visa ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"visaId": str(visa_id)})
        return count > 0
