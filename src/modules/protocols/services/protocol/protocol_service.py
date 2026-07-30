"""
Protocols Module - Protocol Service

CRUD for the ``protocols`` collection, plus version control and the
scope-tag lookup that surfaces a procedure where the work happens.
"""

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from ...models.enums import ProtocolStatus
from ...models.protocol import (
    ApprovalRequest,
    Protocol,
    ProtocolCreate,
    ProtocolRef,
    ProtocolUpdate,
)
from ..database import PROTOCOLS, protocols_db

logger = logging.getLogger(__name__)

_ID_KEY = "protocolId"

# Fields that change what someone would actually DO at the bench. Editing any
# of them bumps the version, because work recorded against the old version was
# carried out under different instructions. Renaming or re-tagging does not.
_CONTENT_FIELDS = {
    "steps",
    "equipment",
    "materials",
    "ppe",
    "safetyNotes",
    "purpose",
    "scope",
}


def _doc_to_model(doc: dict) -> Protocol:
    doc = dict(doc)
    doc.pop("_id", None)
    if _ID_KEY in doc:
        doc["id"] = doc.pop(_ID_KEY)
    return Protocol(**doc)


def _model_to_doc(model: Protocol) -> dict:
    doc = model.model_dump()
    doc[_ID_KEY] = doc.pop("id")
    return doc


def _normalise_code(value: str) -> str:
    """Uppercase and collapse to the canonical SOP-XXX-000 shape."""
    return re.sub(r"[^A-Za-z0-9]+", "-", value.strip()).strip("-").upper()


