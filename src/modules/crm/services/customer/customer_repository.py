"""
Customer Repository

Data access layer for Customer operations.
Handles all database interactions for customers.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from ...models.customer import Customer, CustomerCreate, CustomerUpdate, CustomerStatus
from ..database import crm_db

logger = logging.getLogger(__name__)


class CustomerRepository:
    """Repository for Customer data access"""

    def __init__(self):
        self.collection_name = "customers"

    def _get_collection(self):
        """Get customers collection"""
        return crm_db.get_collection(self.collection_name)

    async def _get_next_customer_sequence(self) -> int:
        """
        Get next customer sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for customer codes.

        Returns:
            Next sequence number for customer code
        """
        db = crm_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "customer_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, customer_data: CustomerCreate, created_by: UUID) -> Customer:
        """
        Create a new customer with auto-generated customerCode

        Args:
            customer_data: Customer creation data
            created_by: ID of the user creating the customer

        Returns:
            Created customer
        """
        collection = self._get_collection()

        # Generate customer code (e.g., "C001", "C002")
        sequence = await self._get_next_customer_sequence()
        customer_code = f"C{sequence:03d}"

        customer_dict = customer_data.model_dump()
        customer = Customer(
            **customer_dict,
            customerCode=customer_code,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        customer_doc = customer.model_dump(by_alias=True)
        customer_doc["customerId"] = str(customer_doc["customerId"])  # Convert UUID to string for MongoDB
        customer_doc["createdBy"] = str(customer_doc["createdBy"])

        await collection.insert_one(customer_doc)

        logger.info(f"Created customer: {customer.customerId} with code {customer_code}")
        return customer

    async def get_by_id(self, customer_id: UUID) -> Optional[Customer]:
        """
        Get customer by ID

        Args:
            customer_id: Customer ID

        Returns:
            Customer if found, None otherwise
        """
        collection = self._get_collection()
        customer_doc = await collection.find_one({"customerId": str(customer_id)})

        if customer_doc:
            customer_doc.pop("_id", None)  # Remove MongoDB _id
            return Customer(**customer_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[CustomerStatus] = None,
        customer_type: Optional[str] = None
    ) -> tuple[List[Customer], int]:
        """
        Get all customers with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by customer status (optional)
            customer_type: Filter by customer type (optional)

        Returns:
            Tuple of (list of customers, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if customer_type:
            query["type"] = customer_type

        # Get total count
        total = await collection.count_documents(query)

        # Get customers
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        customers = []

        async for customer_doc in cursor:
            customer_doc.pop("_id", None)
            customers.append(Customer(**customer_doc))

        return customers, total

    async def search(
        self,
        search_term: str,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[Customer], int]:
        """
        Search customers by name, email, or company using text search

        Args:
            search_term: Search term to match
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of customers, total count)
        """
        collection = self._get_collection()

        # Use MongoDB text search
        query = {"$text": {"$search": search_term}}

        # Get total count
        total = await collection.count_documents(query)

        # Get customers with text score sorting
        cursor = collection.find(
            query,
            {"score": {"$meta": "textScore"}}
        ).sort([("score", {"$meta": "textScore"})]).skip(skip).limit(limit)

        customers = []
        async for customer_doc in cursor:
            customer_doc.pop("_id", None)
            customer_doc.pop("score", None)  # Remove score field
            customers.append(Customer(**customer_doc))

        return customers, total

    async def update(self, customer_id: UUID, update_data: CustomerUpdate) -> Optional[Customer]:
        """
        Update a customer

        Args:
            customer_id: Customer ID
            update_data: Fields to update

        Returns:
            Updated customer if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(customer_id)

        update_dict["updatedAt"] = datetime.utcnow()

        result = await collection.update_one(
            {"customerId": str(customer_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated customer: {customer_id}")
            return await self.get_by_id(customer_id)

        return None

    async def delete(self, customer_id: UUID) -> bool:
        """
        Delete a customer (hard delete)

        Args:
            customer_id: Customer ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"customerId": str(customer_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted customer: {customer_id}")
            return True

        return False

    async def exists(self, customer_id: UUID) -> bool:
        """
        Check if customer exists

        Args:
            customer_id: Customer ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"customerId": str(customer_id)})
        return count > 0
