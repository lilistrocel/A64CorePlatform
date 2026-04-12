"""
Finance Module - Registration Interface

Called by the plugin system to register this module with the main application.
"""

from fastapi import FastAPI
import logging
from typing import Optional

from .api import api_router
from .services.database import finance_db
from .config.settings import settings

logger = logging.getLogger(__name__)


async def startup_hook() -> None:
    """Module startup hook — creates indexes and confirms DB access."""
    logger.info(f"[Finance Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}")
    try:
        await finance_db.connect()
        logger.info("[Finance Module] Database indexes initialized successfully")
    except Exception as e:
        logger.error(f"[Finance Module] Failed during startup: {e}")
        raise


async def shutdown_hook() -> None:
    """Module shutdown hook."""
    logger.info("[Finance Module] Shutting down")
    await finance_db.disconnect()
    logger.info("[Finance Module] Shutdown complete")


def register(app: FastAPI, prefix: Optional[str] = None) -> None:
    """
    Register the Finance module with the main FastAPI application.

    Args:
        app: The main FastAPI application instance
        prefix: Optional route prefix override (defaults to manifest value /api/v1/finance)
    """
    route_prefix = prefix or settings.API_PREFIX

    logger.info(f"[Finance Module] Registering routes with prefix: {route_prefix}")

    app.include_router(
        api_router,
        prefix=route_prefix,
        tags=["finance"]
    )

    app.add_event_handler("startup", startup_hook)
    app.add_event_handler("shutdown", shutdown_hook)

    logger.info(f"[Finance Module] Successfully registered v{settings.MODULE_VERSION}")


# Module metadata for plugin system discovery
__module_name__ = "finance"
__version__ = settings.MODULE_VERSION
__description__ = "Financial analytics and P&L reporting"
