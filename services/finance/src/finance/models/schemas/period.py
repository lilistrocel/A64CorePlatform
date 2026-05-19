"""Pydantic schemas for fiscal periods."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from ..orm.models import PeriodStatusEnum


class FiscalPeriodCreate(BaseModel):
    """Request body for creating a fiscal period."""

    companyCode: str = Field(..., min_length=1, max_length=10)
    fiscalYear: int = Field(..., ge=2000, le=2100)
    periodNumber: int = Field(..., ge=1, le=13)
    startDate: date
    endDate: date

    @model_validator(mode="after")
    def end_after_start(self) -> "FiscalPeriodCreate":
        """Ensure end date is after start date."""
        if self.endDate <= self.startDate:
            raise ValueError("endDate must be after startDate")
        return self


class FiscalPeriodResponse(BaseModel):
    """Response representation of a fiscal period."""

    periodId: str
    companyCode: str
    fiscalYear: int
    periodNumber: int
    startDate: date
    endDate: date
    status: PeriodStatusEnum
    closedAt: Optional[datetime]
    closedByUserId: Optional[str]
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
