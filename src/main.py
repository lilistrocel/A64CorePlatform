"""
Main FastAPI Application Entry Point

This module initializes and configures the FastAPI application,
sets up middleware, routes, and error handlers.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import logging
from typing import Dict, Any
from pathlib import Path

from .api import health
from .api.routes import api_router
from .config.settings import settings
from .services.database import mongodb
from .services.port_manager import init_port_manager, get_port_manager
from .services.module_manager import module_manager
from .core.plugin_system import get_plugin_manager
from .core.cache import get_redis_cache, close_redis_cache
from .core.logging_config import setup_logging
from .middleware.rate_limit import RateLimitMiddleware
from .middleware.timing import TimingMiddlewareWithCollector
from .middleware.division_context import DivisionContextMiddleware
from .utils.security import hash_password
from .models.user import UserRole

# Configure structured logging (JSON in production, text in development)
setup_logging(log_level=settings.LOG_LEVEL, environment=settings.ENVIRONMENT)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="A64 Core Platform API Hub",
    description="Central API Hub for A64 Core Platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS Middleware - Restricted to specific methods and headers
# Note: Middleware is applied in reverse order (last added = first executed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With", "X-Division-Id", "X-Organization-Id"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

# Response Time Monitoring Middleware - Applied first (outermost)
# Tracks request timing, adds X-Response-Time header, alerts for slow requests (>1s)
app.add_middleware(TimingMiddlewareWithCollector, slow_threshold_ms=1000, skip_health_logging=True)

# Rate Limiting Middleware - Applied after CORS
# Limits vary by role: Guest=10, User=100, Moderator=200, Admin=500, Super Admin=1000 req/min
app.add_middleware(RateLimitMiddleware)

# Division Context Middleware - Reads X-Division-Id header and sets ContextVar
# Applied after rate limiting so division scoping is available to all request handlers
app.add_middleware(DivisionContextMiddleware)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Global exception handler for unhandled exceptions

    Args:
        request: The incoming request
        exc: The exception that was raised

    Returns:
        JSONResponse with error details
    """
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else "An unexpected error occurred"
        }
    )

# Mount static files for admin interface
public_dir = Path(__file__).parent.parent / "public"
if public_dir.exists():
    app.mount("/admin", StaticFiles(directory=str(public_dir / "admin"), html=True), name="admin")
    logger.info(f"Admin interface mounted at /admin")

# Include routers
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(api_router, prefix="/api/v1")

# Root endpoint
@app.get("/", tags=["Root"])
async def root() -> Dict[str, Any]:
    """
    Root endpoint - API information

    Returns:
        API information and available endpoints
    """
    return {
        "name": "A64 Core Platform API Hub",
        "version": "1.0.0",
        "status": "online",
        "docs": "/api/docs",
        "health": "/api/health"
    }

