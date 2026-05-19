"""Pydantic schemas for cost centres."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from ..orm.models import CostCenterTypeEnum


class CostCenterCreate(BaseModel):
    """Request body for creating a cost centre."""

    organizationId: str = Field(..., min_length=1)
    costCenterId: str = Field(..., min_length=1, max_length=20)
    companyCode: Optional[str] = Field(None, max_length=10)
    name: str = Field(..., min_length=1, max_length=200)
    type: CostCenterTypeEnum = CostCenterTypeEnum.OTHER
    isActive: bool = True


class CostCenterUpdate(BaseModel):
    """Request body for patching a cost centre."""

    companyCode: Optional[str] = Field(None, max_length=10)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    type: Optional[CostCenterTypeEnum] = None
    isActive: Optional[bool] = None


class CostCenterResponse(BaseModel):
    """Response representation of a cost centre."""

    organizationId: str
    costCenterId: str
    companyCode: Optional[str]
    name: str
    type: CostCenterTypeEnum
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
