"""
Protocols Module - API Routes

CRUD for standard operating procedures, plus the scope lookup that surfaces a
procedure at the point of work and the approval step that makes it usable.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status

from ...models.protocol import (
    ApprovalRequest,
    Protocol,
    ProtocolCreate,
    ProtocolRef,
    ProtocolUpdate,
)
from ...services.protocol.protocol_service import ProtocolService
from ...utils.responses import PaginatedResponse, SuccessResponse, paginate

from ...middleware.auth import CurrentUser, require_permission, require_view

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "",
    response_model=SuccessResponse[Protocol],
    status_code=status.HTTP_201_CREATED,
    summary="Create a protocol",
    description="Draft a new standard operating procedure. Starts as a draft.",
)
async def create_protocol(
    payload: ProtocolCreate,
    current_user: CurrentUser = Depends(require_permission("protocols.author")),
) -> SuccessResponse[Protocol]:
    protocol = await ProtocolService.create_protocol(payload, current_user)
    return SuccessResponse(data=protocol, message="Protocol created as a draft")


@router.get(
    "",
    response_model=PaginatedResponse[Protocol],
    summary="List protocols",
)
async def list_protocols(
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    category: Optional[str] = Query(None),
    status_: Optional[str] = Query(None, alias="status"),
    appliesTo: Optional[str] = Query(None, description="Scope tag, e.g. propagation:agar_to_agar"),
    tag: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Match title, code or purpose"),
    current_user: CurrentUser = Depends(require_view),
) -> PaginatedResponse[Protocol]:
    protocols, total = await ProtocolService.list_protocols(
        skip=(page - 1) * perPage,
        limit=perPage,
        category=category,
        status_filter=status_,
        applies_to=appliesTo,
        tag=tag,
        search=search,
    )
    return PaginatedResponse(data=protocols, meta=paginate(total, page, perPage))


@router.get(
    # Declared before /{protocol_id} so the literal path is not swallowed.
    "/for-scope/{scope}",
    response_model=SuccessResponse[List[Protocol]],
    summary="Active protocols that apply here",
    description=(
        "Protocols bound to a scope tag, e.g. 'propagation:agar_to_agar' or "
        "'media:pour'. This is what surfaces the right SOP inside the modal "
        "where the work is being recorded. Only ACTIVE protocols are returned — "
        "offering a draft or retired procedure at the bench is the failure an "
        "SOP system exists to prevent."
    ),
)
async def protocols_for_scope(
    scope: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[List[Protocol]]:
    return SuccessResponse(data=await ProtocolService.for_scope(scope))


@router.get(
    "/{protocol_id}",
    response_model=SuccessResponse[Protocol],
    summary="Get a protocol",
)
async def get_protocol(
    protocol_id: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[Protocol]:
    return SuccessResponse(data=await ProtocolService.get_protocol(protocol_id))


@router.get(
    "/{protocol_id}/ref",
    response_model=SuccessResponse[ProtocolRef],
    summary="Pin the current version as a reference",
    description=(
        "Returns a denormalised snapshot (code, title, version) to store on a "
        "work record, so the version followed stays readable after the "
        "protocol is revised."
    ),
)
async def get_protocol_ref(
    protocol_id: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[ProtocolRef]:
    return SuccessResponse(data=await ProtocolService.build_ref(protocol_id))


@router.patch(
    "/{protocol_id}",
    response_model=SuccessResponse[Protocol],
    summary="Update a protocol",
    description=(
        "Editing the procedure itself (steps, materials, PPE, safety, purpose, "
        "scope) bumps the version and returns an approved protocol to draft — "
        "a changed procedure is no longer the one that was signed off. "
        "Renaming or re-tagging does neither."
    ),
)
async def update_protocol(
    protocol_id: str,
    payload: ProtocolUpdate,
    current_user: CurrentUser = Depends(require_permission("protocols.author")),
) -> SuccessResponse[Protocol]:
    protocol = await ProtocolService.update_protocol(protocol_id, payload)
    return SuccessResponse(data=protocol, message="Protocol updated")


@router.post(
    "/{protocol_id}/approve",
    response_model=SuccessResponse[Protocol],
    summary="Approve the current version",
    description="Signs off the current version and makes it usable at the bench.",
)
async def approve_protocol(
    protocol_id: str,
    payload: ApprovalRequest,
    current_user: CurrentUser = Depends(require_permission("protocols.approve")),
) -> SuccessResponse[Protocol]:
    protocol = await ProtocolService.approve(protocol_id, payload, current_user)
    return SuccessResponse(
        data=protocol, message=f"{protocol.code} v{protocol.version} approved"
    )
