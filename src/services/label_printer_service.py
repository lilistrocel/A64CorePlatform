"""
Brother QL-800 Label Printer Client (T-925)

Talks to a real Brother QL-800's network print API (contract published at
that host's own ``/agent.md``, e.g. ``http://<printer-host>:8765/agent.md``
on the reference deployment's Tailscale network). Configuration is fully
per-deployment — resolved through
``deployment_settings_service.get_value`` (env -> db -> unset), exactly like
``PUBLIC_BASE_URL`` in ``src/modules/genetics/api/v1/labels.py`` — so the
env-lock precedence documented in that service's module docstring applies
here unchanged.

Security: the API key is read fresh on every call via
``deployment_settings_service`` and is sent ONLY as the ``X-API-Key`` header
of a request to ``LABEL_PRINTER_BASE_URL``. It is never logged (log lines
below name only the exception type, never its message, since httpx error
messages can echo request context), never included in any exception detail
that reaches the client, and never echoed back in a response.

Printer contract highlights this module honours (see the real ``/agent.md``
for the full text):
  - Every endpoint except ``/health`` requires the ``X-API-Key`` header.
  - ``/health`` must be checked before printing — a disconnected printer
    accepts jobs into the spooler and silently discards them, so a bare
    "the HTTP POST succeeded" is not sufficient evidence a label came out.
  - ``POST /v1/print/pdf`` is multipart: ``file``, plus optional ``pages``,
    ``copies`` (max 50), ``cut``, ``label``, ``threshold``, ``dither``.
  - Errors: 401 bad key, 422 bad input (read ``error``), 502 printer/spooler
    problem. A 502 is retried at most once, per the contract's own
    instruction not to retry a 502 more than once — something physical is
    wrong beyond that.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException, status

from .deployment_settings_service import get_value as get_deployment_setting_value

logger = logging.getLogger(__name__)

# Printing is slow (mechanical feed + cut); health checks must be fast so a
# dead printer doesn't stall the caller.
_HEALTH_TIMEOUT_SECONDS = 5.0
_PRINT_TIMEOUT_SECONDS = 30.0

# Matches the printer's own hard cap (see /agent.md's `copies` field) —
# enforced here too so a misconfigured caller gets one clear error instead
# of relying on the printer to reject it.
MAX_COPIES = 50

_READY_STATUS = ["ready"]


@dataclass
class PrinterHealthResult:
    """Structured, never-raises result of a printer health check.

    `configured` is False when the deployment has no printer set up at all
    (enabled/base URL/API key not all present) — callers must check this
    before treating `ok=False` as "the printer is broken" rather than "there
    is no printer".
    """

    configured: bool
    ok: bool
    status: List[str] = field(default_factory=list)
    printer: Optional[str] = None
    jobsQueued: Optional[int] = None


@dataclass
class PrintResult:
    """Result of a successful print job, mirroring the printer's own
    ``POST /v1/print/pdf`` response shape (camelCased for this API)."""

    ok: bool
    jobId: Optional[int]
    pagesPrinted: Optional[int]
    printer: Optional[str]
    label: str


async def _resolve_config() -> Dict[str, Any]:
    """Resolve the three managed keys through deployment_settings_service.

    Reads fresh on every call (the service's own 30s in-process cache keeps
    this cheap) rather than caching here separately, so a super_admin
    toggling the printer off/on or rotating the key takes effect within the
    same short window every other deployment setting does.
    """
    enabled = bool(await get_deployment_setting_value("LABEL_PRINTER_ENABLED"))
    base_url = (await get_deployment_setting_value("LABEL_PRINTER_BASE_URL")) or ""
    api_key = (await get_deployment_setting_value("LABEL_PRINTER_API_KEY")) or ""
    return {
        "enabled": enabled,
        "base_url": base_url.rstrip("/"),
        "api_key": api_key,
    }


def _is_configured(cfg: Dict[str, Any]) -> bool:
    return bool(cfg["enabled"] and cfg["base_url"] and cfg["api_key"])


async def is_configured() -> bool:
    """Whether this deployment has a usable printer configuration.

    True only when enabled + base URL + API key are all present. Used by
    callers that want to short-circuit before even attempting a health
    check (e.g. to decide whether to show a "Print" action at all).
    """
    return _is_configured(await _resolve_config())


async def health() -> PrinterHealthResult:
    """
    Check the configured printer's live status.

    Never raises — every failure mode (unconfigured, unreachable, timeout,
    non-2xx, unparseable body) collapses to a structured "not ok" result so
    callers (in particular ``GET /genetics/printer/health``) can always
    return HTTP 200 and let the UI render actual state.

    Returns:
        PrinterHealthResult. `ok` is True only when the printer reported
        `ok: true` AND `printer_status.status == ["ready"]` — matching the
        printer's own `/agent.md`: "`[\"offline\"]`, `[\"paper_out\"]` or
        `[\"error\"]` mean stop and tell the user."
    """
    cfg = await _resolve_config()
    if not _is_configured(cfg):
        return PrinterHealthResult(configured=False, ok=False)

    url = f"{cfg['base_url']}/health"
    try:
        async with httpx.AsyncClient(timeout=_HEALTH_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Reason: log only the exception TYPE. httpx exception messages can
        # include the request URL, and while the URL itself is not the
        # secret, staying deliberately conservative here means a future
        # refactor that starts logging exception args can never leak the
        # X-API-Key (which this call does not even send, but /v1/print/pdf
        # below does, from the same helper's sibling).
        logger.warning(
            "Label printer health check failed (%s): %s", url, type(exc).__name__
        )
        return PrinterHealthResult(configured=True, ok=False, status=["unreachable"])

    printer_status = body.get("printer_status") or {}
    status_list = list(printer_status.get("status") or [])
    return PrinterHealthResult(
        configured=True,
        ok=bool(body.get("ok")) and status_list == _READY_STATUS,
        status=status_list,
        printer=body.get("printer"),
        jobsQueued=printer_status.get("jobs_queued"),
    )


def _safe_error_detail(response: httpx.Response, fallback: str) -> str:
    """Best-effort extraction of the printer's own `error`/`detail` field.

    Never lets a malformed body raise past this — falls back to a generic
    message rather than surfacing raw response text (which could, in
    principle, echo request data back).
    """
    try:
        body = response.json()
    except ValueError:
        return fallback
    if isinstance(body, dict):
        return str(body.get("error") or body.get("detail") or fallback)
    return fallback


async def print_pdf(
    pdf_bytes: bytes,
    *,
    label: str,
    copies: int = 1,
    filename: str = "labels.pdf",
) -> PrintResult:
    """
    Send a print-ready PDF to the configured Brother QL-800.

    Preflights `/health` first (per the printer's own `/agent.md`: a
    disconnected printer accepts jobs into the spooler and silently
    discards them) and refuses to print unless the printer reports
    `["ready"]`. Any other status is surfaced verbatim in the raised
    exception so the caller can tell "offline" from "paper_out" from
    "error".

    Args:
        pdf_bytes: The rendered label PDF, byte-identical to what
            `GET /{accession_id}/labels` would return for the same range.
        label: Printer media identifier — "62", "29x90", or "17x87".
        copies: Repeats the whole job; 1-`MAX_COPIES`.
        filename: Sent as the multipart filename only; cosmetic.

    Returns:
        PrintResult on success.

    Raises:
        HTTPException:
            409 if the printer is not configured for this deployment.
            422 if `copies` is out of range, or the printer rejected the
                request as malformed (its own 422, message passed through).
            502 if the printer is not ready, the configured API key was
                rejected, the printer/spooler reported a problem, or the
                printer could not be reached at all.
    """
    cfg = await _resolve_config()
    if not _is_configured(cfg):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Label printer is not configured for this deployment.",
        )

    if not (1 <= copies <= MAX_COPIES):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"copies must be between 1 and {MAX_COPIES}, got {copies}.",
        )

    health_result = await health()
    if not health_result.ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"Label printer is not ready (status={health_result.status or ['unreachable']}). "
                "Check the printer before retrying."
            ),
        )

    url = f"{cfg['base_url']}/v1/print/pdf"
    headers = {"X-API-Key": cfg["api_key"]}
    data = {"copies": str(copies), "label": label}

    # Per /agent.md: "Do not retry a 502 more than once; something physical
    # is wrong." Two attempts total = at most one retry.
    max_attempts = 2
    for attempt in range(1, max_attempts + 1):
        files = {"file": (filename, pdf_bytes, "application/pdf")}
        try:
            async with httpx.AsyncClient(timeout=_PRINT_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    url, headers=headers, data=data, files=files
                )
        except httpx.HTTPError as exc:
            logger.warning(
                "Label printer print request failed (attempt %d/%d, %s): %s",
                attempt,
                max_attempts,
                url,
                type(exc).__name__,
            )
            if attempt >= max_attempts:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not reach the configured label printer.",
                ) from exc
            continue

        if response.status_code == 401:
            # Reason: the printer rejected OUR configured key — this is a
            # deployment configuration problem, not the calling user's
            # fault, so it is a 502 (upstream misconfigured) rather than a
            # 401 that would wrongly imply the caller's own credentials are
            # bad. The key itself never appears in the detail.
            logger.warning("Label printer rejected the configured API key (%s).", url)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "The label printer rejected the API key configured for this "
                    "deployment. Ask an administrator to check "
                    "LABEL_PRINTER_API_KEY in Settings."
                ),
            )

        if response.status_code == 422:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=_safe_error_detail(
                    response, "The label printer rejected the print request."
                ),
            )

        if response.status_code == 502:
            if attempt >= max_attempts:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=_safe_error_detail(
                        response,
                        "Printer/spooler problem reported twice; not retrying again.",
                    ),
                )
            logger.warning(
                "Label printer reported a 502 (attempt %d/%d, %s); retrying once.",
                attempt,
                max_attempts,
                url,
            )
            continue

        if response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=_safe_error_detail(
                    response, "Unexpected error from the label printer."
                ),
            )

        try:
            body = response.json()
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Label printer returned an unparseable response.",
            ) from exc

        return PrintResult(
            ok=bool(body.get("ok")),
            jobId=body.get("job_id"),
            pagesPrinted=body.get("pages_printed"),
            printer=body.get("printer"),
            label=str(body.get("label", label)),
        )

    # Unreachable in practice (the loop above always returns or raises),
    # kept only so this function has an explicit exhaustive return path.
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Could not reach the configured label printer.",
    )
