"""
Farming Year Configuration Model

Defines the farming year start month configuration for the system.
Used for determining fiscal/agricultural year boundaries.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, field_validator


# Default farming year start month (August = 8)
# Common in agricultural contexts where the farming year starts after summer
DEFAULT_FARMING_YEAR_START_MONTH = 8


class FarmingYearConfig(BaseModel):
    """
    System configuration for farming year settings.

    Stored in the system_config collection with configType='farming_year_config'.
    """
    configId: UUID = Field(default_factory=uuid4, description="Unique configuration identifier")
    configType: str = Field("farming_year_config", description="Configuration type identifier")

    # Farming year configuration
    farmingYearStartMonth: int = Field(
        default=DEFAULT_FARMING_YEAR_START_MONTH,
        ge=1,
        le=12,
        description="Month when the farming year starts (1-12, where 1=January, 8=August)"
    )

    # Metadata
    updatedAt: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")
    updatedBy: Optional[UUID] = Field(None, description="User who last updated")
    updatedByEmail: Optional[str] = Field(None, description="Email of user who last updated")

    @field_validator('farmingYearStartMonth')
    @classmethod
    def validate_month(cls, v: int) -> int:
        """Ensure month is between 1 and 12."""
        if not 1 <= v <= 12:
            raise ValueError('farmingYearStartMonth must be between 1 and 12')
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "configId": "c1234567-89ab-cdef-0123-456789abcdef",
                "configType": "farming_year_config",
                "farmingYearStartMonth": 8,
                "updatedAt": "2025-11-27T10:00:00Z",
                "updatedBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "updatedByEmail": "admin@example.com"
            }
        }


class FarmingYearConfigUpdate(BaseModel):
    """Schema for updating farming year configuration."""
    farmingYearStartMonth: int = Field(
        ...,
        ge=1,
        le=12,
        description="Month when the farming year starts (1-12, where 1=January, 8=August)"
    )


class FarmingYearConfigResponse(BaseModel):
    """Response for farming year configuration."""
    data: FarmingYearConfig
    message: Optional[str] = None


def get_farming_year(
    date: datetime,
    start_month: int = DEFAULT_FARMING_YEAR_START_MONTH
) -> int:
    """
    Get the farming year for a given date.

    Args:
        date: The date to get the farming year for
        start_month: The month when the farming year starts (1-12)

    Returns:
        The farming year (e.g., 2025 for a date in farming year 2025)

    Example:
        If start_month=8 (August):
        - Jan 2025 -> farming year 2024 (year started Aug 2024)
        - Aug 2025 -> farming year 2025 (year started Aug 2025)
        - Dec 2025 -> farming year 2025 (year started Aug 2025)
    """
    if date.month >= start_month:
        return date.year
    else:
        return date.year - 1


def get_farming_year_date_range(
    farming_year: int,
    start_month: int = DEFAULT_FARMING_YEAR_START_MONTH
) -> tuple[datetime, datetime]:
    """
    Get the date range for a farming year.

    Args:
        farming_year: The farming year (e.g., 2025)
        start_month: The month when the farming year starts (1-12)

    Returns:
        Tuple of (start_date, end_date) for the farming year

    Example:
        If start_month=8 and farming_year=2025:
        Returns (datetime(2025, 8, 1), datetime(2026, 7, 31, 23, 59, 59))
    """
    start_date = datetime(farming_year, start_month, 1)

    # Calculate end date (one day before next farming year starts)
    if start_month == 1:
        end_date = datetime(farming_year, 12, 31, 23, 59, 59)
    else:
        end_date = datetime(farming_year + 1, start_month - 1, 1, 23, 59, 59)
        # Get last day of the previous month
        import calendar
        last_day = calendar.monthrange(farming_year + 1, start_month - 1)[1]
        end_date = datetime(farming_year + 1, start_month - 1, last_day, 23, 59, 59)

    return start_date, end_date


# Month name mapping for display
MONTH_NAMES = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
}
