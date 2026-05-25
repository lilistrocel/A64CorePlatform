"""Pydantic schemas for Journal Entries.

JEs are created by posting handlers (Phase B+), via the reversal action
(POST /{je_id}/reverse), and as of T-061 via the manual creation endpoint
(POST /journal-entries).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator

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
    # Set by the API layer when another JE with sourceEventType='je_reversal'
    # exists and references this JE's jeNumber via sourceDocNumber. Used by
    # the UI to render a "Reversed" badge under the standard reversing-entry
    # pattern (original stays posted; reversal is its own posted JE).
    reversedByJeNumber: Optional[str] = None
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


# ---------------------------------------------------------------------------
# Manual JE Creation schemas (T-061)
# ---------------------------------------------------------------------------


class ManualJELineRequest(BaseModel):
    """
    A single line in a manual JE create request.

    Exactly one of debit or credit must be non-null and > 0.
    Both null or both non-null are rejected by the validator below.
    Negative amounts are also rejected.
    """

    accountId: str = Field(..., description="GL account UUID to post to.")
    debit: Optional[Decimal] = Field(
        None,
        description="Debit amount — exclusive with credit. Must be > 0 if provided.",
    )
    credit: Optional[Decimal] = Field(
        None,
        description="Credit amount — exclusive with debit. Must be > 0 if provided.",
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional line memo (≤ 500 characters).",
    )
    costCenterId: Optional[str] = Field(
        None,
        description="Optional cost centre identifier.",
    )

    @model_validator(mode="after")
    def validate_exactly_one_side(self) -> "ManualJELineRequest":
        """
        Enforce that exactly one of debit / credit is non-null and > 0.

        Raises:
            ValueError: If both are null, both are non-null, or either is <= 0.
        """
        has_debit = self.debit is not None
        has_credit = self.credit is not None

        if not has_debit and not has_credit:
            raise ValueError("Each line must have exactly one of debit or credit (both are null).")
        if has_debit and has_credit:
            raise ValueError(
                "Each line must have exactly one of debit or credit (both are non-null)."
            )
        # Reason: Decimal comparisons with 0 are always exact; no float imprecision.
        if has_debit and self.debit <= Decimal("0"):
            raise ValueError("Debit amount must be > 0.")
        if has_credit and self.credit <= Decimal("0"):
            raise ValueError("Credit amount must be > 0.")
        return self


class ManualJECreateRequest(BaseModel):
    """
    Request body for POST /journal-entries (manual JE creation — T-061).

    Roles: super_admin, finance_admin only (NOT finance_reviewer).
    Server-side sets sourceEventType='manual', sourceEventId=new UUID,
    sourceDocId/sourceDocNumber=null, status='posted'.
    """

    organizationId: str = Field(..., description="Organization UUID — scopes the JE.")
    companyCode: str = Field(..., description="Company code (e.g. '1000').")
    jeDate: date = Field(..., description="Accounting date for the JE (YYYY-MM-DD).")
    description: str = Field(
        ...,
        max_length=500,
        description="JE header description (required, ≤ 500 chars).",
    )
    reason: str = Field(
        ...,
        max_length=500,
        description=(
            "Audit memo — why this JE was posted manually. "
            "Distinct from description. Required, non-empty after strip."
        ),
    )
    lines: List[ManualJELineRequest] = Field(
        ...,
        min_length=2,
        description="JE lines. Minimum 2 lines required.",
    )

    @model_validator(mode="after")
    def validate_reason_not_whitespace(self) -> "ManualJECreateRequest":
        """
        Reject reason fields that are whitespace-only after stripping.

        Raises:
            ValueError: If reason is empty or whitespace-only.
        """
        if not self.reason.strip():
            raise ValueError("reason must not be empty or whitespace-only.")
        return self

    @model_validator(mode="after")
    def validate_balanced(self) -> "ManualJECreateRequest":
        """
        Verify that SUM(debit) == SUM(credit) across all lines.

        Raises:
            ValueError: If the JE is not balanced.
        """
        total_debit = sum(
            (ln.debit for ln in self.lines if ln.debit is not None), Decimal("0")
        )
        total_credit = sum(
            (ln.credit for ln in self.lines if ln.credit is not None), Decimal("0")
        )
        if total_debit != total_credit:
            raise ValueError(
                f"JE is not balanced: SUM(debit)={total_debit} != SUM(credit)={total_credit}."
            )
        return self


class ManualJEMeta(BaseModel):
    """
    Metadata envelope returned alongside the created JE.

    warnings: list of non-blocking advisory messages (e.g. inactive account used).
    """

    warnings: List[str] = Field(
        default_factory=list,
        description="Non-blocking warnings (e.g. inactive account used).",
    )


class ManualJECreateResponse(BaseModel):
    """
    Response envelope for POST /journal-entries (T-061).

    Differs from the standard SuccessResponse envelope by including a
    meta.warnings list so inactive-account advisories can surface without
    blocking the create.
    """

    data: JournalEntryResponse
    meta: ManualJEMeta = Field(default_factory=ManualJEMeta)
    message: Optional[str] = None
