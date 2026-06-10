"""
Purchasing Module — API v1 Router

Aggregates all purchasing sub-routers under the /purchasing prefix.
Phase 1A: vendors, purchase_items, payment_terms
Phase 1B: purchase_requests, purchase_orders, approvals
Phase B.1: goods_receipts
Phase C.1: ap_invoices
Wave 4 / T-200.23: ap_credit_notes
Wave 4 / T-200.24: ap_down_payments
Wave 4 / T-200.25: blanket_agreements
"""

from fastapi import APIRouter

from .vendors import router as vendors_router
from .purchase_items import router as purchase_items_router
from .payment_terms import router as payment_terms_router
from .purchase_requests import router as pr_router
from .purchase_orders import router as po_router
from .approvals import router as approvals_router
from .goods_receipts import router as gr_router
from .ap_invoices import router as ap_router
from .ap_credit_notes import router as acn_router
from .ap_down_payments import router as dpi_router
from .blanket_agreements import router as bla_router

api_router = APIRouter()

api_router.include_router(vendors_router)
api_router.include_router(purchase_items_router)
api_router.include_router(payment_terms_router)
api_router.include_router(pr_router)
api_router.include_router(po_router)
api_router.include_router(approvals_router)
api_router.include_router(gr_router)
api_router.include_router(ap_router)
api_router.include_router(acn_router)
api_router.include_router(dpi_router)
api_router.include_router(bla_router)
