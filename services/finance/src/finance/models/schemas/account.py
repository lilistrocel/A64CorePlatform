"""Pydantic schemas for GL accounts."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from ..orm.models import AccountTypeEnum, DrawerEnum


class GLAccountCreate(BaseModel):
    """Request body for creating a GL account."""

    organizationId: str = Field(..., min_length=1)
    accountNumber: str = Field(..., min_length=1, max_length=20)
    accountName: str = Field(..., min_length=1, max_length=200)
    drawer: DrawerEnum
    accountType: AccountTypeEnum
    parentAccountId: Optional[str] = None
    isHeader: bool = False
    isControlAccount: bool = False
    isActive: bool = True


class GLAccountUpdate(BaseModel):
    """Request body for patching a GL account."""

    accountName: Optional[str] = Field(None, min_length=1, max_length=200)
    drawer: Optional[DrawerEnum] = None
    accountType: Optional[AccountTypeEnum] = None
    parentAccountId: Optional[str] = None
    isHeader: Optional[bool] = None
    isControlAccount: Optional[bool] = None
    isActive: Optional[bool] = None
    isLockedNumber: Optional[bool] = None


class GLAccountResponse(BaseModel):
    """Response representation of a GL account."""

    accountId: str
    organizationId: str
    accountNumber: str
    accountName: str
    drawer: DrawerEnum
    accountType: AccountTypeEnum
    parentAccountId: Optional[str]
    isHeader: bool
    isControlAccount: bool
    isActive: bool
    isLockedNumber: bool
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