class ProtocolService:
    """Service for standard operating procedures."""

    # -----------------------------------------------------------------------
    # Create
    # -----------------------------------------------------------------------

    @staticmethod
    async def create_protocol(data: ProtocolCreate, current_user: Any) -> Protocol:
        db = protocols_db.get_database()

        code = _normalise_code(data.code)
        if not code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Protocol code must contain at least one alphanumeric character",
            )
        if await db[PROTOCOLS].find_one({"code": code}, {"_id": 1}):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A protocol with code '{code}' already exists",
            )

        payload = data.model_dump()
        payload["code"] = code
        payload["steps"] = ProtocolService._renumber(payload.get("steps", []))

        protocol = Protocol(
            **payload,
            createdBy=getattr(current_user, "userId", None),
            divisionId=getattr(current_user, "divisionId", None),
            organizationId=getattr(current_user, "organizationId", None),
        )

        await db[PROTOCOLS].insert_one(_model_to_doc(protocol))
        logger.info(
            f"[ProtocolService] Created {protocol.code} v{protocol.version} "
            f"({protocol.status.value})"
        )
        return protocol

    @staticmethod
    def _renumber(steps: List[dict]) -> List[dict]:
        """Force step order to be contiguous and 1-based.

        Clients reorder by dragging and can leave gaps or duplicates; a
        procedure that reads 1, 2, 2, 5 is worse than useless at the bench.
        """
        ordered = sorted(steps, key=lambda s: s.get("order", 0))
        for index, step in enumerate(ordered, start=1):
            step["order"] = index
        return ordered

    # -----------------------------------------------------------------------
    # Read
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_protocol(protocol_id: str) -> Protocol:
        db = protocols_db.get_database()
        doc = await db[PROTOCOLS].find_one({_ID_KEY: protocol_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Protocol '{protocol_id}' not found",
            )
        return _doc_to_model(doc)

    @staticmethod
    async def list_protocols(
        skip: int = 0,
        limit: int = 20,
        category: Optional[str] = None,
        status_filter: Optional[str] = None,
        applies_to: Optional[str] = None,
        search: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> Tuple[List[Protocol], int]:
        db = protocols_db.get_database()

        query: Dict[str, Any] = {}
        if category:
            query["category"] = category
        if status_filter:
            query["status"] = status_filter
        if applies_to:
            query["appliesTo"] = applies_to
        if tag:
            query["tags"] = tag
        if search:
            query["$or"] = [
                {"title": {"$regex": search, "$options": "i"}},
                {"code": {"$regex": search, "$options": "i"}},
                {"purpose": {"$regex": search, "$options": "i"}},
            ]

        total = await db[PROTOCOLS].count_documents(query)
        cursor = db[PROTOCOLS].find(query).sort("code", 1).skip(skip).limit(limit)
        return [_doc_to_model(d) async for d in cursor], total

    @staticmethod
    async def for_scope(scope: str) -> List[Protocol]:
        """Active protocols bound to a scope tag.

        This is what puts the cloning SOP inside the Propagate modal. Only
        ACTIVE protocols are returned — offering a draft or a retired procedure
        at the point of work is the failure an SOP system exists to prevent.
        """
        db = protocols_db.get_database()
        cursor = db[PROTOCOLS].find(
            {"appliesTo": scope, "status": ProtocolStatus.ACTIVE.value}
        ).sort("code", 1)
        return [_doc_to_model(d) async for d in cursor]

    # -----------------------------------------------------------------------
    # Update
    # -----------------------------------------------------------------------

    @staticmethod
    async def update_protocol(protocol_id: str, data: ProtocolUpdate) -> Protocol:
        existing = await ProtocolService.get_protocol(protocol_id)

        fields = data.model_dump(exclude_unset=True, exclude_none=True)
        if not fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        db = protocols_db.get_database()

        if "code" in fields:
            new_code = _normalise_code(fields["code"])
            clash = await db[PROTOCOLS].find_one(
                {"code": new_code, _ID_KEY: {"$ne": protocol_id}}, {"_id": 1}
            )
            if clash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A protocol with code '{new_code}' already exists",
                )
            fields["code"] = new_code

        if "steps" in fields:
            fields["steps"] = ProtocolService._renumber(fields["steps"])

        if _CONTENT_FIELDS & set(fields.keys()):
            fields["version"] = existing.version + 1
            # A changed procedure is no longer the one that was signed off.
            if existing.status == ProtocolStatus.ACTIVE:
                fields["status"] = ProtocolStatus.DRAFT.value
                fields["approvedBy"] = None
                fields["approvedByName"] = None
                fields["approvedAt"] = None
                logger.info(
                    f"[ProtocolService] {existing.code} content changed — "
                    f"v{existing.version} -> v{fields['version']}, returned to draft "
                    f"pending re-approval"
                )

        fields["updatedAt"] = datetime.utcnow()
        await db[PROTOCOLS].update_one({_ID_KEY: protocol_id}, {"$set": fields})
        return await ProtocolService.get_protocol(protocol_id)

    # -----------------------------------------------------------------------
    # Approval
    # -----------------------------------------------------------------------

    @staticmethod
    async def approve(
        protocol_id: str, data: ApprovalRequest, current_user: Any
    ) -> Protocol:
        """Sign off the current version, making it usable at the bench."""
        protocol = await ProtocolService.get_protocol(protocol_id)

        if not protocol.steps:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot approve a protocol with no steps",
            )
        if protocol.status == ProtocolStatus.RETIRED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Retired protocols cannot be approved; create a replacement",
            )

        db = protocols_db.get_database()
        await db[PROTOCOLS].update_one(
            {_ID_KEY: protocol_id},
            {
                "$set": {
                    "status": ProtocolStatus.ACTIVE.value,
                    "approvedBy": getattr(current_user, "userId", None),
                    "approvedByName": data.approvedByName
                    or f"{getattr(current_user, 'firstName', '')} "
                       f"{getattr(current_user, 'lastName', '')}".strip()
                    or None,
                    "approvedAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow(),
                }
            },
        )
        logger.info(
            f"[ProtocolService] {protocol.code} v{protocol.version} approved by "
            f"{getattr(current_user, 'userId', None)}"
        )
        return await ProtocolService.get_protocol(protocol_id)

    # -----------------------------------------------------------------------
    # Reference building
    # -----------------------------------------------------------------------

    @staticmethod
    async def build_ref(protocol_id: str) -> ProtocolRef:
        """Snapshot a protocol into a pinned reference for a work record.

        Callers store the returned ref rather than a bare id, so the version
        that was followed stays readable after the protocol moves on.
        """
        protocol = await ProtocolService.get_protocol(protocol_id)
        return ProtocolRef(
            protocolId=protocol.id,
            code=protocol.code,
            title=protocol.title,
            version=protocol.version,
            followedAt=datetime.utcnow(),
        )
