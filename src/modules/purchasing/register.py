"""
Purchasing Module — Registration Interface

Called by the plugin system at startup to register this module
with the main FastAPI application.
"""

import logging

from fastapi import FastAPI

from .api import api_router

logger = logging.getLogger(__name__)


def register(app: FastAPI, prefix: str = "/api/v1/purchasing") -> None:
    """
    Register the purchasing module with the FastAPI application.

    Mounts all purchasing API routers under the given prefix.

    Args:
        app: The main FastAPI application instance.
        prefix: URL prefix for all purchasing endpoints (default: /api/v1/purchasing).
    """
    app.include_router(
        api_router,
        prefix=prefix,
        tags=["Purchasing"],
    )
    logger.info("[Purchasing] Registered purchasing routes at %s", prefix)
