"""Pydantic schemas for Journal Entries.

JEs are created exclusively by posting handlers (Phase B+) and via the
reversal action (POST /{je_id}/reverse).  The API exposes read endpoints
and the single write action — reverse.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from ..orm.models import JEStatusEnum


class JournalEntryLineResponse(BaseModel):
    """Response representation of a single journal entry line."""

    jeLineId: str
    jeId: str
    lineNumber: int
    accountId: str
    debit: Optional[Decimal]
    credit: Optional[Decimal]
    description: Optional[str]
    costCenterId: Optional[str]
    referenceLineId: Optional[str]
    createdAt: datetime

    model_config = {"from_attributes": True}


class JournalEntryResponse(BaseModel):
    """Response representation of a journal entry header, including lines."""

    jeId: str
    organizationId: str
    companyCode: str
    jeNumber: str
    jeDate: date
    periodId: str
    sourceEventType: str
    sourceEventId: str
    sourceDocId: Optional[str]
    sourceDocNumber: Optional[str]
    description: Optional[str]
    totalDebit: Decimal
    totalCredit: Decimal
    status: JEStatusEnum
    voidedAt: Optional[datetime]
    voidedBy: Optional[str]
    voidReason: Optional[str]
    postedAt: datetime
    postedBy: str
    createdAt: datetime
    updatedAt: datetime
    lines: List[JournalEntryLineResponse] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# JE Reversal schemas
# ---------------------------------------------------------------------------


class ReversalRequest(BaseModel):
    """Request body for POST /journal-entries/{je_id}/reverse."""

    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Human-readable reason for the reversal (5–500 characters).",
    )


class ReversalResponse(BaseModel):
    """
    Response body for POST /journal-entries/{je_id}/reverse.

    Contains both the now-voided original JE and the newly-created reversal JE.
    """

    original: JournalEntryResponse
    reversal: JournalEntryResponse
