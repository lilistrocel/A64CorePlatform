"""
API Routes Module

Consolidates all API routers and endpoints
"""

from fastapi import APIRouter
from .v1 import auth, users, admin, modules

# Initialize main API router
api_router = APIRouter()

# Include v1 routes
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(admin.router, tags=["Admin"])  # Admin routes have /admin prefix in router
api_router.include_router(modules.router, tags=["Module Management"])  # Module routes have /modules prefix in router
