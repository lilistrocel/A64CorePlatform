"""
CRM Module - API v1 Routes
"""

from fastapi import APIRouter
from .customers import router as customers_router

api_router = APIRouter()

# Include route modules
api_router.include_router(customers_router, prefix="/customers", tags=["customers"])
