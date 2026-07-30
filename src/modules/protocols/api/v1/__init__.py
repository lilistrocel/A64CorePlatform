"""
Protocols Module - API v1 Routes
"""

from fastapi import APIRouter

from .protocols import router as protocols_router

api_router = APIRouter()

# The prefix lives here rather than on the module registration so the route
# paths inside protocols.py can stay relative ("" for the collection).
api_router.include_router(protocols_router, prefix="/protocols", tags=["protocols"])

__all__ = ["api_router"]