async def seed_admin() -> None:
    """Create default super_admin, organization, and division if none exist."""
    import uuid
    from datetime import datetime

    db = mongodb.get_database()

    # Check if any super_admin exists
    existing_admin = await db.users.find_one({"role": UserRole.SUPER_ADMIN.value})
    if existing_admin:
        logger.info(f"Super admin already exists: {existing_admin['email']}")
        return

    admin_email = settings.ADMIN_EMAIL
    admin_password = settings.ADMIN_PASSWORD

    if not admin_email or not admin_password:
        logger.warning("ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed")
        return

    # Check if the email is already registered (as a non-admin)
    existing_user = await db.users.find_one({"email": admin_email})
    if existing_user:
        # Promote existing user to super_admin
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"role": UserRole.SUPER_ADMIN.value, "updatedAt": datetime.utcnow()}}
        )
        logger.info(f"Promoted existing user to super_admin: {admin_email}")
        return

    now = datetime.utcnow()
    org_id = str(uuid.uuid4())
    division_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    try:
        # Seed default organization
        existing_org = await db.organizations.find_one({})
        if not existing_org:
            org_doc = {
                "organizationId": org_id,
                "name": "Default Organization",
                "slug": "default",
                "industries": ["vegetable_fruits"],
                "logoUrl": None,
                "isActive": True,
                "createdAt": now,
                "updatedAt": now,
            }
            await db.organizations.insert_one(org_doc)
            logger.info(f"Created default organization: {org_id}")
        else:
            org_id = existing_org["organizationId"]

        # Seed default division
        existing_div = await db.divisions.find_one({})
        if not existing_div:
            div_doc = {
                "divisionId": division_id,
                "organizationId": org_id,
                "name": "Main Division",
                "divisionCode": "MAIN-01",
                "industryType": "vegetable_fruits",
                "description": "Default division",
                "settings": {},
                "isActive": True,
                "createdAt": now,
                "updatedAt": now,
            }
            await db.divisions.insert_one(div_doc)
            logger.info(f"Created default division: {division_id}")

        # Create super_admin user linked to the organization
        user_doc = {
            "userId": user_id,
            "email": admin_email,
            "passwordHash": hash_password(admin_password),
            "firstName": "Super",
            "lastName": "Admin",
            "role": UserRole.SUPER_ADMIN.value,
            "isActive": True,
            "isEmailVerified": True,
            "mfaEnabled": False,
            "mfaSetupRequired": False,
            "phone": None,
            "avatar": None,
            "timezone": None,
            "locale": None,
            "organizationId": org_id,
            "lastLoginAt": None,
            "createdAt": now,
            "updatedAt": now,
            "deletedAt": None,
            "metadata": {}
        }
        await db.users.insert_one(user_doc)
        logger.info(f"Created default super_admin account: {admin_email}")
    except Exception:
        # Race condition with multiple workers — another worker already created it
        pass


# Startup event
@app.on_event("startup")
async def startup_event() -> None:
    """Initialize services on application startup"""
    logger.info("Starting A64 Core Platform API Hub...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Debug mode: {settings.DEBUG}")

    # Security warnings for production readiness
    if settings.SECRET_KEY == "dev_secret_key_change_in_production":
        logger.warning("SECURITY: Using default SECRET_KEY - set a strong key via environment variable for production!")
    if settings.DEBUG and settings.ENVIRONMENT == "production":
        logger.warning("SECURITY: DEBUG mode is enabled in production - this exposes sensitive error details!")
    if settings.ENVIRONMENT == "production" and "localhost" in str(settings.ALLOWED_ORIGINS):
        logger.warning("SECURITY: localhost origins allowed in production CORS settings")

    # Connect to MongoDB
    try:
        await mongodb.connect()
        logger.info("MongoDB connected successfully")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")

    # Connect to Redis Cache
    try:
        cache = await get_redis_cache()
        if cache.is_available:
            logger.info("Redis cache connected successfully")
        else:
            logger.warning("Redis cache unavailable - caching disabled, using direct DB queries")
    except Exception as e:
        logger.warning(f"Redis cache connection failed: {e}. Caching disabled.")

    # Initialize Port Manager
    try:
        await init_port_manager(mongodb.get_database())
        logger.info("Port Manager initialized successfully")

        # Inject Port Manager into Module Manager
        module_manager.port_manager = get_port_manager()
        logger.info("Port Manager injected into Module Manager")
    except Exception as e:
        logger.error(f"Failed to initialize Port Manager: {e}")

    # Seed super_admin account if none exists
    try:
        await seed_admin()
    except Exception as e:
        logger.error(f"Failed to seed admin account: {e}")

    # Load plugin modules
    try:
        plugin_manager = get_plugin_manager()
        # Load all core modules (farm_manager, etc.)
        loaded_modules = await plugin_manager.load_all_modules(app)
        logger.info(f"Loaded {len(loaded_modules)} plugin modules: {list(loaded_modules.keys())}")
    except Exception as e:
        logger.error(f"Failed to load plugin modules: {e}")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Cleanup on application shutdown"""
    logger.info("Shutting down A64 Core Platform API Hub...")

    # Disconnect from MongoDB
    await mongodb.disconnect()
    logger.info("Database connection closed")

    # Disconnect from Redis Cache
    await close_redis_cache()
    logger.info("Redis cache connection closed")

# Run the application
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )
