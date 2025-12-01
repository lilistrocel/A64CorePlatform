"""
Farm Manager Module - Registration Interface

This file defines the module registration function that will be called
by the plugin system to register this module with the main application.
"""

from fastapi import FastAPI
import logging
from typing import Optional

from .api import api_router
from .services.database import farm_db
from .config.settings import settings

logger = logging.getLogger(__name__)


async def startup_hook():
    """
    Module startup hook - Called when module is loaded

    This connects to the database and performs any necessary initialization,
    including starting the weather cache background refresh.
    """
    logger.info(f"[Farm Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}")

    try:
        await farm_db.connect()
        logger.info("[Farm Module] Database connected successfully")
    except Exception as e:
        logger.error(f"[Farm Module] Failed to connect to database: {e}")
        raise

    # Initialize weather cache service with background refresh
    try:
        from .services.weather.weather_cache_service import WeatherCacheService

        db = farm_db.get_database()
        weather_cache = await WeatherCacheService.initialize(db)

        # Start background refresh (every hour = 3600 seconds)
        await weather_cache.start_background_refresh(interval_seconds=3600)
        logger.info("[Farm Module] Weather cache service initialized with hourly refresh")
    except Exception as e:
        logger.error(f"[Farm Module] Failed to initialize weather cache: {e}")
        # Don't raise - weather cache is not critical for startup


async def shutdown_hook():
    """
    Module shutdown hook - Called when module is unloaded

    This disconnects from the database and cleans up resources.
    """
    logger.info("[Farm Module] Shutting down")

    # Stop weather cache background refresh
    try:
        from .services.weather.weather_cache_service import get_weather_cache_service
        weather_cache = get_weather_cache_service()
        await weather_cache.stop_background_refresh()
        logger.info("[Farm Module] Weather cache background refresh stopped")
    except Exception as e:
        logger.error(f"[Farm Module] Error stopping weather cache: {e}")

    await farm_db.disconnect()
    logger.info("[Farm Module] Database disconnected")


def register(app: FastAPI, prefix: Optional[str] = None) -> None:
    """
    Register the farm manager module with the main application.

    Args:
        app: The main FastAPI application instance
        prefix: Optional route prefix override (defaults to manifest value)

    This function:
    1. Registers all farm management API routes
    2. Adds module-specific middleware if needed
    3. Sets up module lifecycle hooks
    """
    # Use manifest prefix if not overridden
    route_prefix = prefix or settings.API_PREFIX

    logger.info(f"[Farm Module] Registering routes with prefix: {route_prefix}")

    # Register API routes
    app.include_router(
        api_router,
        prefix=route_prefix,
        tags=["farm"]
    )

    # Register lifecycle hooks
    app.add_event_handler("startup", startup_hook)
    app.add_event_handler("shutdown", shutdown_hook)

    logger.info(f"[Farm Module] Successfully registered v{settings.MODULE_VERSION}")


# Module metadata (for plugin system discovery)
__module_name__ = "farm_manager"
__version__ = settings.MODULE_VERSION
__description__ = "Complete farm and block management system"
