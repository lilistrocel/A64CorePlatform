"""
Finance Service — FastAPI Application Entry Point

Standalone microservice for the A64 Core Platform finance module.
Runs on port 8001, proxied via Nginx at /api/v1/finance/*.

No imports from the main A64 app (src/) — this is a sibling service.
JWT tokens issued by the main app are accepted using the shared SECRET_KEY
environment variable (no MongoDB round-trip required).
"""

import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import accounts, company, cost_centers, customer_ext, events, health, master_data, periods, tax_codes, vendors
from .config import settings
from .middleware.error_handler import global_exception_handler
from .middleware.timing import TimingMiddleware

# Configure basic logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize FastAPI application
app = FastAPI(
    title="A64 Finance Service",
    description=(
        "Week 1 scaffold: master data CRUD for company codes, GL accounts, "
        "fiscal periods, tax codes, cost centres, vendors, and customer extensions. "
        "No posting engine yet — that arrives in Week 3."
    ),
    version="0.1.0",
    docs_url="/api/v1/finance/docs",
    redoc_url="/api/v1/finance/redoc",
    openapi_url="/api/v1/finance/openapi.json",
)

# ---- Middleware ----

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin"],
)

app.add_middleware(TimingMiddleware)

# ---- Global exception handler ----
app.add_exception_handler(Exception, global_exception_handler)

# ---- Routers ----
_PREFIX = "/api/v1/finance"

app.include_router(health.router, prefix=_PREFIX)
app.include_router(company.router, prefix=_PREFIX)
app.include_router(accounts.router, prefix=_PREFIX)
app.include_router(periods.router, prefix=_PREFIX)
app.include_router(tax_codes.router, prefix=_PREFIX)
app.include_router(cost_centers.router, prefix=_PREFIX)
app.include_router(vendors.router, prefix=_PREFIX)
app.include_router(customer_ext.router, prefix=_PREFIX)
# Phase 1A: Master data extension endpoints (vendor_finance_ext, purchase_item_finance_ext, approval_rules)
app.include_router(master_data.router, prefix=_PREFIX)
# Week 3: Outbox bridge ingest endpoint (service-to-service, X-Service-Secret auth)
app.include_router(events.router, prefix=_PREFIX)


# ---- Startup / Shutdown ----

@app.on_event("startup")
async def startup_event() -> None:
    """Log startup info and warn if using default secret."""
    logger.info("Finance service starting — environment: %s", settings.ENVIRONMENT)
    if settings.SECRET_KEY == "dev_secret_key_change_in_production":
        logger.warning(
            "SECURITY: Using default SECRET_KEY. "
            "Set a strong value via environment variable for production."
        )


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Dispose SQLAlchemy connection pool on shutdown."""
    from .db.session import engine

    await engine.dispose()
    logger.info("Finance service stopped — DB pool disposed.")


# ---- Entry point ----

if __name__ == "__main__":
    uvicorn.run(
        "finance.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
