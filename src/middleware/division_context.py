"""
Division Context Middleware

Reads X-Division-Id header from requests and sets a ContextVar
accessible throughout the request lifecycle. Repositories use this
to auto-scope queries to the active division.
"""

import logging
from contextvars import ContextVar
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger(__name__)

# ContextVar holds the current division ID for the request scope
_division_id_var: ContextVar[Optional[str]] = ContextVar("division_id", default=None)
_organization_id_var: ContextVar[Optional[str]] = ContextVar("organization_id", default=None)


def get_current_division_id() -> Optional[str]:
    """Get the division ID for the current request context."""
    return _division_id_var.get()


def get_current_organization_id() -> Optional[str]:
    """Get the organization ID for the current request context."""
    return _organization_id_var.get()


def set_division_context(division_id: Optional[str], organization_id: Optional[str] = None) -> None:
    """Manually set division context (useful for background tasks)."""
    _division_id_var.set(division_id)
    if organization_id:
        _organization_id_var.set(organization_id)


class DivisionContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware that reads X-Division-Id and X-Organization-Id headers
    and sets them as ContextVars for the duration of the request.

    If no header is present, the ContextVar defaults to None,
    meaning queries run without division scoping (global scope).
    This ensures backward compatibility.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Read division ID from header
        division_id = request.headers.get("X-Division-Id")
        organization_id = request.headers.get("X-Organization-Id")

        # Set context vars for this request
        division_token = _division_id_var.set(division_id)
        org_token = _organization_id_var.set(organization_id)

        try:
            response = await call_next(request)
            return response
        finally:
            # Reset context vars after request completes
            _division_id_var.reset(division_token)
            _organization_id_var.reset(org_token)
