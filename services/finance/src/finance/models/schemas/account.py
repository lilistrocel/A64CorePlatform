"""Pydantic schemas for GL accounts."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from ..orm.models import (
    AccountLevelEnum,
    AccountRoleEnum,
    AccountTypeEnum,
    CashFlowCategoryEnum,
    DrawerEnum,
)


class GLAccountCreate(BaseModel):
    """Request body for creating a GL account."""

    organizationId: str = Field(..., min_length=1)
    accountNumber: str = Field(..., min_length=1, max_length=20)
    accountName: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    drawer: DrawerEnum
    accountType: AccountTypeEnum
    parentAccountId: Optional[str] = None
    isHeader: bool = False
    isControlAccount: bool = False
    isActive: bool = True
    accountLevel: AccountLevelEnum = AccountLevelEnum.ACTIVE
    accountRole: Optional[AccountRoleEnum] = None
    ifrsTag: Optional[str] = Field(None, max_length=10)
    # Reason: Wave 2 (T-060.2) — operator can set the CF category on
    # create. Defaults to NONE so an unclassified new account is simply
    # excluded from CF until reviewed.
    cashFlowCategory: CashFlowCategoryEnum = CashFlowCategoryEnum.NONE


class GLAccountUpdate(BaseModel):
    """Request body for patching a GL account."""

    accountName: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    drawer: Optional[DrawerEnum] = None
    accountType: Optional[AccountTypeEnum] = None
    parentAccountId: Optional[str] = None
    isHeader: Optional[bool] = None
    isControlAccount: Optional[bool] = None
    isActive: Optional[bool] = None
    isLockedNumber: Optional[bool] = None
    accountLevel: Optional[AccountLevelEnum] = None
    accountRole: Optional[AccountRoleEnum] = None
    ifrsTag: Optional[str] = Field(None, max_length=10)
    # Reason: inline-edit from Chart-of-Accounts UI (T-060.12).
    cashFlowCategory: Optional[CashFlowCategoryEnum] = None


class GLAccountResponse(BaseModel):
    """Response representation of a GL account."""

    accountId: str
    organizationId: str
    accountNumber: str
    accountName: str
    description: Optional[str]
    drawer: DrawerEnum
    accountType: AccountTypeEnum
    parentAccountId: Optional[str]
    isHeader: bool
    isControlAccount: bool
    isActive: bool
    isLockedNumber: bool
    accountLevel: AccountLevelEnum
    accountRole: Optional[AccountRoleEnum]
    ifrsTag: Optional[str]
    cashFlowCategory: CashFlowCategoryEnum
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
