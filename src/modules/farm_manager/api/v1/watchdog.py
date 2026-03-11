"""
Watchdog API - Configuration, testing, and monitoring endpoints.

All endpoints require admin+ role.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID

from ...middleware.auth import get_current_user, CurrentUser
from ...services.watchdog.models import WatchdogConfigUpdate
from ...services.watchdog.config_service import WatchdogConfigService
from ...services.watchdog.telegram_service import TelegramService
from ...services.watchdog.service import WatchdogService
from ...services.watchdog.scheduler import WatchdogScheduler
from ...services.database import farm_db

router = APIRouter(prefix="/config/watchdog")


def _require_admin(current_user: CurrentUser):
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


@router.get(
    "",
    summary="Get watchdog configuration",
    description="Returns watchdog config with bot token masked.",
)
async def get_watchdog_config(
    current_user: CurrentUser = Depends(get_current_user),
):
    _require_admin(current_user)
    db = farm_db.get_database()
    svc = WatchdogConfigService(db)
    config = await svc.get_config()
    return {"data": svc.mask_token(config)}


@router.put(
    "",
    summary="Update watchdog configuration",
    description="Update watchdog settings. Bot token is encrypted before storage.",
)
async def update_watchdog_config(
    update: WatchdogConfigUpdate,
    current_user: CurrentUser = Depends(get_current_user),
):
    _require_admin(current_user)
    db = farm_db.get_database()
    svc = WatchdogConfigService(db)
    config = await svc.update_config(
        update=update,
        user_id=current_user.userId,
        user_email=current_user.email,
    )
    return {
        "data": svc.mask_token(config),
        "message": "Watchdog configuration updated",
    }


@router.post(
    "/test",
    summary="Send test Telegram message",
    description="Verifies bot token and chat ID by sending a test message.",
)
async def test_watchdog_notification(
    current_user: CurrentUser = Depends(get_current_user),
):
    _require_admin(current_user)
    db = farm_db.get_database()
    config_svc = WatchdogConfigService(db)

    token = await config_svc.get_decrypted_bot_token()
    config = await config_svc.get_config()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bot token is not configured. Save a bot token first.",
        )
    if not config.chatId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chat ID is not configured. Save a chat ID first.",
        )

    telegram = TelegramService(token, config.chatId)
    result = await telegram.test_connection()
    return {"data": result}


@router.get(
    "/status",
    summary="Get scheduler status",
    description="Returns whether the scheduler is running and last run info.",
)
async def get_watchdog_status(
    current_user: CurrentUser = Depends(get_current_user),
):
    _require_admin(current_user)
    try:
        scheduler = WatchdogScheduler.get_instance()
        return {"data": scheduler.get_status()}
    except Exception:
        return {"data": {"isRunning": False, "lastRun": None, "lastResult": None}}


@router.post(
    "/trigger",
    summary="Manually trigger watchdog check",
    description="Runs all enabled checks immediately and sends notifications if issues found.",
)
async def trigger_watchdog_check(
    current_user: CurrentUser = Depends(get_current_user),
):
    _require_admin(current_user)
    db = farm_db.get_database()
    service = WatchdogService(db)
    result = await service.run_check(triggered_by=f"manual:{current_user.email}")
    return {"data": result.model_dump()}


@router.get(
    "/history",
    summary="Get notification history",
    description="Returns recent watchdog notification log entries (last 50).",
)
async def get_watchdog_history(
    limit: int = 50,
    current_user: CurrentUser = Depends(get_current_user),
):
    _require_admin(current_user)
    db = farm_db.get_database()
    service = WatchdogService(db)
    history = await service.get_history(limit=min(limit, 100))
    return {"data": history}
