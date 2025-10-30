"""
API Response Models

Standard response formats for the farm management module.
"""

from typing import Generic, TypeVar, Optional, List, Any
from pydantic import BaseModel, Field

T = TypeVar('T')


class SuccessResponse(BaseModel, Generic[T]):
    """Standard success response"""
    data: T
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


class PaginationMeta(BaseModel):
    """Pagination metadata"""
    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    perPage: int = Field(..., description="Items per page")
    totalPages: int = Field(..., description="Total number of pages")


class PaginationLinks(BaseModel):
    """Pagination links"""
    first: Optional[str] = None
    last: Optional[str] = None
    prev: Optional[str] = None
    next: Optional[str] = None


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response with metadata"""
    data: List[T]
    meta: PaginationMeta
    links: Optional[PaginationLinks] = None
