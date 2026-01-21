"""
Logistics Module - API v1 Routes
"""

from fastapi import APIRouter
from .vehicles import router as vehicles_router
from .routes import router as routes_router
from .shipments import router as shipments_router

api_router = APIRouter()

# Include route modules
api_router.include_router(vehicles_router, prefix="/vehicles", tags=["vehicles"])
api_router.include_router(routes_router, prefix="/routes", tags=["routes"])
api_router.include_router(shipments_router, prefix="/shipments", tags=["shipments"])
