"""
API Routes Module

Consolidates all API routers and endpoints
"""

from fastapi import APIRouter
from .v1 import auth, users

# Initialize main API router
api_router = APIRouter()

# Include v1 routes
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
