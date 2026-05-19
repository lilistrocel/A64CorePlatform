"""
Response helper utilities.

Convenience functions for building standard SuccessResponse and
PaginatedResponse envelopes from ORM results.
"""

import math
from typing import List, TypeVar

from ..models.schemas.common import PaginatedResponse, SuccessResponse

T = TypeVar("T")


def success(data: T, message: str | None = None) -> SuccessResponse[T]:
    """
    Wrap data in a SuccessResponse envelope.

    Args:
        data: The response payload.
        message: Optional human-readable message.

    Returns:
        SuccessResponse instance.
    """
    return SuccessResponse(data=data, message=message)


def paginated(
    items: List[T],
    total: int,
    page: int,
    size: int,
) -> PaginatedResponse[T]:
    """
    Build a PaginatedResponse.

    Args:
        items: Current page items.
        total: Total item count across all pages.
        page: Current page number (1-based).
        size: Items per page.

    Returns:
        PaginatedResponse instance.
    """
    pages = max(1, math.ceil(total / size)) if size > 0 else 1
    return PaginatedResponse(items=items, total=total, page=page, size=size, pages=pages)
