"""
Genetics Repo Module - API Response Models

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


def paginate(total: int, page: int, per_page: int) -> PaginationMeta:
    """Build pagination metadata from a total count."""
    total_pages = max(1, (total + per_page - 1) // per_page)
    return PaginationMeta(
        total=total,
        page=page,
        perPage=per_page,
        totalPages=total_pages,
    )
