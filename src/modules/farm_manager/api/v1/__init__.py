"""
Farm Management Module - API v1 Routes
"""

from fastapi import APIRouter
from .farms import router as farms_router
from .blocks import router as blocks_router
from .plant_data import router as plant_data_router
from .plant_data_enhanced import router as plant_data_enhanced_router
from .plantings import router as plantings_router
from .managers import router as managers_router
from .block_harvests import router as block_harvests_router, farm_router as farm_harvests_router
from .block_alerts import router as block_alerts_router, farm_router as farm_alerts_router
from .block_archives import router as archives_router
from .dashboard import router as dashboard_router

api_router = APIRouter()

# Include route modules
api_router.include_router(farms_router, prefix="/farms", tags=["farms"])
api_router.include_router(blocks_router, tags=["blocks"])  # Blocks are nested under farms
api_router.include_router(dashboard_router, tags=["dashboard"])  # Farm dashboard with metrics
api_router.include_router(block_harvests_router, tags=["block-harvests"])  # Block harvest events
api_router.include_router(farm_harvests_router, tags=["farm-harvests"])  # Farm-level harvest views
api_router.include_router(block_alerts_router, tags=["block-alerts"])  # Block alerts
api_router.include_router(farm_alerts_router, tags=["farm-alerts"])  # Farm-level alert views
api_router.include_router(archives_router, tags=["block-archives"])  # Archived block cycles & analytics
api_router.include_router(plant_data_router, tags=["plant-data"])  # Plant data (legacy)
api_router.include_router(plant_data_enhanced_router, tags=["plant-data-enhanced"])  # Plant data (enhanced schema)
api_router.include_router(plantings_router, tags=["plantings"])  # Planting management
api_router.include_router(managers_router, tags=["managers"])  # Manager users for farm assignment
