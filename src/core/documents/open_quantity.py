"""
A64 Core Platform — Open-Quantity Tracking

Every document line carries:

  ``ordered_qty``   The quantity originally committed on the line.
  ``consumed_qty``  The cumulative quantity consumed by downstream documents.
  ``open_qty``      ordered_qty − consumed_qty  (derived property).

When a downstream document is created (e.g. a Delivery Note against an SO,
or a Goods Receipt against a PO), the upstream line's ``consumed_qty`` is
atomically incremented via :func:`increment_consumed_qty`.  If the increment
would push ``consumed_qty`` above ``ordered_qty``, a ``ValueError`` is raised
before any write occurs.

The MongoDB field names used in the collection are:
  - ``openQuantity``   — stored as float/Decimal, = ordered_qty − consumed_qty
  - ``closedQuantity`` — stored as float/Decimal, = consumed_qty

This aligns with the existing purchasing module's ``document_lines`` collection
(see ``src/modules/purchasing/models/document.py``).  ``increment_consumed_qty``
updates ``openQuantity`` and ``closedQuantity`` in a single ``$inc`` operation
inside MongoDB's findAndModify, which is atomic at the document level.

Rounding tolerance
------------------
A line is considered "fully closed" when open_qty <= 0.0001 (a rounding
tolerance that prevents 0.99999999... from being treated as still-open after
floating-point arithmetic).

Over-consumption guard
----------------------
The guard fires when the proposed increment would exceed ordered_qty + tolerance.
The tolerance also applies here (e.g. a 100.00000001 receipt against a 100.0
ordered qty is accepted rather than rejected as a rounding artefact).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pydantic import BaseModel, Field, computed_field

# Rounding tolerance: quantities differing by less than this are treated as equal.
_ROUNDING_TOLERANCE = Decimal("0.0001")


class LineQuantityState(BaseModel):
    """
    Snapshot of the quantity state for one document line.

    Attributes:
        ordered_qty:   The original committed quantity on the line.
        consumed_qty:  Quantity consumed by downstream documents so far.
        open_qty:      Derived: ordered_qty − consumed_qty.
        is_closed:     True when open_qty is within the rounding tolerance of zero.
        is_over_consumed: True when consumed_qty exceeds ordered_qty + tolerance.
    """

    ordered_qty: Decimal = Field(..., description="Original committed quantity")
    consumed_qty: Decimal = Field(
        Decimal("0"),
        description="Cumulative quantity consumed by downstream documents",
    )

    @computed_field  # type: ignore[misc]
    @property
    def open_qty(self) -> Decimal:
        """Remaining un-consumed quantity (may be negative if somehow over-consumed)."""
        return self.ordered_qty - self.consumed_qty

    @computed_field  # type: ignore[misc]
    @property
    def is_closed(self) -> bool:
        """True when open_qty is within the rounding tolerance of zero."""
        return self.open_qty <= _ROUNDING_TOLERANCE

    @computed_field  # type: ignore[misc]
    @property
    def is_over_consumed(self) -> bool:
        """True when consumed_qty exceeds ordered_qty beyond the rounding tolerance."""
        return self.consumed_qty > self.ordered_qty + _ROUNDING_TOLERANCE


async def increment_consumed_qty(
    db: AsyncIOMotorDatabase,
    *,
    lines_collection: str,
    source_line_id: str,
    delta: Decimal,
    session: Optional[AsyncIOMotorClientSession] = None,
) -> LineQuantityState:
    """
    Atomically increment a source line's consumed quantity.

    Uses MongoDB's ``findAndModify`` (via Motor's ``find_one_and_update``) to
    atomically update ``openQuantity`` (decrement) and ``closedQuantity``
    (increment) on the source line.  The operation is document-level atomic —
    no two concurrent callers can both pass the over-consumption check and
    both write at the same time.

    Design note: the over-consumption check is performed BEFORE the write by
    reading the current state within the same operation's filter.  MongoDB
    ``find_one_and_update`` applies the filter and the update atomically; if
    the filter fails (because another writer already consumed the remaining qty)
    the update returns None and we raise ValueError.

    Args:
        db:               Motor database instance.
        lines_collection: MongoDB collection name for document lines.
        source_line_id:   ``lineId`` UUID of the source line.
        delta:            Quantity to consume.  Must be > 0.
        session:          Optional Motor session (for transaction participation).

    Returns:
        Updated :class:`LineQuantityState` reflecting the post-increment state.

    Raises:
        ValueError: If ``delta`` <= 0, if the source line is not found, or if
                    the increment would exceed ordered_qty + tolerance.
    """
    if delta <= Decimal("0"):
        raise ValueError(f"delta must be positive; got {delta}")

    delta_f = float(delta)

    # Reason: filter ensures openQuantity >= (delta - tolerance) BEFORE decrement,
    # making the over-consumption check atomic with the update.
    min_open_required = float(delta - _ROUNDING_TOLERANCE)

    result = await db[lines_collection].find_one_and_update(
        {
            "lineId": source_line_id,
            "openQuantity": {"$gte": min_open_required},
        },
        {
            "$inc": {
                "openQuantity": -delta_f,
                "closedQuantity": delta_f,
            }
        },
        return_document=True,
        session=session,
    )

    if result is None:
        # Distinguish between "not found" and "over-consumption" by checking existence.
        exists = await db[lines_collection].find_one(
            {"lineId": source_line_id},
            session=session,
        )
        if exists is None:
            raise ValueError(
                f"Source line '{source_line_id}' not found in '{lines_collection}'"
            )
        open_qty = Decimal(str(exists.get("openQuantity", 0)))
        raise ValueError(
            f"Cannot consume {delta} from line '{source_line_id}': "
            f"only {open_qty} remains (open quantity would go negative)"
        )

    ordered = Decimal(str(result.get("quantity", result.get("ordered_qty", 0))))
    consumed = Decimal(str(result.get("closedQuantity", 0)))

    return LineQuantityState(ordered_qty=ordered, consumed_qty=consumed)


async def get_quantity_state(
    db: AsyncIOMotorDatabase,
    *,
    lines_collection: str,
    source_line_id: str,
    session: Optional[AsyncIOMotorClientSession] = None,
) -> Optional[LineQuantityState]:
    """
    Read the current quantity state for a document line without modifying it.

    Args:
        db:               Motor database instance.
        lines_collection: MongoDB collection name for document lines.
        source_line_id:   ``lineId`` UUID of the source line.
        session:          Optional Motor session.

    Returns:
        :class:`LineQuantityState` if the line exists, None otherwise.
    """
    doc = await db[lines_collection].find_one(
        {"lineId": source_line_id},
        session=session,
    )
    if doc is None:
        return None

    ordered = Decimal(str(doc.get("quantity", doc.get("ordered_qty", 0))))
    consumed = Decimal(str(doc.get("closedQuantity", 0)))
    return LineQuantityState(ordered_qty=ordered, consumed_qty=consumed)
