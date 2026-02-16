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
from .tasks import router as tasks_router
from .config import router as config_router
from .weather import router as weather_router
from .inventory import router as inventory_router
from .iot_proxy import router as iot_proxy_router
from .sensehub import router as sensehub_router

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
api_router.include_router(tasks_router, tags=["tasks"])  # Operations Task Manager - farmer task management
api_router.include_router(config_router, tags=["config"])  # System configuration (spacing standards, etc.)
api_router.include_router(weather_router, tags=["weather"])  # Agricultural weather data from WeatherBit
api_router.include_router(inventory_router, tags=["inventory"])  # Inventory management (harvest, input, assets)
api_router.include_router(iot_proxy_router, tags=["iot-proxy"])  # IoT controller proxy for CORS handling
api_router.include_router(sensehub_router, tags=["sensehub"])  # SenseHub edge computing proxy
