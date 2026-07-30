"""
Protocols Module - Registration Interface

Defines the module registration function called by the plugin system to
register the protocol library with the main FastAPI application.

This module is declared ``industries: ["all"]`` / ``industry_mode: "shared"``
in its manifest — every department has procedures, so the library is visible to
vegetable, mushroom and animal divisions alike.

Authorization for the ``protocols.*`` permissions lives in this module's own
``middleware/auth.py``, matching how the other modules own their namespaces.
Identity (JWT decode, user lookup) is reused rather than forked.
"""

import logging
from typing import Optional

from fastapi import FastAPI

from .api import api_router
from .config.settings import settings
from .services.database import protocols_db

logger = logging.getLogger(__name__)


async def startup_hook() -> None:
    """
    Module startup hook - called when the module is loaded.

    Connects to the database and creates module-specific MongoDB indexes.
    """
    logger.info(f"[Protocols Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}")

    try:
        await protocols_db.connect()
        logger.info("[Protocols Module] Database connected and indexes initialized")
    except Exception as e:
        logger.error(f"[Protocols Module] Failed to initialize database: {e}")
        raise


async def shutdown_hook() -> None:
    """
    Module shutdown hook - called when the module is unloaded.

    Delegates database disconnection to the core MongoDB manager.
    """
    logger.info("[Protocols Module] Shutting down")
    await protocols_db.disconnect()
    logger.info("[Protocols Module] Database disconnected")


def register(app: FastAPI, prefix: Optional[str] = None) -> None:
    """
    Register the genetics module with the main application.

    Args:
        app: The main FastAPI application instance.
        prefix: Optional route prefix override. Defaults to the manifest value
                (/api/v1/protocols).
    """
    route_prefix = prefix or settings.API_PREFIX

    logger.info(f"[Protocols Module] Registering routes with prefix: {route_prefix}")

    app.include_router(
        api_router,
        prefix=route_prefix,
        tags=["protocols"],
    )

    app.add_event_handler("startup", startup_hook)
    app.add_event_handler("shutdown", shutdown_hook)

    logger.info(f"[Protocols Module] Successfully registered v{settings.MODULE_VERSION}")


# Module metadata (used by the plugin system for discovery)
__module_name__ = "protocols"
__version__ = settings.MODULE_VERSION
__description__ = "Cross-domain protocol library and lab traceability tracker"
