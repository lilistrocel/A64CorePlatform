"""
HR Module - Registration Interface

This file defines the module registration function that will be called
by the plugin system to register this module with the main application.
"""

from fastapi import FastAPI
import logging
from typing import Optional

from .api import api_router
from .services.database import hr_db
from .config.settings import settings

logger = logging.getLogger(__name__)


async def startup_hook():
    """
    Module startup hook - Called when module is loaded

    This connects to the database and performs any necessary initialization.
    """
    logger.info(f"[HR Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}")

    try:
        await hr_db.connect()
        logger.info("[HR Module] Database connected successfully")
    except Exception as e:
        logger.error(f"[HR Module] Failed to connect to database: {e}")
        raise


async def shutdown_hook():
    """
    Module shutdown hook - Called when module is unloaded

    This disconnects from the database and cleans up resources.
    """
    logger.info("[HR Module] Shutting down")
    await hr_db.disconnect()
    logger.info("[HR Module] Database disconnected")


def register(app: FastAPI, prefix: Optional[str] = None) -> None:
    """
    Register the HR module with the main application.

    Args:
        app: The main FastAPI application instance
        prefix: Optional route prefix override (defaults to manifest value)

    This function:
    1. Registers all HR API routes
    2. Adds module-specific middleware if needed
    3. Sets up module lifecycle hooks
    """
    # Use manifest prefix if not overridden
    route_prefix = prefix or settings.API_PREFIX

    logger.info(f"[HR Module] Registering routes with prefix: {route_prefix}")

    # Register API routes
    app.include_router(
        api_router,
        prefix=route_prefix,
        tags=["hr"]
    )

    # Register lifecycle hooks
    app.add_event_handler("startup", startup_hook)
    app.add_event_handler("shutdown", shutdown_hook)

    logger.info(f"[HR Module] Successfully registered v{settings.MODULE_VERSION}")


# Module metadata (for plugin system discovery)
__module_name__ = "hr"
__version__ = settings.MODULE_VERSION
__description__ = "Human Resources management system"
