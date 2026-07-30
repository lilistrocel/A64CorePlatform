"""
Genetics Repo Module - Protocol Linking

Resolves a protocol id into a pinned reference to store on a work record.

Reads the ``protocols`` collection directly rather than importing the protocols
service. Both modules are shared (``industries: ["all"]``) and always enabled,
so the dependency is safe, but keeping it at the data layer avoids a service
import cycle — protocols has no reason to know about genetics.

The reference is denormalised on purpose. Storing only an id would let the
displayed procedure drift away from the one actually followed the moment
someone revises the protocol, which is the exact failure the versioning exists
to prevent.
"""

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from .database import genetics_db

logger = logging.getLogger(__name__)

_PROTOCOLS = "protocols"


async def build_protocol_ref(protocol_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Snapshot the protocol's current version for storage on a work record.

    Returns None when no protocol was named — recording work without citing a
    procedure stays valid; it simply carries no compliance trail.
    """
    if not protocol_id:
        return None

    db = genetics_db.get_database()
    doc = await db[_PROTOCOLS].find_one({"protocolId": protocol_id})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Protocol '{protocol_id}' not found",
        )

    if doc.get("status") != "active":
        # Citing a draft or retired procedure as the one followed would make the
        # compliance trail worse than having none.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Protocol '{doc.get('code')}' is {doc.get('status')}, not active. "
                f"Only an approved procedure can be recorded as followed."
            ),
        )

    return {
        "protocolId": protocol_id,
        "code": doc.get("code"),
        "title": doc.get("title"),
        "version": doc.get("version", 1),
        "followedAt": datetime.utcnow(),
    }
