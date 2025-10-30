"""
Farm Management Module - API v1 Routes
"""

from fastapi import APIRouter
from .farms import router as farms_router
from .blocks import router as blocks_router
from .plant_data import router as plant_data_router
from .plantings import router as plantings_router

api_router = APIRouter()

# Include route modules
api_router.include_router(farms_router, prefix="/farms", tags=["farms"])
api_router.include_router(blocks_router, tags=["blocks"])  # Blocks are nested under farms
api_router.include_router(plant_data_router, tags=["plant-data"])  # Plant data is top-level
api_router.include_router(plantings_router, tags=["plantings"])  # Planting management

# Future routes
# api_router.include_router(harvests_router, prefix="/harvests", tags=["harvests"])
# api_router.include_router(alerts_router, prefix="/alerts", tags=["alerts"])
