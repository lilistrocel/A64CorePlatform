"""
HR Module - API v1 Routes
"""

from fastapi import APIRouter
from .employees import router as employees_router
from .contracts import router as contracts_router
from .visas import router as visas_router
from .insurance import router as insurance_router
from .performance import router as performance_router
from .dashboard import router as dashboard_router

api_router = APIRouter()

# Include route modules
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["hr-dashboard"])
api_router.include_router(employees_router, prefix="/employees", tags=["employees"])
api_router.include_router(contracts_router, prefix="/contracts", tags=["contracts"])
api_router.include_router(visas_router, prefix="/visas", tags=["visas"])
api_router.include_router(insurance_router, prefix="/insurance", tags=["insurance"])
api_router.include_router(performance_router, prefix="/performance", tags=["performance"])
