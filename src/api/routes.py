"""
API Routes Module

Consolidates all API routers and endpoints
"""

from fastapi import APIRouter
from .v1 import auth, users, admin, modules, dashboard, organizations, divisions, industries

# Import AI analytics routes
from src.modules.ai_analytics.api.v1 import chat as ai_chat

# Import AI assistant routes (T-008 — Claude Sonnet 4.6 replacement for Gemini agents)
from src.modules.ai_assistant.api.v1 import assistant as ai_assistant

# Initialize main API router
api_router = APIRouter()

# Include v1 routes
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(admin.router, tags=["Admin"])  # Admin routes have /admin prefix in router
api_router.include_router(modules.router, tags=["Module Management"])  # Module routes have /modules prefix in router
api_router.include_router(dashboard.router, tags=["Dashboard"])  # Dashboard routes have /dashboard prefix in router

# Include multi-industry framework routes
api_router.include_router(organizations.router, tags=["Organizations"])  # /organizations prefix in router
api_router.include_router(divisions.router, tags=["Divisions"])          # /divisions prefix in router
api_router.include_router(industries.router, tags=["Industries"])        # /industries prefix in router

# Include AI analytics routes
api_router.include_router(ai_chat.router, tags=["AI Analytics"])  # AI routes at /api/v1/ai/*

# Include AI assistant routes (T-008 — Claude Sonnet 4.6 replacement for Gemini agents)
# Endpoints at /api/v1/ai/assistant/*
api_router.include_router(ai_assistant.router, prefix="/ai", tags=["AI Assistant"])

# Include attachment routes (T-053 — reusable document attachment infrastructure)
# Endpoints at /api/v1/attachments/{doc_type}/{doc_id} and /api/v1/attachments/file/{file_id}
from src.modules.attachments.api.v1.attachments import router as attachments_router
api_router.include_router(attachments_router, prefix="/attachments", tags=["Attachments"])

# Note: Farm management routes (/api/v1/farm/*) are handled by the farm_manager plugin module
# which is dynamically loaded at startup via the plugin system (src/core/plugin_system/)
