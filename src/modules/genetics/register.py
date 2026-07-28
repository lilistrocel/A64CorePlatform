"""
Genetics Repo Module - Registration Interface

Defines the module registration function called by the plugin system to
register the genetics repository with the main FastAPI application.

This module is declared ``industries: ["all"]`` / ``industry_mode: "shared"``
in its manifest — the lab is shared across every department, so the repo is
visible to vegetable, mushroom and animal divisions alike.
"""

import logging
from typing import Optional

from fastapi import FastAPI

from .api import api_router
from .config.settings import settings
from .services.database import genetics_db

logger = logging.getLogger(__name__)


async def startup_hook() -> None:
    """
    Module startup hook - called when the module is loaded.

    Connects to the database and creates module-specific MongoDB indexes.
    """
    logger.info(f"[Genetics Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}")

    try:
        await genetics_db.connect()
        logger.info("[Genetics Module] Database connected and indexes initialized")
    except Exception as e:
        logger.error(f"[Genetics Module] Failed to initialize database: {e}")
        raise


async def shutdown_hook() -> None:
    """
    Module shutdown hook - called when the module is unloaded.

    Delegates database disconnection to the core MongoDB manager.
    """
    logger.info("[Genetics Module] Shutting down")
    await genetics_db.disconnect()
    logger.info("[Genetics Module] Database disconnected")


def register(app: FastAPI, prefix: Optional[str] = None) -> None:
    """
    Register the genetics module with the main application.

    Args:
        app: The main FastAPI application instance.
        prefix: Optional route prefix override. Defaults to the manifest value
                (/api/v1/genetics).
    """
    route_prefix = prefix or settings.API_PREFIX

    logger.info(f"[Genetics Module] Registering routes with prefix: {route_prefix}")

    app.include_router(
        api_router,
        prefix=route_prefix,
        tags=["genetics"],
    )

    app.add_event_handler("startup", startup_hook)
    app.add_event_handler("shutdown", shutdown_hook)

    logger.info(f"[Genetics Module] Successfully registered v{settings.MODULE_VERSION}")


# Module metadata (used by the plugin system for discovery)
__module_name__ = "genetics"
__version__ = settings.MODULE_VERSION
__description__ = "Cross-domain genetics repository and lab traceability tracker"
