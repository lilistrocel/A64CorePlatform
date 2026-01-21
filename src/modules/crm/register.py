"""
CRM Module - Registration Interface

This file defines the module registration function that will be called
by the plugin system to register this module with the main application.
"""

from fastapi import FastAPI
import logging
from typing import Optional

from .api import api_router
from .services.database import crm_db
from .config.settings import settings

logger = logging.getLogger(__name__)


async def startup_hook():
    """
    Module startup hook - Called when module is loaded

    This connects to the database and performs any necessary initialization.
    """
    logger.info(f"[CRM Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}")

    try:
        await crm_db.connect()
        logger.info("[CRM Module] Database connected successfully")
    except Exception as e:
        logger.error(f"[CRM Module] Failed to connect to database: {e}")
        raise


async def shutdown_hook():
    """
    Module shutdown hook - Called when module is unloaded

    This disconnects from the database and cleans up resources.
    """
    logger.info("[CRM Module] Shutting down")
    await crm_db.disconnect()
    logger.info("[CRM Module] Database disconnected")


def register(app: FastAPI, prefix: Optional[str] = None) -> None:
    """
    Register the CRM module with the main application.

    Args:
        app: The main FastAPI application instance
        prefix: Optional route prefix override (defaults to manifest value)

    This function:
    1. Registers all CRM API routes
    2. Adds module-specific middleware if needed
    3. Sets up module lifecycle hooks
    """
    # Use manifest prefix if not overridden
    route_prefix = prefix or settings.API_PREFIX

    logger.info(f"[CRM Module] Registering routes with prefix: {route_prefix}")

    # Register API routes
    app.include_router(
        api_router,
        prefix=route_prefix,
        tags=["crm"]
    )

    # Register lifecycle hooks
    app.add_event_handler("startup", startup_hook)
    app.add_event_handler("shutdown", shutdown_hook)

    logger.info(f"[CRM Module] Successfully registered v{settings.MODULE_VERSION}")


# Module metadata (for plugin system discovery)
__module_name__ = "crm"
__version__ = settings.MODULE_VERSION
__description__ = "Customer Relationship Management system"
