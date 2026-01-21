"""
Contract Repository

Data access layer for Contract operations.
Handles all database interactions for employment contracts.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.modules.hr.models.contract import Contract, ContractCreate, ContractUpdate, ContractStatus
from src.modules.hr.services.database import hr_db

logger = logging.getLogger(__name__)


class ContractRepository:
    """Repository for Contract data access"""

    def __init__(self):
        self.collection_name = "employee_contracts"

    def _get_collection(self):
        """Get contracts collection"""
        return hr_db.get_collection(self.collection_name)

    async def create(self, contract_data: ContractCreate) -> Contract:
        """
        Create a new contract

        Args:
            contract_data: Contract creation data

        Returns:
            Created contract
        """
        collection = self._get_collection()

        contract_dict = contract_data.model_dump()
        contract = Contract(
            **contract_dict,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        contract_doc = contract.model_dump(by_alias=True)
        contract_doc["contractId"] = str(contract_doc["contractId"])
        contract_doc["employeeId"] = str(contract_doc["employeeId"])

        # Convert dates to datetime for MongoDB
        if "startDate" in contract_doc:
            contract_doc["startDate"] = datetime.combine(contract_doc["startDate"], datetime.min.time())
        if "endDate" in contract_doc and contract_doc["endDate"]:
            contract_doc["endDate"] = datetime.combine(contract_doc["endDate"], datetime.min.time())

        await collection.insert_one(contract_doc)

        logger.info(f"Created contract: {contract.contractId} for employee {contract.employeeId}")
        return contract

    async def get_by_id(self, contract_id: UUID) -> Optional[Contract]:
        """
        Get contract by ID

        Args:
            contract_id: Contract ID

        Returns:
            Contract if found, None otherwise
        """
        collection = self._get_collection()
        contract_doc = await collection.find_one({"contractId": str(contract_id)})

        if contract_doc:
            contract_doc.pop("_id", None)
            # Convert datetime back to date
            if "startDate" in contract_doc and isinstance(contract_doc["startDate"], datetime):
                contract_doc["startDate"] = contract_doc["startDate"].date()
            if "endDate" in contract_doc and contract_doc["endDate"] and isinstance(contract_doc["endDate"], datetime):
                contract_doc["endDate"] = contract_doc["endDate"].date()
            return Contract(**contract_doc)
        return None

    async def get_by_employee_id(
        self,
        employee_id: UUID,
        skip: int = 0,
        limit: int = 20,
        status: Optional[ContractStatus] = None
    ) -> tuple[List[Contract], int]:
        """
        Get contracts for a specific employee

        Args:
            employee_id: Employee ID
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by contract status (optional)

        Returns:
            Tuple of (list of contracts, total count)
        """
        collection = self._get_collection()
        query = {"employeeId": str(employee_id)}

        if status:
            query["status"] = status.value

        # Get total count
        total = await collection.count_documents(query)

        # Get contracts
        cursor = collection.find(query).sort("startDate", -1).skip(skip).limit(limit)
        contracts = []

        async for contract_doc in cursor:
            contract_doc.pop("_id", None)
            # Convert datetime back to date
            if "startDate" in contract_doc and isinstance(contract_doc["startDate"], datetime):
                contract_doc["startDate"] = contract_doc["startDate"].date()
            if "endDate" in contract_doc and contract_doc["endDate"] and isinstance(contract_doc["endDate"], datetime):
                contract_doc["endDate"] = contract_doc["endDate"].date()
            contracts.append(Contract(**contract_doc))

        return contracts, total

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[ContractStatus] = None
    ) -> tuple[List[Contract], int]:
        """
        Get all contracts with pagination

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by contract status (optional)

        Returns:
            Tuple of (list of contracts, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value

        # Get total count
        total = await collection.count_documents(query)

        # Get contracts
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        contracts = []

        async for contract_doc in cursor:
            contract_doc.pop("_id", None)
            # Convert datetime back to date
            if "startDate" in contract_doc and isinstance(contract_doc["startDate"], datetime):
                contract_doc["startDate"] = contract_doc["startDate"].date()
            if "endDate" in contract_doc and contract_doc["endDate"] and isinstance(contract_doc["endDate"], datetime):
                contract_doc["endDate"] = contract_doc["endDate"].date()
            contracts.append(Contract(**contract_doc))

        return contracts, total

    async def update(self, contract_id: UUID, update_data: ContractUpdate) -> Optional[Contract]:
        """
        Update a contract

        Args:
            contract_id: Contract ID
            update_data: Fields to update

        Returns:
            Updated contract if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(contract_id)

        update_dict["updatedAt"] = datetime.utcnow()

        # Convert dates to datetime for MongoDB
        if "startDate" in update_dict:
            update_dict["startDate"] = datetime.combine(update_dict["startDate"], datetime.min.time())
        if "endDate" in update_dict and update_dict["endDate"]:
            update_dict["endDate"] = datetime.combine(update_dict["endDate"], datetime.min.time())

        result = await collection.update_one(
            {"contractId": str(contract_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated contract: {contract_id}")
            return await self.get_by_id(contract_id)

        return None

    async def delete(self, contract_id: UUID) -> bool:
        """
        Delete a contract (hard delete)

        Args:
            contract_id: Contract ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"contractId": str(contract_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted contract: {contract_id}")
            return True

        return False

    async def exists(self, contract_id: UUID) -> bool:
        """
        Check if contract exists

        Args:
            contract_id: Contract ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"contractId": str(contract_id)})
        return count > 0
