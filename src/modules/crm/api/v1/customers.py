"""
CRM Module - Customer API Routes

Endpoints for customer CRUD operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional, List
from uuid import UUID
import logging

from ...models.customer import Customer, CustomerCreate, CustomerUpdate, CustomerStatus, CustomerType
from ...services.customer import CustomerService
from ...middleware.auth import get_current_active_user, require_permission, CurrentUser
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Customer],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new customer",
    description="Create a new customer. Requires crm.create permission."
)
async def create_customer(
    customer_data: CustomerCreate,
    current_user: CurrentUser = Depends(require_permission("crm.create")),
    service: CustomerService = Depends()
):
    """
    Create a new customer

    - **name**: Customer name (required)
    - **email**: Customer email address (optional)
    - **phone**: Customer phone number (optional)
    - **company**: Company name (optional)
    - **address**: Customer address (optional)
    - **type**: Customer type - individual or business (default: individual)
    - **status**: Customer status - active, inactive, lead, prospect (default: lead)
    - **notes**: Additional notes (optional)
    - **tags**: Tags for categorization (optional)
    """
    customer = await service.create_customer(
        customer_data,
        UUID(current_user.userId)
    )

    return SuccessResponse(
        data=customer,
        message="Customer created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Customer],
    summary="Get all customers",
    description="Get all customers with pagination and filters. Requires crm.view permission."
)
async def get_customers(
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[CustomerStatus] = Query(None, description="Filter by customer status"),
    type: Optional[CustomerType] = Query(None, description="Filter by customer type"),
    current_user: CurrentUser = Depends(require_permission("crm.view")),
    service: CustomerService = Depends()
):
    """
    Get all customers with pagination

    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    - **status**: Filter by customer status (optional)
    - **type**: Filter by customer type (optional)
    """
    customers, total, total_pages = await service.get_all_customers(
        page, perPage, status, type.value if type else None
    )

    return PaginatedResponse(
        data=customers,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/search",
    response_model=PaginatedResponse[Customer],
    summary="Search customers",
    description="Search customers by name, email, or company. Requires crm.view permission."
)
async def search_customers(
    q: str = Query(..., min_length=1, description="Search term"),
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(require_permission("crm.view")),
    service: CustomerService = Depends()
):
    """
    Search customers by name, email, or company

    - **q**: Search term (required)
    - **page**: Page number (default: 1)
    - **perPage**: Items per page (default: 20, max: 100)
    """
    customers, total, total_pages = await service.search_customers(
        q, page, perPage
    )

    return PaginatedResponse(
        data=customers,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/{customer_id}",
    response_model=SuccessResponse[Customer],
    summary="Get customer by ID",
    description="Get a specific customer by ID. Requires crm.view permission."
)
async def get_customer(
    customer_id: UUID,
    current_user: CurrentUser = Depends(require_permission("crm.view")),
    service: CustomerService = Depends()
):
    """
    Get customer by ID

    - **customer_id**: Customer UUID
    """
    customer = await service.get_customer(customer_id)

    return SuccessResponse(data=customer)


@router.patch(
    "/{customer_id}",
    response_model=SuccessResponse[Customer],
    summary="Update customer",
    description="Update a customer. Requires crm.edit permission."
)
async def update_customer(
    customer_id: UUID,
    update_data: CustomerUpdate,
    current_user: CurrentUser = Depends(require_permission("crm.edit")),
    service: CustomerService = Depends()
):
    """
    Update a customer

    - **customer_id**: Customer UUID
    - All fields are optional (partial update)
    """
    customer = await service.update_customer(
        customer_id,
        update_data
    )

    return SuccessResponse(
        data=customer,
        message="Customer updated successfully"
    )


@router.delete(
    "/{customer_id}",
    response_model=SuccessResponse[dict],
    summary="Delete customer",
    description="Delete a customer. Requires crm.delete permission."
)
async def delete_customer(
    customer_id: UUID,
    current_user: CurrentUser = Depends(require_permission("crm.delete")),
    service: CustomerService = Depends()
):
    """
    Delete a customer

    - **customer_id**: Customer UUID
    """
    result = await service.delete_customer(customer_id)

    return SuccessResponse(
        data=result,
        message="Customer deleted successfully"
    )
