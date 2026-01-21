"""
Marketing Module - API v1 Routes
"""

from fastapi import APIRouter
from .budgets import router as budgets_router
from .campaigns import router as campaigns_router
from .channels import router as channels_router
from .events import router as events_router
from .dashboard import router as dashboard_router

api_router = APIRouter()

# Include route modules
api_router.include_router(budgets_router, prefix="/budgets", tags=["marketing-budgets"])
api_router.include_router(campaigns_router, prefix="/campaigns", tags=["marketing-campaigns"])
api_router.include_router(channels_router, prefix="/channels", tags=["marketing-channels"])
api_router.include_router(events_router, prefix="/events", tags=["marketing-events"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["marketing-dashboard"])
