"""
Purchasing Module — Payment Terms Pydantic Models

Defines the payment terms document shape for the MongoDB
`payment_terms` collection.  Operations is master for payment terms;
finance service only logs receipt of change events.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Seed constants
# ---------------------------------------------------------------------------

DEFAULT_PAYMENT_TERMS = [
    {"termsCode": "NET15", "description": "Net 15 days", "netDays": 15},
    {"termsCode": "NET30", "description": "Net 30 days", "netDays": 30},
    {"termsCode": "NET45", "description": "Net 45 days", "netDays": 45},
    {"termsCode": "NET60", "description": "Net 60 days", "netDays": 60},
    {"termsCode": "NET90", "description": "Net 90 days", "netDays": 90},
    {"termsCode": "COD", "description": "Cash on Delivery", "netDays": 0},
    {"termsCode": "EOM", "description": "End of Month", "netDays": 30},
    {"termsCode": "EOM15", "description": "End of Month + 15 days", "netDays": 45},
    {"termsCode": "EOM30", "description": "End of Month + 30 days", "netDays": 60},
]


# ---------------------------------------------------------------------------
# Input models
# ---------------------------------------------------------------------------


class PaymentTermsCreate(BaseModel):
    """
    Request model for creating a payment terms record.

    Args:
        organizationId: Owning organisation UUID.
        termsCode: Unique short code (e.g. 'NET30', 'COD').
        description: Human-readable description.
        netDays: Number of days until payment is due (0 for COD/Immediate).
    """

    organizationId: str
    termsCode: str = Field(..., min_length=1, max_length=20)
    description: str = Field(..., min_length=1, max_length=200)
    netDays: int = Field(..., ge=0)


class PaymentTermsUpdate(BaseModel):
    """
    Request model for partial payment terms update.

    All fields optional — only supplied fields are updated.
    """

    description: Optional[str] = Field(None, min_length=1, max_length=200)
    netDays: Optional[int] = Field(None, ge=0)
    isActive: Optional[bool] = None


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class PaymentTermsResponse(BaseModel):
    """
    Payment terms response model.

    Serialised from MongoDB document. Never exposes raw _id.
    """

    termsId: str
    organizationId: str
    termsCode: str
    description: str
    netDays: int
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
