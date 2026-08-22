"""
Genetics Repo Module - Label Printer Health (T-925)

Exposes the configured Brother QL-800's live reachability/status so the
frontend can render actual state (not configured / offline / paper out /
ready) before a user attempts to print, and can poll it cheaply. Deliberately
thin — all resolution and error-swallowing live in
``src.services.label_printer_service.health()``, which never raises; this
route exists only to shape that result into the API response.

This endpoint is intentionally always HTTP 200: an unreachable or
unconfigured printer is DATA for the UI to render, not a server error. See
``label_printer_service.health()``'s docstring for why it never raises.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from src.services import label_printer_service

from ...middleware.auth import CurrentUser, require_view
from ...utils.responses import SuccessResponse

router = APIRouter()


class PrinterHealthResponse(BaseModel):
    """Response shape for `GET /genetics/printer/health`.

    Every field is populated even when the printer is unconfigured or
    unreachable — `configured`/`ok` are what the caller should branch on,
    not the HTTP status code (which is always 200 here).
    """

    configured: bool = Field(
        ...,
        description="Whether LABEL_PRINTER_ENABLED + base URL + API key are all set",
    )
    ok: bool = Field(
        ...,
        description="True only when the printer reported ok AND status == ['ready']",
    )
    status: List[str] = Field(
        default_factory=list,
        description="Printer's own status list, e.g. ['ready'], ['offline'], ['paper_out'], ['unreachable']",
    )
    printer: Optional[str] = Field(None, description="Printer model name, when known")
    jobsQueued: Optional[int] = Field(
        None, description="Live spooler queue depth, when known"
    )


@router.get(
    "/health",
    response_model=SuccessResponse[PrinterHealthResponse],
    summary="Check the configured label printer's live status",
    description=(
        "Always returns HTTP 200, including when the printer is "
        "unconfigured or unreachable — 'configured' and 'ok' carry that "
        "state so the UI can render it rather than handling an error."
    ),
)
async def get_printer_health(
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[PrinterHealthResponse]:
    """
    GET /api/v1/genetics/printer/health

    **Authorization:** genetics.view (any authenticated bench-or-above role).

    **Returns:**
    - 200 always, wrapped in the module's standard `{"data": ...}` envelope
      (`SuccessResponse`, matching every other genetics GET route — see
      `utils/responses.py`). `configured=false` means this deployment has
      no printer set up (Settings -> Deployment). `configured=true,
      ok=false` means a printer is configured but not currently ready to
      print — check `status` for why (`['offline']`, `['paper_out']`,
      `['error']`, `['unreachable']`).
    """
    result = await label_printer_service.health()
    return SuccessResponse(
        data=PrinterHealthResponse(
            configured=result.configured,
            ok=result.ok,
            status=result.status,
            printer=result.printer,
            jobsQueued=result.jobsQueued,
        )
    )
