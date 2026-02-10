"""
Sales Module - API v1 Routes
"""

from fastapi import APIRouter
from .orders import router as orders_router
from .inventory import router as inventory_router
from .purchase_orders import router as purchase_orders_router
from .dashboard import router as dashboard_router
from .returns import router as returns_router
from .config import router as config_router

api_router = APIRouter()

# Include route modules - config first for /farming-years to not conflict with /{id} routes
api_router.include_router(config_router, prefix="", tags=["sales-config"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["sales-dashboard"])
api_router.include_router(orders_router, prefix="/orders", tags=["sales-orders"])
api_router.include_router(inventory_router, prefix="/inventory", tags=["inventory"])
api_router.include_router(purchase_orders_router, prefix="/purchase-orders", tags=["purchase-orders"])
api_router.include_router(returns_router, prefix="/returns", tags=["returns"])
