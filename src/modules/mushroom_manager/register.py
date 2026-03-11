"""
Mushroom Manager Module - Registration Interface

This file defines the module registration function called by the plugin system
to register the mushroom manager module with the main FastAPI application.
"""

import logging
from typing import Optional

from fastapi import FastAPI

from .api import api_router
from .services.database import mushroom_db
from .config.settings import settings

logger = logging.getLogger(__name__)


async def startup_hook() -> None:
    """
    Module startup hook - called when the module is loaded.

    Connects to the database and creates module-specific MongoDB indexes.
    """
    logger.info(f"[Mushroom Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}")

    try:
        await mushroom_db.connect()
        logger.info("[Mushroom Module] Database connected and indexes initialized")
    except Exception as e:
        logger.error(f"[Mushroom Module] Failed to initialize database: {e}")
        raise


async def shutdown_hook() -> None:
    """
    Module shutdown hook - called when the module is unloaded.

    Delegates database disconnection to the core MongoDB manager.
    """
    logger.info("[Mushroom Module] Shutting down")
    await mushroom_db.disconnect()
    logger.info("[Mushroom Module] Database disconnected")


def register(app: FastAPI, prefix: Optional[str] = None) -> None:
    """
    Register the mushroom manager module with the main application.

    Registers all mushroom management API routes under the configured prefix
    and attaches startup/shutdown lifecycle hooks.

    Args:
        app: The main FastAPI application instance.
        prefix: Optional route prefix override. Defaults to the manifest value
                (/api/v1/mushroom).
    """
    route_prefix = prefix or settings.API_PREFIX

    logger.info(f"[Mushroom Module] Registering routes with prefix: {route_prefix}")

    # Register all API routes
    app.include_router(
        api_router,
        prefix=route_prefix,
        tags=["mushroom"],
    )

    # Register module lifecycle hooks
    app.add_event_handler("startup", startup_hook)
    app.add_event_handler("shutdown", shutdown_hook)

    logger.info(f"[Mushroom Module] Successfully registered v{settings.MODULE_VERSION}")


# Module metadata (used by the plugin system for discovery)
__module_name__ = "mushroom_manager"
__version__ = settings.MODULE_VERSION
__description__ = "Controlled-environment mushroom cultivation management"
