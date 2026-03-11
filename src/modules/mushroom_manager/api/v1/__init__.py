"""
Mushroom Management Module - API v1 Routes

Aggregates all v1 routers into a single api_router.
"""

from fastapi import APIRouter

from .facilities import router as facilities_router
from .growing_rooms import router as growing_rooms_router
from .strains import router as strains_router
from .substrate_batches import router as substrate_batches_router
from .harvests import router as harvests_router
from .environment import router as environment_router
from .contamination import router as contamination_router
from .dashboard import router as dashboard_router

api_router = APIRouter()

# -------------------------------------------------------------------------
# Facility CRUD  -  GET/POST /facilities, GET/PATCH /facilities/{id}
# -------------------------------------------------------------------------
api_router.include_router(
    facilities_router,
    prefix="/facilities",
    tags=["mushroom-facilities"],
)

# -------------------------------------------------------------------------
# Growing Room CRUD + phase lifecycle
# Routes are defined with full paths inside the router (prefix="/facilities/...")
# so we include without an additional prefix here.
# -------------------------------------------------------------------------
api_router.include_router(
    growing_rooms_router,
    tags=["mushroom-rooms"],
)

# -------------------------------------------------------------------------
# Strain catalogue  -  GET/POST /strains, GET/PATCH /strains/{id}
# -------------------------------------------------------------------------
api_router.include_router(
    strains_router,
    prefix="/strains",
    tags=["mushroom-strains"],
)

# -------------------------------------------------------------------------
# Substrate batches  -  nested under facilities + direct batch access
# Routes are defined with full paths inside the router (prefix="/facilities/...")
# so we include without an additional prefix here.
# -------------------------------------------------------------------------
api_router.include_router(
    substrate_batches_router,
    tags=["mushroom-substrates"],
)

# -------------------------------------------------------------------------
# Harvests  -  nested under facilities/rooms + facility-level view
# Routes are defined with full paths inside the router.
# -------------------------------------------------------------------------
api_router.include_router(
    harvests_router,
    tags=["mushroom-harvests"],
)

# -------------------------------------------------------------------------
# Environment logs  -  nested under facilities/rooms
# -------------------------------------------------------------------------
api_router.include_router(
    environment_router,
    tags=["mushroom-environment"],
)

# -------------------------------------------------------------------------
# Contamination reports  -  nested under facilities/rooms + resolve endpoint
# Routes are defined with full paths inside the router.
# -------------------------------------------------------------------------
api_router.include_router(
    contamination_router,
    tags=["mushroom-contamination"],
)

# -------------------------------------------------------------------------
# Dashboard & analytics
# -------------------------------------------------------------------------
api_router.include_router(
    dashboard_router,
    prefix="/dashboard",
    tags=["mushroom-dashboard"],
)

__all__ = ["api_router"]
