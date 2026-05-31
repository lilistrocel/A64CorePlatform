"""
Sales Module - API v1 Routes

T-200.11 (2026-05-31): Legacy /orders and /returns routes removed.
The frontend now redirects /sales/orders → /sales/orders-v2 and
/sales/returns → /sales/returns-v2. Backend files orders.py and returns.py
have been removed from this router. They remain on disk in case of rollback
but are no longer registered. Use /orders-v2 and /returns-v2 exclusively.
"""

from fastapi import APIRouter
from .dashboard import router as dashboard_router
from .config import router as config_router
from .quotes import router as quotes_router
from .sales_orders import router as sales_orders_v2_router
from .deliveries import router as deliveries_router
from .ar_invoices import router as ar_invoices_router
from .customer_receipts import router as customer_receipts_router
from .return_requests import router as return_requests_router
from .returns_v2 import router as returns_v2_router
from .ar_credit_notes import router as ar_credit_notes_router
# T-200.2: Sales reports (AR Aging)
from .reports import router as reports_router

api_router = APIRouter()

# Include route modules - config first for /farming-years to not conflict with /{id} routes
# Reason: sales-side purchase orders were removed (T-070.0) — the dedicated
# purchasing module at src/modules/purchasing/ owns POs now (/api/v1/purchasing/po).
api_router.include_router(config_router, prefix="", tags=["sales-config"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["sales-dashboard"])
# T-100.6: Sales Quote — Wave 3 Phase 2, first document in quote-to-cash chain
api_router.include_router(quotes_router, prefix="/quotes", tags=["Sales — Quotes"])
# T-100.7: Sales Order (SO) — Wave 3 Phase 2, second document in quote-to-cash chain.
# Prefix is /orders-v2 to avoid colliding with the legacy /orders route (sales_orders collection).
# Rename to /orders when the legacy module is deprecated (see T-100.7.2 follow-up).
api_router.include_router(sales_orders_v2_router, prefix="/orders-v2", tags=["Sales — Orders v2"])
# T-100.8: Delivery Note (DN) — Wave 3 Phase 2, third document in quote-to-cash chain.
# Emits delivery_posted event to finance outbox on DRAFT → OPEN (finance posts COGS JE in T-100.8.1).
api_router.include_router(deliveries_router, prefix="/deliveries", tags=["Sales — Deliveries"])
# T-100.9a: AR Invoice (ARI) — Wave 3 Phase 2, fourth document in quote-to-cash chain.
# Revenue-recognition document. Emits sales_invoice_posted event to finance outbox on
# DRAFT → OPEN (finance posts DR AR / CR Revenue / CR Output VAT JE in T-100.9b).
api_router.include_router(ar_invoices_router, prefix="/ar-invoices", tags=["Sales — AR Invoices"])
# T-100.10: Customer Receipt (IPAY) — Wave 3 Phase 2, fifth document in quote-to-cash chain.
# Records customer payment against one or more AR Invoices.
# Emits customer_payment_received event to finance outbox on DRAFT → OPEN
# (finance posts DR Bank / CR AR JE in T-100.10.1).
api_router.include_router(
    customer_receipts_router,
    prefix="/customer-receipts",
    tags=["Sales — Customer Receipts"],
)
# T-100.11: Returns flow — Wave 3 Phase 2 finale.
# Return Request (RR): RMA authorisation, commitment doc, no GL impact.
api_router.include_router(
    return_requests_router,
    prefix="/return-requests",
    tags=["Sales — Return Requests"],
)
# Return Note (RTN): physical goods return, restores inventory.
# Emits return_posted event to finance outbox on DRAFT → OPEN
# (finance posts DR Inventory / CR COGS JE).
# Prefix is /returns-v2 to avoid collision with legacy /returns route.
api_router.include_router(
    returns_v2_router,
    prefix="/returns-v2",
    tags=["Sales — Returns v2"],
)
# AR Credit Note (ARC): financial reversal of AR Invoice.
# Emits credit_note_posted event to finance outbox on DRAFT → OPEN
# (finance posts DR Revenue / DR Output VAT / CR AR JE).
api_router.include_router(
    ar_credit_notes_router,
    prefix="/ar-credit-notes",
    tags=["Sales — AR Credit Notes"],
)
# T-200.2: Sales Reports — AR Aging
# Prefix /reports gives full path /api/v1/sales/reports/ar-aging
api_router.include_router(
    reports_router,
    prefix="/reports",
    tags=["Sales — Reports"],
)
