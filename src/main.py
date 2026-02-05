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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)

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
