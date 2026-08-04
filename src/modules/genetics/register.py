"""
Genetics Repo Module - Registration Interface

Defines the module registration function called by the plugin system to
register the genetics repository with the main FastAPI application.

This module is declared ``industries: ["all"]`` / ``industry_mode: "shared"``
in its manifest — the lab is shared across every department, so the repo is
visible to vegetable, mushroom and animal divisions alike.

Authorization for the ``genetics.*`` permissions declared in the manifest lives
in this module's own ``middleware/auth.py``, matching how sales and farm_manager
each own their namespace. Identity (JWT decode, user lookup) is reused from
farm_manager rather than forked.
"""

import logging
from typing import Optional

from fastapi import FastAPI

from .api import api_router
from .api.v1.public import router as public_router
from .config.settings import settings
from .services.database import genetics_db

logger = logging.getLogger(__name__)

# T-804 step 3 — the public label-info route lives at a fixed, hardcoded
# prefix rather than deriving from `settings.API_PREFIX` / the manifest's
# `route_prefix` (both "/api/v1/genetics", the AUTHENTICATED namespace).
# Keeping this prefix a separate literal, mounted as its own
# `app.include_router()` call below rather than folded into `api_router`,
# is deliberate: it means the entire unauthenticated surface of this module
# is exactly the routes under this one prefix, visible in one place, and
# nobody can accidentally make a route public by adding it to `api_router`
# — that router is mounted at PUBLIC_API_PREFIX's authenticated sibling and
# every route on it requires `Depends(require_view)` or stricter.
PUBLIC_API_PREFIX = "/api/v1/public/genetics"


async def startup_hook() -> None:
    """
    Module startup hook - called when the module is loaded.

    Connects to the database and creates module-specific MongoDB indexes.
    """
    logger.info(
        f"[Genetics Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}"
    )

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

    # T-804 step 3 — mounted SEPARATELY from `api_router` above, at its own
    # fixed prefix, with no auth dependency on any route inside it. See the
    # `PUBLIC_API_PREFIX` comment above and public.py's module docstring for
    # why this structural separation is the point, not an implementation
    # detail: it is the thing that makes "is this route public?" answerable
    # by "is it mounted under PUBLIC_API_PREFIX?" rather than by auditing
    # every route's dependency list.
    logger.info(
        f"[Genetics Module] Registering PUBLIC routes with prefix: {PUBLIC_API_PREFIX}"
    )
    app.include_router(
        public_router,
        prefix=PUBLIC_API_PREFIX,
        tags=["genetics-public"],
    )

    app.add_event_handler("startup", startup_hook)
    app.add_event_handler("shutdown", shutdown_hook)

    logger.info(f"[Genetics Module] Successfully registered v{settings.MODULE_VERSION}")


# Module metadata (used by the plugin system for discovery)
__module_name__ = "genetics"
__version__ = settings.MODULE_VERSION
__description__ = "Cross-domain genetics repository and lab traceability tracker"
