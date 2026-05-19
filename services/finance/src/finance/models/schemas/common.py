"""
Common Pydantic schemas for the finance service.

Defines the standard response envelopes used across all endpoints.
Mirrors the structure of farm_manager/utils/responses.py in the main app.
"""

from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class SuccessResponse(BaseModel, Generic[T]):
    """Standard success response envelope."""

    data: T
    message: Optional[str] = None


class ErrorDetail(BaseModel):
    """Structured error detail."""

    message: str
    code: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    error: ErrorDetail


class PaginationMeta(BaseModel):
    """Pagination metadata."""

    total: int = Field(..., description="Total item count")
    page: int = Field(..., description="Current page (1-based)")
    size: int = Field(..., description="Items per page")
    pages: int = Field(..., description="Total number of pages")


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response with items + metadata."""

    items: List[T]
    total: int
    page: int
    size: int
    pages: int
