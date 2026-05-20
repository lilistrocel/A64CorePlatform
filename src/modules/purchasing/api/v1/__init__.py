"""
Purchasing Module — API v1 Router

Aggregates all purchasing sub-routers under the /purchasing prefix.
"""

from fastapi import APIRouter

from .vendors import router as vendors_router
from .purchase_items import router as purchase_items_router
from .payment_terms import router as payment_terms_router

api_router = APIRouter()

api_router.include_router(vendors_router)
api_router.include_router(purchase_items_router)
api_router.include_router(payment_terms_router)
