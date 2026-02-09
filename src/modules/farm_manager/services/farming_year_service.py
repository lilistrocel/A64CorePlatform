"""
Farm Management Module - Farming Year Service

Service for managing farming year configuration and calculations.
The farming year is a configurable calendar year used for agricultural reporting,
typically starting in a different month than January (e.g., August for UAE farms).
"""

import calendar
from datetime import datetime
from typing import Optional, Tuple
from uuid import UUID, uuid4
import logging

from .database import farm_db
from ..models.farming_year_config import (
    FarmingYearConfig,
    DEFAULT_FARMING_YEAR_START_MONTH,
    MONTH_NAMES,
)

logger = logging.getLogger(__name__)


class FarmingYearService:
    """Service for farming year configuration and date calculations."""

    COLLECTION_NAME = "system_config"
    CONFIG_TYPE = "farming_year_config"

    def __init__(self):
        self.db = farm_db.get_database()
        self.collection = self.db[self.COLLECTION_NAME]

    async def get_farming_year_config(self) -> FarmingYearConfig:
        """
        Get the current farming year configuration.

        If no configuration exists, creates and returns the default configuration.

        Returns:
            FarmingYearConfig with current settings
        """
        try:
            # Find existing configuration
            config_doc = await self.collection.find_one({
                "configType": self.CONFIG_TYPE
            })

            if config_doc:
                # Convert MongoDB document to Pydantic model
                return FarmingYearConfig(
                    configId=UUID(config_doc["configId"]) if isinstance(config_doc.get("configId"), str) else config_doc.get("configId", uuid4()),
                    configType=config_doc.get("configType", self.CONFIG_TYPE),
                    farmingYearStartMonth=config_doc.get("farmingYearStartMonth", DEFAULT_FARMING_YEAR_START_MONTH),
                    updatedAt=config_doc.get("updatedAt", datetime.utcnow()),
                    updatedBy=UUID(config_doc["updatedBy"]) if config_doc.get("updatedBy") else None,
                    updatedByEmail=config_doc.get("updatedByEmail")
                )

            # No configuration exists - create default
            logger.info("No farming year configuration found, creating defaults")
            return await self._create_default_config()

        except Exception as e:
            logger.error(f"Error getting farming year config: {e}")
            # Return defaults on error
            return FarmingYearConfig(
                configId=uuid4(),
                configType=self.CONFIG_TYPE,
                farmingYearStartMonth=DEFAULT_FARMING_YEAR_START_MONTH,
                updatedAt=datetime.utcnow()
            )

    async def _create_default_config(self) -> FarmingYearConfig:
        """Create the default farming year configuration."""
        config = FarmingYearConfig(
            configId=uuid4(),
            configType=self.CONFIG_TYPE,
            farmingYearStartMonth=DEFAULT_FARMING_YEAR_START_MONTH,
            updatedAt=datetime.utcnow()
        )

        try:
            await self.collection.insert_one({
                "configId": str(config.configId),
                "configType": config.configType,
                "farmingYearStartMonth": config.farmingYearStartMonth,
                "updatedAt": config.updatedAt,
                "updatedBy": None,
                "updatedByEmail": None
            })
            logger.info("Created default farming year configuration")
        except Exception as e:
            logger.error(f"Error creating default farming year config: {e}")
            # Return the config even if save failed

        return config

    async def update_farming_year_config(
        self,
        start_month: int,
        user_id: UUID,
        user_email: str
    ) -> FarmingYearConfig:
        """
        Update the farming year start month.

        Args:
            start_month: New start month (1-12)
            user_id: ID of user making the update
            user_email: Email of user making the update

        Returns:
            Updated FarmingYearConfig
        """
        if not 1 <= start_month <= 12:
            raise ValueError("start_month must be between 1 and 12")

        try:
            now = datetime.utcnow()

            # Try to update existing config
            await self.collection.update_one(
                {"configType": self.CONFIG_TYPE},
                {
                    "$set": {
                        "farmingYearStartMonth": start_month,
                        "updatedAt": now,
                        "updatedBy": str(user_id),
                        "updatedByEmail": user_email
                    },
                    "$setOnInsert": {
                        "configId": str(uuid4()),
                        "configType": self.CONFIG_TYPE
                    }
                },
                upsert=True
            )

            logger.info(f"Updated farming year config to start month {start_month} by {user_email}")

            # Return updated config
            return await self.get_farming_year_config()

        except Exception as e:
            logger.error(f"Error updating farming year config: {e}")
            raise

    def get_farming_year_for_date(
        self,
        date: datetime,
        start_month: int = DEFAULT_FARMING_YEAR_START_MONTH
    ) -> int:
        """
        Get the farming year for a given date.

        The farming year is the calendar year when the farming year started.
        For example, if start_month=8 (August):
        - January 2025 -> farming year 2024 (started Aug 2024)
        - August 2025 -> farming year 2025 (started Aug 2025)
        - December 2025 -> farming year 2025 (started Aug 2025)

        Args:
            date: The date to get the farming year for
            start_month: The month when the farming year starts (1-12)

        Returns:
            The farming year integer (e.g., 2024, 2025)
        """
        if date.month >= start_month:
            return date.year
        else:
            return date.year - 1

    async def get_current_farming_year(self) -> int:
        """
        Get the current farming year based on configured start month.

        Returns:
            The current farming year integer
        """
        config = await self.get_farming_year_config()
        return self.get_farming_year_for_date(
            datetime.utcnow(),
            config.farmingYearStartMonth
        )

    def get_farming_year_date_range(
        self,
        farming_year: int,
        start_month: int = DEFAULT_FARMING_YEAR_START_MONTH
    ) -> Tuple[datetime, datetime]:
        """
        Get the date range for a farming year.

        Args:
            farming_year: The farming year (e.g., 2025)
            start_month: The month when the farming year starts (1-12)

        Returns:
            Tuple of (start_date, end_date) for the farming year
            start_date: First day of start_month in farming_year (00:00:00)
            end_date: Last day of month before start_month in next calendar year (23:59:59)

        Example:
            If start_month=8 and farming_year=2025:
            Returns (2025-08-01 00:00:00, 2026-07-31 23:59:59)
        """
        # Start date: First day of start month in farming year
        start_date = datetime(farming_year, start_month, 1, 0, 0, 0)

        # End date: Last day of month before start_month
        if start_month == 1:
            # If farming year starts in January, it ends in December of same year
            end_year = farming_year
            end_month = 12
        else:
            # Otherwise it ends in the month before start_month of the next calendar year
            end_year = farming_year + 1
            end_month = start_month - 1

        # Get the last day of the end month
        last_day = calendar.monthrange(end_year, end_month)[1]
        end_date = datetime(end_year, end_month, last_day, 23, 59, 59)

        return start_date, end_date

    def format_farming_year_display(
        self,
        farming_year: int,
        start_month: int = DEFAULT_FARMING_YEAR_START_MONTH
    ) -> str:
        """
        Format a farming year for display.

        Args:
            farming_year: The farming year (e.g., 2025)
            start_month: The month when the farming year starts (1-12)

        Returns:
            Formatted string like "Aug 2025 - Jul 2026" or "Jan 2025 - Dec 2025"
        """
        start_date, end_date = self.get_farming_year_date_range(farming_year, start_month)

        start_month_name = MONTH_NAMES[start_date.month][:3]
        end_month_name = MONTH_NAMES[end_date.month][:3]

        return f"{start_month_name} {start_date.year} - {end_month_name} {end_date.year}"

    async def get_farming_years_list(
        self,
        count: int = 5,
        include_next: bool = True
    ) -> list[dict]:
        """
        Get a list of farming years for dropdown selection.

        Args:
            count: Number of past years to include (default 5)
            include_next: Whether to include the next farming year

        Returns:
            List of dicts with 'year' and 'display' keys, sorted newest first
        """
        config = await self.get_farming_year_config()
        current_year = await self.get_current_farming_year()

        years = []

        # Include next year if requested
        if include_next:
            years.append({
                "year": current_year + 1,
                "display": self.format_farming_year_display(current_year + 1, config.farmingYearStartMonth),
                "isCurrent": False,
                "isNext": True
            })

        # Current year
        years.append({
            "year": current_year,
            "display": self.format_farming_year_display(current_year, config.farmingYearStartMonth),
            "isCurrent": True,
            "isNext": False
        })

        # Past years
        for i in range(1, count):
            year = current_year - i
            years.append({
                "year": year,
                "display": self.format_farming_year_display(year, config.farmingYearStartMonth),
                "isCurrent": False,
                "isNext": False
            })

        return years

    def is_date_in_farming_year(
        self,
        date: datetime,
        farming_year: int,
        start_month: int = DEFAULT_FARMING_YEAR_START_MONTH
    ) -> bool:
        """
        Check if a date falls within a specific farming year.

        Args:
            date: The date to check
            farming_year: The farming year to check against
            start_month: The farming year start month

        Returns:
            True if the date is within the farming year
        """
        start_date, end_date = self.get_farming_year_date_range(farming_year, start_month)
        return start_date <= date <= end_date


# Singleton instance for easy access
_farming_year_service: Optional[FarmingYearService] = None


def get_farming_year_service() -> FarmingYearService:
    """Get the singleton FarmingYearService instance."""
    global _farming_year_service
    if _farming_year_service is None:
        _farming_year_service = FarmingYearService()
    return _farming_year_service
