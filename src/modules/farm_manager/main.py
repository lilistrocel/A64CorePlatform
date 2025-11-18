"""
Farm Management Module - Main Application

FastAPI application for the farm management module.
Integrates with A64Core for authentication and data storage.
"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging

from .config.settings import settings
from .services.database import farm_db
from .api import api_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan events

    Startup:
    - Connect to MongoDB
    - Create indexes

    Shutdown:
    - Disconnect from MongoDB
    """
    # Startup
    logger.info(f"[Farm Module] Starting {settings.MODULE_NAME} v{settings.MODULE_VERSION}")

    try:
        await farm_db.connect()
        logger.info("[Farm Module] Database connected successfully")
    except Exception as e:
        logger.error(f"[Farm Module] Failed to connect to database: {e}")
        raise

    yield

    # Shutdown
    logger.info("[Farm Module] Shutting down")
    await farm_db.disconnect()
    logger.info("[Farm Module] Database disconnected")


# Create FastAPI application
app = FastAPI(
    title="Farm Management Module",
    description="Comprehensive farm management system for agricultural operations",
    version=settings.MODULE_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS configuration
# Parse comma-separated CORS origins from environment variable
cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",")]
logger.info(f"[Farm Module] CORS allowed origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.MODULE_VERSION.startswith("0.") else "An error occurred"
        }
    )


# Health check endpoint
@app.get("/health", tags=["health"])
async def health_check():
    """
    Health check endpoint

    Returns:
        Health status of the farm module
    """
    db_healthy = await farm_db.health_check()

    return {
        "status": "healthy" if db_healthy else "unhealthy",
        "module": settings.MODULE_NAME,
        "version": settings.MODULE_VERSION,
        "database": "connected" if db_healthy else "disconnected"
    }


# Include API routes
app.include_router(
    api_router,
    prefix=settings.API_PREFIX
)


# Root endpoint
@app.get("/", tags=["root"])
async def root():
    """
    Root endpoint

    Returns:
        Module information
    """
    return {
        "module": settings.MODULE_NAME,
        "version": settings.MODULE_VERSION,
        "description": "Farm Management Module - Comprehensive agricultural operations management",
        "docs": "/docs",
        "health": "/health",
        "api": settings.API_PREFIX
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
