"""
Genetics Repo Module - Dashboard API Routes
"""

import logging

from fastapi import APIRouter, Depends

from ...services.dashboard_service import DashboardService, GeneticsDashboard
from ...utils.responses import SuccessResponse

from ...middleware.auth import (
    CurrentUser,
    require_permission,
    require_view,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=SuccessResponse[GeneticsDashboard],
    summary="Genetics repo summary",
    description=(
        "Counters for the repo home: lines by domain, live material, recent "
        "activity, novel traits awaiting promotion, and the senescence watch "
        "list (active accessions at G5 or deeper)."
    ),
)
async def get_dashboard(
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[GeneticsDashboard]:
    summary = await DashboardService.get_dashboard()
    return SuccessResponse(data=summary)
