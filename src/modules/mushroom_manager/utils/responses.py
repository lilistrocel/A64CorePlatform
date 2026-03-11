"""
Mushroom Management Module - API Response Models

Standard response formats following the A64Core response convention.
"""

from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class SuccessResponse(BaseModel, Generic[T]):
    """Standard success response wrapping a single data object."""
    data: T
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


class PaginationMeta(BaseModel):
    """Pagination metadata attached to list responses."""
    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    perPage: int = Field(..., description="Items per page")
    totalPages: int = Field(..., description="Total number of pages")


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated list response with metadata."""
    data: List[T]
    meta: PaginationMeta
