"""
SenseHub Proxy API Routes

Proxy endpoints for SenseHub edge computing instances.
All endpoints are nested under /farms/{farm_id}/blocks/{block_id}/sensehub.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import Any, Dict, List, Optional
from uuid import UUID
import httpx
import logging

from ...middleware.auth import get_current_active_user, CurrentUser
from ...services.sensehub import SenseHubConnectionService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/farms/{farm_id}/blocks/{block_id}/sensehub",
    tags=["sensehub"],
)


# =============================================================================
# Error handling helper
# =============================================================================

def _handle_sensehub_error(e: Exception, operation: str) -> None:
    """Convert SenseHub errors to appropriate HTTP responses."""
    if isinstance(e, HTTPException):
        raise e
    if isinstance(e, httpx.ConnectError):
        raise HTTPException(503, f"SenseHub unreachable: {str(e)}")
    if isinstance(e, httpx.TimeoutException):
        raise HTTPException(504, f"SenseHub request timeout during {operation}")
    if isinstance(e, httpx.HTTPStatusError):
        status = e.response.status_code
        if status == 401:
            raise HTTPException(401, "SenseHub authentication failed. Reconnect with valid credentials.")
        raise HTTPException(502, f"SenseHub error ({status}): {e.response.text[:200]}")
    raise HTTPException(502, f"SenseHub {operation} failed: {str(e)}")


# =============================================================================
# Connection Management
# =============================================================================

@router.post("/connect", summary="Connect block to SenseHub instance")
async def connect_sensehub(
    farm_id: UUID,
    block_id: UUID,
    body: Dict[str, Any] = Body(...),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Test connection, authenticate, and store encrypted credentials.

    Body: { "address": str, "port": int, "email": str, "password": str }
    """
    address = body.get("address")
    port = body.get("port", 3000)
    email = body.get("email")
    password = body.get("password")
    mcp_api_key = body.get("mcpApiKey")
    mcp_port = body.get("mcpPort")

    if not address or not email or not password:
        raise HTTPException(400, "address, email, and password are required")

    return await SenseHubConnectionService.connect(
        farm_id=farm_id,
        block_id=block_id,
        address=address,
        port=port,
        email=email,
        password=password,
        mcp_api_key=mcp_api_key,
        mcp_port=mcp_port,
    )


