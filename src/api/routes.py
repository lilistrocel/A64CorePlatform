"""
API Routes Module

Consolidates all API routers and endpoints
"""

from fastapi import APIRouter
from .v1 import auth, users, admin, modules, dashboard

# Import AI analytics routes
from src.modules.ai_analytics.api.v1 import chat as ai_chat

# Initialize main API router
api_router = APIRouter()

# Include v1 routes
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(admin.router, tags=["Admin"])  # Admin routes have /admin prefix in router
api_router.include_router(modules.router, tags=["Module Management"])  # Module routes have /modules prefix in router
api_router.include_router(dashboard.router, tags=["Dashboard"])  # Dashboard routes have /dashboard prefix in router

# Include AI analytics routes
api_router.include_router(ai_chat.router, tags=["AI Analytics"])  # AI routes at /api/v1/ai/*

# Note: Farm management routes (/api/v1/farm/*) are handled by the farm_manager plugin module
# which is dynamically loaded at startup via the plugin system (src/core/plugin_system/)
