"""
AI Dashboard Service

MongoDB CRUD operations for AI Dashboard reports and the main
run_inspection orchestration method.
"""

import logging
from datetime import datetime
from typing import List, Optional, Tuple

from .data_collector import DataCollector
from .models import DashboardReport, InspectionRawData
from .report_generator import ReportGenerator
from ..database import farm_db

logger = logging.getLogger(__name__)

COLLECTION_NAME = "ai_dashboard_reports"


class AIDashboardService:
    """
    Orchestrates AI Dashboard inspections and manages report persistence.

    Attributes:
        _db: Motor async MongoDB database instance.
    """

    def __init__(self, db=None) -> None:
        # Accept an injected db or fall back to the shared farm_db connection.
        self._db = db if db is not None else farm_db.get_database()

    # -------------------------------------------------------------------------
    # Index Creation
    # -------------------------------------------------------------------------

    @staticmethod
    async def _create_indexes(db) -> None:
        """
        Create MongoDB indexes for the ai_dashboard_reports collection.

        Creates:
          - Unique index on reportId
          - TTL index on startedAt (30-day retention)
          - Compound index on status + completedAt for fast latest-report queries

        Args:
            db: Motor async MongoDB database instance.

        Returns:
            None
        """
        try:
            collection = db[COLLECTION_NAME]

            # Unique index on reportId for safe upserts
            await collection.create_index("reportId", unique=True)

            # TTL index: auto-expire reports older than 30 days
            await collection.create_index(
                "startedAt",
                expireAfterSeconds=2592000,  # 30 days
                name="ttl_startedAt",
            )

            # Compound index to support get_latest() query
            await collection.create_index(
                [("status", 1), ("completedAt", -1)],
                name="status_completedAt",
            )

            logger.info("[AIDashboardService] MongoDB indexes created")
        except Exception as exc:
            logger.error(f"[AIDashboardService] Index creation error: {exc}")
            # Non-fatal: indexes are optional for correctness

    # -------------------------------------------------------------------------
    # Core Inspection Runner
    # -------------------------------------------------------------------------

    async def run_inspection(
        self, triggered_by: str = "scheduler"
    ) -> DashboardReport:
        """
        Run a full automated farm inspection and store the report.

        Flow:
          1. Create report document with status="collecting".
          2. Run DataCollector.collect_all() in parallel.
          3. Update status to "generating".
          4. Call ReportGenerator.generate_summary() with raw data.
          5. Save completed report (status="completed") or
             save partial report (status="generation_failed") if AI fails.

        Args:
            triggered_by: Label identifying who triggered this run
                          (e.g. "scheduler", "scheduler_startup", "manual").

        Returns:
            The completed (or partially completed) DashboardReport.
        """
        report = DashboardReport(
            status="collecting",
            triggeredBy=triggered_by,
        )

        logger.info(
            f"[AIDashboardService] Starting inspection "
            f"(id={report.reportId}, triggeredBy={triggered_by})"
        )

        # Persist initial record so the report is visible immediately
        await self._save_report(report)

        # --- Phase 1: Data Collection ---
        collector = DataCollector()
        try:
            raw_data: InspectionRawData = await collector.collect_all()
        except Exception as exc:
            logger.error(f"[AIDashboardService] Data collection failed: {exc}")
            report.status = "failed"
            report.error = f"Data collection failed: {str(exc)}"
            report.completedAt = datetime.utcnow()
            report.durationSeconds = (
                report.completedAt - report.startedAt
            ).total_seconds()
            await self._save_report(report)
            return report

        # Attach raw data and transition to generation phase
        report.rawData = raw_data
        report.status = "generating"
        await self._save_report(report)

        # --- Phase 2: AI Summary Generation ---
        generator = ReportGenerator()
        try:
            ai_summary = await generator.generate_summary(raw_data)
            report.aiSummary = ai_summary
            report.status = "completed"
            logger.info(
                f"[AIDashboardService] Inspection completed "
                f"(id={report.reportId})"
            )
        except Exception as exc:
            logger.error(
                f"[AIDashboardService] AI generation failed for "
                f"report {report.reportId}: {exc}"
            )
            report.status = "generation_failed"
            report.error = f"AI generation failed: {str(exc)}"

        report.completedAt = datetime.utcnow()
        report.durationSeconds = (
            report.completedAt - report.startedAt
        ).total_seconds()
        await self._save_report(report)

        return report

    # -------------------------------------------------------------------------
    # Read Methods
    # -------------------------------------------------------------------------

    async def get_latest(self) -> Optional[DashboardReport]:
        """
        Retrieve the most recent completed or generation_failed report.

        Returns:
            The latest DashboardReport, or None if no reports exist.
        """
        collection = self._db[COLLECTION_NAME]
        doc = await collection.find_one(
            {"status": {"$in": ["completed", "generation_failed"]}},
            sort=[("completedAt", -1)],
        )
        if not doc:
            return None
        doc.pop("_id", None)
        return DashboardReport(**doc)

    async def get_reports(
        self, skip: int = 0, limit: int = 10
    ) -> Tuple[List[DashboardReport], int]:
        """
        Retrieve paginated report history sorted by most recent first.

        Args:
            skip: Number of records to skip for pagination.
            limit: Maximum number of records to return.

        Returns:
            Tuple of (list of DashboardReport, total count).
        """
        collection = self._db[COLLECTION_NAME]
        total = await collection.count_documents({})
        cursor = (
            collection.find({})
            .sort("startedAt", -1)
            .skip(skip)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        reports: List[DashboardReport] = []
        for doc in docs:
            doc.pop("_id", None)
            try:
                reports.append(DashboardReport(**doc))
            except Exception as exc:
                logger.warning(
                    f"[AIDashboardService] Failed to parse report doc: {exc}"
                )
        return reports, total

    async def get_by_id(self, report_id: str) -> Optional[DashboardReport]:
        """
        Retrieve a single report by its reportId.

        Args:
            report_id: The UUID string of the report.

        Returns:
            DashboardReport if found, None otherwise.
        """
        collection = self._db[COLLECTION_NAME]
        doc = await collection.find_one({"reportId": report_id})
        if not doc:
            return None
        doc.pop("_id", None)
        return DashboardReport(**doc)

    # -------------------------------------------------------------------------
    # Persistence
    # -------------------------------------------------------------------------

    async def _save_report(self, report: DashboardReport) -> None:
        """
        Upsert a DashboardReport to MongoDB by reportId.

        Args:
            report: DashboardReport instance to persist.

        Returns:
            None
        """
        collection = self._db[COLLECTION_NAME]
        report_dict = report.model_dump(mode="json")

        await collection.update_one(
            {"reportId": report.reportId},
            {"$set": report_dict},
            upsert=True,
        )
        logger.debug(
            f"[AIDashboardService] Saved report {report.reportId} "
            f"(status={report.status})"
        )