@router.post("/disconnect", summary="Disconnect block from SenseHub")
async def disconnect_sensehub(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Clear stored credentials and mark as disconnected."""
    return await SenseHubConnectionService.disconnect(farm_id, block_id)


@router.get("/status", summary="Get SenseHub connection status")
async def get_sensehub_status(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return connection status, last connected time, and SenseHub health."""
    return await SenseHubConnectionService.get_status(farm_id, block_id)


# =============================================================================
# Dashboard & Equipment
# =============================================================================

@router.get("/dashboard", summary="Get SenseHub dashboard overview")
async def get_sensehub_dashboard(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Build dashboard from individual fast endpoints instead of
    /api/dashboard/overview which returns 17MB+ of chart data.
    """
    import asyncio

    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)

        # Fetch equipment, automations, and alerts in parallel (~0.5s total)
        equip_task = asyncio.create_task(client.get_equipment())
        auto_task = asyncio.create_task(client.get_automations())
        alert_task = asyncio.create_task(client.get_alerts())

        equipment_list, automations_list, alerts_list = await asyncio.gather(
            equip_task, auto_task, alert_task
        )

        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)

        # Build summary counts from the raw lists
        online = sum(1 for e in equipment_list if e.get("status") == "online")
        offline = sum(1 for e in equipment_list if e.get("status") == "offline")
        error_count = sum(1 for e in equipment_list if e.get("status") == "error")

        active_autos = [a for a in automations_list if a.get("enabled")]

        critical = sum(1 for a in alerts_list if a.get("severity") == "critical" and not a.get("acknowledged"))
        warning = sum(1 for a in alerts_list if a.get("severity") == "warning" and not a.get("acknowledged"))
        info = sum(1 for a in alerts_list if a.get("severity") == "info" and not a.get("acknowledged"))
        unack = critical + warning + info

        return {
            "equipment": {
                "total": len(equipment_list),
                "online": online,
                "offline": offline,
                "error": error_count,
            },
            "automations": {
                "total": len(automations_list),
                "active": len(active_autos),
            },
            "alerts": {
                "unacknowledged": unack,
                "critical": critical,
                "warning": warning,
                "info": info,
            },
            "recent_alerts": alerts_list[:10],
            "active_automations": active_autos[:10],
            "equipment_list": equipment_list,
        }
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "dashboard")


@router.get("/equipment", summary="List SenseHub equipment")
async def get_sensehub_equipment(
    farm_id: UUID,
    block_id: UUID,
    status: Optional[str] = Query(None),
    zone: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to GET /api/equipment on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.get_equipment(status=status, zone=zone)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "equipment list")


@router.get(
    "/equipment/{equipment_id}/history",
    summary="Get equipment reading history",
)
async def get_sensehub_equipment_history(
    farm_id: UUID,
    block_id: UUID,
    equipment_id: int,
    from_dt: Optional[str] = Query(None, alias="from"),
    to_dt: Optional[str] = Query(None, alias="to"),
    limit: Optional[int] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to GET /api/equipment/:id/history on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.get_equipment_history(
            equipment_id, from_dt=from_dt, to_dt=to_dt, limit=limit
        )
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "equipment history")


# =============================================================================
# Relay Control
# =============================================================================

@router.post(
    "/equipment/{equipment_id}/relay/control",
    summary="Control a single relay channel",
)
async def control_sensehub_relay(
    farm_id: UUID,
    block_id: UUID,
    equipment_id: int,
    body: Dict[str, Any] = Body(...),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Proxy to POST /api/equipment/:id/relay/control on SenseHub.

    Body: { "channel": int, "state": bool }
    """
    channel = body.get("channel")
    state = body.get("state")
    if channel is None or state is None:
        raise HTTPException(400, "channel and state are required")

    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.control_relay(equipment_id, channel, state)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "relay control")


@router.post(
    "/equipment/{equipment_id}/relay/all",
    summary="Control all relay channels at once",
)
async def control_sensehub_relay_all(
    farm_id: UUID,
    block_id: UUID,
    equipment_id: int,
    body: Dict[str, Any] = Body(...),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Proxy to POST /api/equipment/:id/relay/all on SenseHub.

    Body: { "states": [bool, bool, ...] }
    """
    states = body.get("states")
    if not states:
        raise HTTPException(400, "states array is required")

    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.control_relay_all(equipment_id, states)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "relay bulk control")


# =============================================================================
# Automations
# =============================================================================

@router.get("/automations", summary="List SenseHub automations")
async def get_sensehub_automations(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to GET /api/automations on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.get_automations()
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "automations list")


@router.post("/automations", summary="Create automation on SenseHub")
async def create_sensehub_automation(
    farm_id: UUID,
    block_id: UUID,
    body: Dict[str, Any] = Body(...),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to POST /api/automations on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.create_automation(body)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "create automation")


@router.put(
    "/automations/{automation_id}",
    summary="Update automation on SenseHub",
)
async def update_sensehub_automation(
    farm_id: UUID,
    block_id: UUID,
    automation_id: int,
    body: Dict[str, Any] = Body(...),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to PUT /api/automations/:id on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.update_automation(automation_id, body)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "update automation")


@router.delete(
    "/automations/{automation_id}",
    summary="Delete automation on SenseHub",
)
async def delete_sensehub_automation(
    farm_id: UUID,
    block_id: UUID,
    automation_id: int,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to DELETE /api/automations/:id on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.delete_automation(automation_id)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "delete automation")


@router.post(
    "/automations/{automation_id}/toggle",
    summary="Toggle automation enabled/disabled",
)
async def toggle_sensehub_automation(
    farm_id: UUID,
    block_id: UUID,
    automation_id: int,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to POST /api/automations/:id/toggle on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.toggle_automation(automation_id)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "toggle automation")


@router.post(
    "/automations/{automation_id}/trigger",
    summary="Manually trigger automation",
)
async def trigger_sensehub_automation(
    farm_id: UUID,
    block_id: UUID,
    automation_id: int,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to POST /api/automations/:id/trigger on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.trigger_automation(automation_id)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "trigger automation")


# =============================================================================
# Alerts
# =============================================================================

@router.get("/alerts", summary="List SenseHub alerts")
async def get_sensehub_alerts(
    farm_id: UUID,
    block_id: UUID,
    severity: Optional[str] = Query(None),
    acknowledged: Optional[bool] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to GET /api/alerts on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.get_alerts(severity=severity, acknowledged=acknowledged)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "alerts list")


@router.post(
    "/alerts/{alert_id}/acknowledge",
    summary="Acknowledge a SenseHub alert",
)
async def acknowledge_sensehub_alert(
    farm_id: UUID,
    block_id: UUID,
    alert_id: int,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Proxy to POST /api/alerts/:id/acknowledge on SenseHub."""
    try:
        client = await SenseHubConnectionService.get_client(farm_id, block_id)
        data = await client.acknowledge_alert(alert_id)
        await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)
        return data
    except HTTPException:
        raise
    except Exception as e:
        _handle_sensehub_error(e, "acknowledge alert")
