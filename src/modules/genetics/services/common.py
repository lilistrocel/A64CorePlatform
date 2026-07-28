"""
Genetics Repo Module - Shared Service Helpers

Every genetics collection follows the platform convention of storing the
primary key under ``<entity>Id`` while the Pydantic model exposes ``id``.
These helpers centralise that rename plus the code-generation logic so the
services stay focused on business rules.
"""

import logging
import re
from datetime import datetime
from typing import Any, Dict, Optional, Type, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

TModel = TypeVar("TModel", bound=BaseModel)

# Fields that are computed on the model and must never be persisted — they are
# derived from stored values and would otherwise drift out of sync.
_COMPUTED_FIELDS = ("generationLabel",)


def doc_to_model(doc: Dict[str, Any], model_cls: Type[TModel], id_key: str) -> TModel:
    """Convert a MongoDB document into a Pydantic model.

    Strips ``_id`` and renames ``id_key`` (e.g. ``lineId``) to ``id``.
    """
    doc = dict(doc)
    doc.pop("_id", None)
    if id_key in doc:
        doc["id"] = doc.pop(id_key)
    for field in _COMPUTED_FIELDS:
        doc.pop(field, None)
    return model_cls(**doc)


def model_to_doc(model: BaseModel, id_key: str) -> Dict[str, Any]:
    """Convert a Pydantic model into a MongoDB document.

    Renames ``id`` to ``id_key`` and drops computed fields.
    """
    doc = model.model_dump()
    if "id" in doc:
        doc[id_key] = doc.pop("id")
    for field in _COMPUTED_FIELDS:
        doc.pop(field, None)
    return doc


def slugify_code(value: str) -> str:
    """Normalise a user-supplied code into the canonical uppercase form.

    Codes end up in accession labels and barcodes, so anything that is not
    alphanumeric or a dash is collapsed to a dash.
    """
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", value.strip()).strip("-")
    return cleaned.upper()


def generation_label(clone_generation: int, filial_generation: int) -> str:
    """Render the G/F pair the way it appears on a vessel label.

    Pure clone chains stay short ('G2'); once a cross enters the ancestry the
    filial counter is shown as well ('F1-G2').
    """
    if filial_generation > 0:
        return f"F{filial_generation}-G{clone_generation}"
    return f"G{clone_generation}"


def build_accession_code(
    line_code: str,
    clone_generation: int,
    filial_generation: int,
    sequence: int,
) -> str:
    """Compose an accession code, e.g. ``PO-BLU-G2-014`` or ``PO-BLU-F1-G2-003``."""
    return (
        f"{slugify_code(line_code)}-"
        f"{generation_label(clone_generation, filial_generation)}-"
        f"{sequence:03d}"
    )


def build_batch_code(recipe_code: str, prepared_at: datetime, sequence: int) -> str:
    """Compose a medium batch code, e.g. ``MEA-AC-2607-03``.

    Uses a YYMM stamp so batches sort chronologically inside a recipe.
    """
    return (
        f"{slugify_code(recipe_code)}-"
        f"{prepared_at.strftime('%y%m')}-"
        f"{sequence:02d}"
    )


def scope_fields(current_user: Any) -> Dict[str, Optional[str]]:
    """Extract the audit/scope fields carried on every genetics document."""
    return {
        "createdBy": getattr(current_user, "userId", None),
        "divisionId": getattr(current_user, "divisionId", None),
        "organizationId": getattr(current_user, "organizationId", None),
    }
