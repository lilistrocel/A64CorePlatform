"""
Contract Service

Business logic layer for Contract operations.
Handles validation, permissions, and orchestration.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import HTTPException, status
import logging

from src.modules.hr.models.contract import Contract, ContractCreate, ContractUpdate, ContractStatus
from src.modules.hr.services.employee.contract_repository import ContractRepository
from src.modules.hr.services.employee.employee_repository import EmployeeRepository

logger = logging.getLogger(__name__)


class ContractService:
    """Service for Contract business logic"""

    def __init__(self):
        self.repository = ContractRepository()
        self.employee_repository = EmployeeRepository()

    async def create_contract(
        self,
        contract_data: ContractCreate
    ) -> Contract:
        """
        Create a new contract

        Args:
            contract_data: Contract creation data

        Returns:
            Created contract

        Raises:
            HTTPException: If validation fails or employee not found
        """
        try:
            # Verify employee exists
            employee_exists = await self.employee_repository.exists(contract_data.employeeId)
            if not employee_exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Employee {contract_data.employeeId} not found"
                )

            # Validate dates
            if contract_data.endDate and contract_data.endDate < contract_data.startDate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date must be after start date"
                )

            contract = await self.repository.create(contract_data)
            logger.info(f"Contract created: {contract.contractId} for employee {contract.employeeId}")
            return contract

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating contract: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create contract"
            )

    async def get_contract(self, contract_id: UUID) -> Contract:
        """
        Get contract by ID

        Args:
            contract_id: Contract ID

        Returns:
            Contract

        Raises:
            HTTPException: If contract not found
        """
        contract = await self.repository.get_by_id(contract_id)
        if not contract:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Contract {contract_id} not found"
            )
        return contract

    async def get_employee_contracts(
        self,
        employee_id: UUID,
        page: int = 1,
        per_page: int = 20,
        status: Optional[ContractStatus] = None
    ) -> tuple[List[Contract], int, int]:
        """
        Get contracts for a specific employee

        Args:
            employee_id: Employee ID
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by contract status (optional)

        Returns:
            Tuple of (contracts, total, total_pages)
        """
        # Verify employee exists
        employee_exists = await self.employee_repository.exists(employee_id)
        if not employee_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee {employee_id} not found"
            )

        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        contracts, total = await self.repository.get_by_employee_id(employee_id, skip, per_page, status)

        total_pages = (total + per_page - 1) // per_page

        return contracts, total, total_pages

    async def get_all_contracts(
        self,
        page: int = 1,
        per_page: int = 20,
        status: Optional[ContractStatus] = None
    ) -> tuple[List[Contract], int, int]:
        """
        Get all contracts with pagination

        Args:
            page: Page number (1-indexed)
            per_page: Items per page
            status: Filter by contract status (optional)

        Returns:
            Tuple of (contracts, total, total_pages)
        """
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 20

        skip = (page - 1) * per_page
        contracts, total = await self.repository.get_all(skip, per_page, status)

        total_pages = (total + per_page - 1) // per_page

        return contracts, total, total_pages

    async def update_contract(
        self,
        contract_id: UUID,
        update_data: ContractUpdate
    ) -> Contract:
        """
        Update a contract

        Args:
            contract_id: Contract ID
            update_data: Fields to update

        Returns:
            Updated contract

        Raises:
            HTTPException: If contract not found or validation fails
        """
        # Check contract exists
        await self.get_contract(contract_id)

        # Validate dates if both are being updated
        if update_data.endDate and update_data.startDate:
            if update_data.endDate < update_data.startDate:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date must be after start date"
                )

        updated_contract = await self.repository.update(contract_id, update_data)
        if not updated_contract:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Contract {contract_id} not found"
            )

        logger.info(f"Contract updated: {contract_id}")
        return updated_contract

    async def delete_contract(self, contract_id: UUID) -> dict:
        """
        Delete a contract

        Args:
            contract_id: Contract ID

        Returns:
            Success message

        Raises:
            HTTPException: If contract not found
        """
        # Check contract exists
        await self.get_contract(contract_id)

        success = await self.repository.delete(contract_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Contract {contract_id} not found"
            )

        logger.info(f"Contract deleted: {contract_id}")
        return {"message": "Contract deleted successfully"}
