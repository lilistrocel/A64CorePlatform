"""Finance Module - API v1 Routes"""

from fastapi import APIRouter
from .pnl import router as pnl_router

api_router = APIRouter()

api_router.include_router(pnl_router, prefix="/pnl", tags=["finance-pnl"])
