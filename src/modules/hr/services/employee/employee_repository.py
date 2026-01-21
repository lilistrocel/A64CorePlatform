"""
Employee Repository

Data access layer for Employee operations.
Handles all database interactions for employees.
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import logging

from src.modules.hr.models.employee import Employee, EmployeeCreate, EmployeeUpdate, EmployeeStatus
from src.modules.hr.services.database import hr_db

logger = logging.getLogger(__name__)


class EmployeeRepository:
    """Repository for Employee data access"""

    def __init__(self):
        self.collection_name = "employees"

    def _get_collection(self):
        """Get employees collection"""
        return hr_db.get_collection(self.collection_name)

    async def _get_next_employee_sequence(self) -> int:
        """
        Get next employee sequence number using atomic increment.

        Uses a counters collection to maintain an atomic counter for employee codes.

        Returns:
            Next sequence number for employee code
        """
        db = hr_db.get_database()

        # Use findOneAndUpdate with upsert to atomically get and increment
        result = await db.counters.find_one_and_update(
            {"_id": "employee_sequence"},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=True
        )

        return result["value"]

    async def create(self, employee_data: EmployeeCreate, created_by: UUID) -> Employee:
        """
        Create a new employee with auto-generated employeeCode

        Args:
            employee_data: Employee creation data
            created_by: ID of the user creating the employee

        Returns:
            Created employee
        """
        collection = self._get_collection()

        # Generate employee code (e.g., "E001", "E002")
        sequence = await self._get_next_employee_sequence()
        employee_code = f"E{sequence:03d}"

        employee_dict = employee_data.model_dump()
        employee = Employee(
            **employee_dict,
            employeeCode=employee_code,
            createdBy=created_by,
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow()
        )

        employee_doc = employee.model_dump(by_alias=True)
        employee_doc["employeeId"] = str(employee_doc["employeeId"])  # Convert UUID to string for MongoDB
        employee_doc["createdBy"] = str(employee_doc["createdBy"])

        # Convert date to datetime for MongoDB
        if "hireDate" in employee_doc:
            employee_doc["hireDate"] = datetime.combine(employee_doc["hireDate"], datetime.min.time())

        await collection.insert_one(employee_doc)

        logger.info(f"Created employee: {employee.employeeId} with code {employee_code}")
        return employee

    async def get_by_id(self, employee_id: UUID) -> Optional[Employee]:
        """
        Get employee by ID

        Args:
            employee_id: Employee ID

        Returns:
            Employee if found, None otherwise
        """
        collection = self._get_collection()
        employee_doc = await collection.find_one({"employeeId": str(employee_id)})

        if employee_doc:
            employee_doc.pop("_id", None)  # Remove MongoDB _id
            # Convert datetime back to date
            if "hireDate" in employee_doc and isinstance(employee_doc["hireDate"], datetime):
                employee_doc["hireDate"] = employee_doc["hireDate"].date()
            return Employee(**employee_doc)
        return None

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[EmployeeStatus] = None,
        department: Optional[str] = None
    ) -> tuple[List[Employee], int]:
        """
        Get all employees with pagination and filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records to return
            status: Filter by employee status (optional)
            department: Filter by department (optional)

        Returns:
            Tuple of (list of employees, total count)
        """
        collection = self._get_collection()
        query = {}

        if status:
            query["status"] = status.value
        if department:
            query["department"] = department

        # Get total count
        total = await collection.count_documents(query)

        # Get employees
        cursor = collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        employees = []

        async for employee_doc in cursor:
            employee_doc.pop("_id", None)
            # Convert datetime back to date
            if "hireDate" in employee_doc and isinstance(employee_doc["hireDate"], datetime):
                employee_doc["hireDate"] = employee_doc["hireDate"].date()
            employees.append(Employee(**employee_doc))

        return employees, total

    async def search(
        self,
        search_term: str,
        skip: int = 0,
        limit: int = 20
    ) -> tuple[List[Employee], int]:
        """
        Search employees by name, email, or department using text search

        Args:
            search_term: Search term to match
            skip: Number of records to skip
            limit: Maximum number of records to return

        Returns:
            Tuple of (list of employees, total count)
        """
        collection = self._get_collection()

        # Use MongoDB text search
        query = {"$text": {"$search": search_term}}

        # Get total count
        total = await collection.count_documents(query)

        # Get employees with text score sorting
        cursor = collection.find(
            query,
            {"score": {"$meta": "textScore"}}
        ).sort([("score", {"$meta": "textScore"})]).skip(skip).limit(limit)

        employees = []
        async for employee_doc in cursor:
            employee_doc.pop("_id", None)
            employee_doc.pop("score", None)  # Remove score field
            # Convert datetime back to date
            if "hireDate" in employee_doc and isinstance(employee_doc["hireDate"], datetime):
                employee_doc["hireDate"] = employee_doc["hireDate"].date()
            employees.append(Employee(**employee_doc))

        return employees, total

    async def update(self, employee_id: UUID, update_data: EmployeeUpdate) -> Optional[Employee]:
        """
        Update an employee

        Args:
            employee_id: Employee ID
            update_data: Fields to update

        Returns:
            Updated employee if found, None otherwise
        """
        collection = self._get_collection()

        update_dict = update_data.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_by_id(employee_id)

        update_dict["updatedAt"] = datetime.utcnow()

        # Convert date to datetime for MongoDB
        if "hireDate" in update_dict:
            update_dict["hireDate"] = datetime.combine(update_dict["hireDate"], datetime.min.time())

        result = await collection.update_one(
            {"employeeId": str(employee_id)},
            {"$set": update_dict}
        )

        if result.modified_count > 0:
            logger.info(f"Updated employee: {employee_id}")
            return await self.get_by_id(employee_id)

        return None

    async def delete(self, employee_id: UUID) -> bool:
        """
        Delete an employee (hard delete)

        Args:
            employee_id: Employee ID

        Returns:
            True if deleted, False otherwise
        """
        collection = self._get_collection()

        result = await collection.delete_one({"employeeId": str(employee_id)})

        if result.deleted_count > 0:
            logger.info(f"Deleted employee: {employee_id}")
            return True

        return False

    async def exists(self, employee_id: UUID) -> bool:
        """
        Check if employee exists

        Args:
            employee_id: Employee ID

        Returns:
            True if exists, False otherwise
        """
        collection = self._get_collection()
        count = await collection.count_documents({"employeeId": str(employee_id)})
        return count > 0
