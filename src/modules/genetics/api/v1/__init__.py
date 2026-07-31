"""
Genetics Repo Module - API v1 Routes

Aggregates all v1 routers into a single api_router.
"""

from fastapi import APIRouter

from .accessions import router as accessions_router
from .dashboard import router as dashboard_router
from .labels import router as labels_router
from .lineage import router as lineage_router
from .lines import router as lines_router
from .media import router as media_router
from .observations import router as observations_router
from .propagations import router as propagations_router

api_router = APIRouter()

# -------------------------------------------------------------------------
# Genetic lines — the named identities (strains, varieties, bloodlines)
# -------------------------------------------------------------------------
api_router.include_router(
    lines_router,
    prefix="/lines",
    tags=["genetics-lines"],
)

# -------------------------------------------------------------------------
# Accessions — physical material, plus split and code lookup
# -------------------------------------------------------------------------
api_router.include_router(
    accessions_router,
    prefix="/accessions",
    tags=["genetics-accessions"],
)

# -------------------------------------------------------------------------
# Labels — Brother QL-800 label PDF generation (T-804)
# -------------------------------------------------------------------------
api_router.include_router(
    labels_router,
    prefix="/accessions",
    tags=["genetics-accessions"],
)

# -------------------------------------------------------------------------
# Propagations — clones and crosses, and the transfer log
# -------------------------------------------------------------------------
api_router.include_router(
    propagations_router,
    prefix="/propagations",
    tags=["genetics-propagations"],
)

# -------------------------------------------------------------------------
# Media — recipes, prepared batches, additive readout
# -------------------------------------------------------------------------
api_router.include_router(
    media_router,
    prefix="/media",
    tags=["genetics-media"],
)

# -------------------------------------------------------------------------
# Observations — dated notes and novel-trait promotion
# -------------------------------------------------------------------------
api_router.include_router(
    observations_router,
    prefix="/observations",
    tags=["genetics-observations"],
)

# -------------------------------------------------------------------------
# Lineage — DAG graph and ancestry breadcrumb
# -------------------------------------------------------------------------
api_router.include_router(
    lineage_router,
    prefix="/lineage",
    tags=["genetics-lineage"],
)

# -------------------------------------------------------------------------
# Dashboard
# -------------------------------------------------------------------------
api_router.include_router(
    dashboard_router,
    prefix="/dashboard",
    tags=["genetics-dashboard"],
)

__all__ = ["api_router"]
