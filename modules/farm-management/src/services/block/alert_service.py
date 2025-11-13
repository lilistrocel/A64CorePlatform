"""
Alert Service - Business Logic Layer

Handles business logic for alert management and block status integration.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException
import logging

from ...models.alert import (
    Alert, AlertCreate, AlertResolve,
    AlertStatus, AlertSeverity
)
from ...models.block import BlockStatus
from .alert_repository import AlertRepository
from .block_repository_new import BlockRepository

logger = logging.getLogger(__name__)


class AlertService:
    """Service for Alert business logic"""

    @staticmethod
    async def create_alert(
        alert_data: AlertCreate,
        user_id: UUID,
        user_email: str,
        change_block_status: bool = True
    ) -> Alert:
        """
        Create a new alert and optionally change block status to ALERT

        Args:
            alert_data: Alert creation data
            user_id: User creating the alert
            user_email: User email
            change_block_status: If True, changes block status to ALERT (default: True)
        """
        # Verify block exists
        block = await BlockRepository.get_by_id(alert_data.blockId)
        if not block:
            raise HTTPException(404, f"Block not found: {alert_data.blockId}")

        # Create alert
        alert = await AlertRepository.create(alert_data, user_id, user_email)

        # Change block status to ALERT if requested and not already in alert status
        if change_block_status and block.state != BlockStatus.ALERT:
            await BlockRepository.update_status(
                alert_data.blockId,
                BlockStatus.ALERT,
                user_id,
                user_email,
                notes=f"Alert created: {alert_data.title}"
            )

            logger.info(
                f"[Alert Service] Changed block {alert_data.blockId} status to ALERT "
                f"due to new alert {alert.alertId}"
            )

        logger.info(
            f"[Alert Service] Created alert {alert.alertId} for block {alert_data.blockId} "
            f"(severity: {alert_data.severity.value})"
        )

        return alert

    @staticmethod
    async def get_alert(alert_id: UUID) -> Alert:
        """Get alert by ID"""
        alert = await AlertRepository.get_by_id(alert_id)

        if not alert:
            raise HTTPException(404, f"Alert not found: {alert_id}")

        return alert

    @staticmethod
    async def list_alerts_by_block(
        block_id: UUID,
        page: int = 1,
        per_page: int = 20,
        status: Optional[AlertStatus] = None,
        severity: Optional[AlertSeverity] = None
    ) -> Tuple[List[Alert], int, int]:
        """List alerts for a block with pagination and filters"""
        skip = (page - 1) * per_page

        alerts, total = await AlertRepository.get_by_block(
            block_id, skip, per_page, status, severity
        )

        total_pages = (total + per_page - 1) // per_page

        return alerts, total, total_pages

    @staticmethod
    async def list_alerts_by_farm(
        farm_id: UUID,
        page: int = 1,
        per_page: int = 20,
        status: Optional[AlertStatus] = None,
        severity: Optional[AlertSeverity] = None
    ) -> Tuple[List[Alert], int, int]:
        """List all alerts for a farm with pagination and filters"""
        skip = (page - 1) * per_page

        alerts, total = await AlertRepository.get_by_farm(
            farm_id, skip, per_page, status, severity
        )

        total_pages = (total + per_page - 1) // per_page

        return alerts, total, total_pages

    @staticmethod
    async def resolve_alert(
        alert_id: UUID,
        resolution_data: AlertResolve,
        user_id: UUID,
        user_email: str,
        restore_block_status: bool = True
    ) -> Alert:
        """
        Resolve an alert and optionally restore block status

        Args:
            alert_id: Alert ID to resolve
            resolution_data: Resolution notes
            user_id: User resolving the alert
            user_email: User email
            restore_block_status: If True, restores block to previousStatus (default: True)
        """
        # Get alert
        alert = await AlertRepository.get_by_id(alert_id)
        if not alert:
            raise HTTPException(404, f"Alert not found: {alert_id}")

        if alert.status != AlertStatus.ACTIVE:
            raise HTTPException(400, f"Alert is not active (current status: {alert.status.value})")

        # Resolve alert
        resolved_alert = await AlertRepository.resolve(
            alert_id,
            user_id,
            user_email,
            resolution_data.resolutionNotes
        )

        # Check if there are other active alerts for the block
        active_alerts = await AlertRepository.get_active_alerts_by_block(alert.blockId)

        # Restore block status if no more active alerts and block is in ALERT status
        if restore_block_status and len(active_alerts) == 0:
            block = await BlockRepository.get_by_id(alert.blockId)

            if block and block.state == BlockStatus.ALERT and block.previousState:
                # Restore to previous status
                await BlockRepository.update_status(
                    alert.blockId,
                    BlockStatus[block.previousState.upper()],
                    user_id,
                    user_email,
                    notes=f"Alert resolved: {alert.title}"
                )

                logger.info(
                    f"[Alert Service] Restored block {alert.blockId} status to {block.previousState} "
                    f"after resolving alert {alert_id}"
                )

        logger.info(f"[Alert Service] Resolved alert {alert_id} for block {alert.blockId}")
        return resolved_alert

    @staticmethod
    async def dismiss_alert(
        alert_id: UUID,
        user_id: UUID,
        user_email: str
    ) -> Alert:
        """Dismiss an alert without resolution notes"""
        alert = await AlertRepository.get_by_id(alert_id)
        if not alert:
            raise HTTPException(404, f"Alert not found: {alert_id}")

        if alert.status != AlertStatus.ACTIVE:
            raise HTTPException(400, f"Alert is not active (current status: {alert.status.value})")

        dismissed_alert = await AlertRepository.dismiss(alert_id, user_id, user_email)

        logger.info(f"[Alert Service] Dismissed alert {alert_id} for block {alert.blockId}")
        return dismissed_alert

    @staticmethod
    async def delete_alert(alert_id: UUID) -> bool:
        """Delete an alert (use with caution)"""
        success = await AlertRepository.delete(alert_id)

        if not success:
            raise HTTPException(404, f"Alert not found: {alert_id}")

        logger.info(f"[Alert Service] Deleted alert {alert_id}")
        return success

    @staticmethod
    async def get_active_alerts_for_block(block_id: UUID) -> List[Alert]:
        """Get all active alerts for a block"""
        return await AlertRepository.get_active_alerts_by_block(block_id)

    @staticmethod
    async def get_alert_summary(block_id: UUID) -> dict:
        """Get comprehensive alert summary for a block"""
        summary = await AlertRepository.get_alert_summary_for_block(block_id)
        counts_by_status = await AlertRepository.get_alerts_count_by_status(block_id)

        return {
            **summary,
            "statusBreakdown": counts_by_status
        }
