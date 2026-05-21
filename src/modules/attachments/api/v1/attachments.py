"""
Attachments Module — REST API v1

Provides a unified, doc-type-agnostic attachment surface for the five P2P
document types: PR, PO, GR, AP, and PAYMENT.

Endpoints
---------
POST   /api/v1/attachments/{doc_type}/{doc_id}
    Upload a file (multipart/form-data, field 'file' + optional 'description').
    Returns 201 SuccessResponse<AttachmentMetadata>.

GET    /api/v1/attachments/{doc_type}/{doc_id}
    List all non-deleted attachments for a document.
    Returns SuccessResponse<List[AttachmentMetadata]>.

GET    /api/v1/attachments/file/{file_id}
    Stream the raw file bytes.
    Supports HTTP Range header for partial content (browser PDF viewers).
    Returns 200 (full) or 206 (partial) binary response.

GET    /api/v1/attachments/file/{file_id}/info
    Return metadata only (no binary body).
    Returns SuccessResponse<AttachmentMetadata>.

DELETE /api/v1/attachments/file/{file_id}
    Soft-delete (sets deletedAt; file stays on disk).
    Returns 204 No Content.

Auth
----
All endpoints require a valid JWT via the existing get_current_active_user
dependency.  organisation_id is always the caller's own org extracted from the
JWT — passing a different org_id than the JWT's org raises 403.

PAYMENT exception
-----------------
PAYMENT documents are always mutable for attachment operations (add/delete).
Payment records have no Draft state — accountants must be able to attach
bank-confirmation PDFs after the payment has been posted.  This exception is
enforced in AttachmentService._assert_document_exists_and_is_draft which skips
the mutability check for PAYMENT doctype entirely.

Range request support
---------------------
The file download endpoint parses the Range header (bytes=start-end) and
responds with 206 Partial Content for valid single-byte ranges.  Multi-range
requests are not supported (respond with full content instead).  This satisfies
browser PDF viewers (Chrome, Safari) which send a Range: bytes=0-1 probe and
then Range: bytes=0-{total} for full rendering.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

from src.modules.farm_manager.middleware.auth import CurrentUser, get_current_active_user
from src.modules.farm_manager.utils.responses import SuccessResponse
from src.modules.farm_manager.services.database import farm_db
from src.config.settings import settings

from ...models.attachment import (
    ALLOWED_MIME_TYPES,
    MAX_ATTACHMENT_SIZE_BYTES,
    AttachmentDocType,
    AttachmentMetadata,
)
from ...services.attachment_service import AttachmentService
from ...storage.local import LocalStorageBackend
from ...utils.range_parser import parse_range_header

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Attachments"])

# ---------------------------------------------------------------------------
# Roles allowed to interact with attachments
# All authenticated users can download/list; upload/delete is restricted.
# ---------------------------------------------------------------------------

_ATTACHMENT_READ_ROLES = frozenset({
    "procurement_officer",
    "procurement_manager",
    "admin",
    "super_admin",
    "accountant",
    "finance_admin",
    "auditor",
    "moderator",
    "user",
})

_ATTACHMENT_WRITE_ROLES = frozenset({
    "procurement_officer",
    "procurement_manager",
    "admin",
    "super_admin",
    "accountant",
    "finance_admin",
})


def _require_org(user: CurrentUser) -> str:
    """
    Extract and validate the organisation ID from the JWT.

    Args:
        user: Authenticated CurrentUser from the JWT.

    Returns:
        Organisation UUID string.

    Raises:
        HTTPException: 400 if the user has no organisation.
    """
    if not user.organizationId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not belong to any organisation",
        )
    return user.organizationId


def _assert_org_matches(user_org: str, requested_org: str) -> None:
    """
    Ensure the caller's org matches the requested organization_id parameter.

    Args:
        user_org: Organisation UUID from the JWT.
        requested_org: organisation_id query parameter from the request.

    Raises:
        HTTPException: 403 if the orgs don't match.
    """
    if user_org != requested_org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: organisation mismatch",
        )


def _get_service() -> AttachmentService:
    """
    Build and return the AttachmentService with the runtime database and storage.

    Returns:
        AttachmentService instance.
    """
    db = farm_db.get_database()
    storage = LocalStorageBackend(settings.ATTACHMENT_STORAGE_ROOT)
    return AttachmentService(db=db, storage=storage)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{doc_type}/{doc_id}",
    response_model=SuccessResponse[AttachmentMetadata],
    status_code=status.HTTP_201_CREATED,
    summary="Upload attachment",
    description=(
        "Upload a file attachment to a document. "
        "Accepted formats: PDF, JPEG, PNG, WebP. Maximum size: 10 MB. "
        "Documents become read-only for attachments once submitted for approval "
        "(except PAYMENT documents which are always mutable)."
    ),
)
async def upload_attachment(
    doc_type: AttachmentDocType,
    doc_id: str,
    organization_id: str = Query(..., description="Organisation UUID (must match caller's org)"),
    file: UploadFile = File(..., description="File to attach (PDF, JPEG, PNG, WebP; max 10 MB)"),
    description: Optional[str] = Form(None, max_length=500, description="Optional note"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[AttachmentMetadata]:
    """
    Upload a new attachment to a document.

    Validates mime type (whitelist), size (10 MB cap), organisation ownership,
    and document mutability before persisting.

    Args:
        doc_type: One of PR, PO, GR, AP, PAYMENT.
        doc_id: UUID of the parent document.
        organization_id: Must match the caller's JWT organisation.
        file: Multipart file upload.
        description: Optional free-text note (max 500 chars).
        current_user: Injected authenticated user.

    Returns:
        201 SuccessResponse with AttachmentMetadata.

    Raises:
        HTTPException 400: User has no organisation.
        HTTPException 403: Organisation mismatch or insufficient role.
        HTTPException 404: Source document not found.
        HTTPException 409: Document is not in Draft status.
        HTTPException 413: File exceeds 10 MB.
        HTTPException 415: MIME type not in whitelist.
    """
    user_org = _require_org(current_user)
    _assert_org_matches(user_org, organization_id)

    if current_user.role not in _ATTACHMENT_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to upload attachments",
        )

    # Read upload into memory (size cap enforced after read)
    file_data = await file.read()

    # Validate size
    if len(file_data) > MAX_ATTACHMENT_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size {len(file_data)} bytes exceeds the 10 MB limit",
        )

    # Validate mime type via whitelist
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type: {content_type!r}. "
                f"Allowed: application/pdf, image/jpeg, image/png, image/webp"
            ),
        )

    service = _get_service()
    try:
        metadata = await service.upload(
            organization_id=organization_id,
            doc_type=doc_type,
            doc_id=doc_id,
            uploaded_by=current_user.userId,
            file_data=file_data,
            original_filename=file.filename or "attachment",
            mime_type=content_type,
            description=description,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except OverflowError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)
        )

    return SuccessResponse(
        data=metadata,
        message="Attachment uploaded successfully",
    )


@router.get(
    "/{doc_type}/{doc_id}",
    response_model=SuccessResponse[List[AttachmentMetadata]],
    summary="List attachments",
    description="Return all non-deleted attachments for a document, newest first.",
)
async def list_attachments(
    doc_type: AttachmentDocType,
    doc_id: str,
    organization_id: str = Query(..., description="Organisation UUID (must match caller's org)"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[List[AttachmentMetadata]]:
    """
    List all non-deleted attachments for a document.

    Args:
        doc_type: One of PR, PO, GR, AP, PAYMENT.
        doc_id: UUID of the parent document.
        organization_id: Must match the caller's JWT organisation.
        current_user: Injected authenticated user.

    Returns:
        SuccessResponse with list of AttachmentMetadata, sorted newest first.
    """
    user_org = _require_org(current_user)
    _assert_org_matches(user_org, organization_id)

    service = _get_service()
    attachments = await service.list_attachments(
        organization_id=organization_id,
        doc_type=doc_type,
        doc_id=doc_id,
    )
    return SuccessResponse(
        data=attachments,
        message=f"{len(attachments)} attachment(s)",
    )


@router.get(
    "/file/{file_id}/info",
    response_model=SuccessResponse[AttachmentMetadata],
    summary="Get attachment metadata",
    description="Return metadata for a single attachment without the file body.",
)
async def get_attachment_info(
    file_id: str,
    organization_id: str = Query(..., description="Organisation UUID (must match caller's org)"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[AttachmentMetadata]:
    """
    Return metadata for a single attachment.

    Args:
        file_id: Attachment UUID.
        organization_id: Must match the caller's JWT organisation.
        current_user: Injected authenticated user.

    Returns:
        SuccessResponse with AttachmentMetadata.

    Raises:
        HTTPException 404: Attachment not found or already deleted.
    """
    user_org = _require_org(current_user)
    _assert_org_matches(user_org, organization_id)

    service = _get_service()
    try:
        metadata = await service.get_metadata(
            organization_id=organization_id,
            file_id=file_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    return SuccessResponse(data=metadata, message="Attachment metadata")


@router.get(
    "/file/{file_id}",
    summary="Download attachment",
    description=(
        "Stream the raw file content. Supports HTTP Range header for partial "
        "downloads (browser PDF viewers). Responds with 206 for valid range requests."
    ),
    responses={
        200: {"description": "Full file content"},
        206: {"description": "Partial file content (Range request)"},
        404: {"description": "Attachment not found"},
    },
)
async def download_attachment(
    file_id: str,
    organization_id: str = Query(..., description="Organisation UUID (must match caller's org)"),
    range_header: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> Response:
    """
    Stream a file attachment, with optional Range support.

    The Range header (bytes=start-end) enables in-browser PDF rendering.
    Chrome/Safari PDF viewers issue a Range: bytes=0-1 probe followed by a
    full-range request.  This endpoint supports single-range byte requests.

    Args:
        file_id: Attachment UUID.
        organization_id: Must match the caller's JWT organisation.
        range_header: Optional HTTP Range header value (parsed from request).
        current_user: Injected authenticated user.

    Returns:
        200 Response with full content, or 206 for a valid Range request.

    Raises:
        HTTPException 404: Attachment not found.
        HTTPException 416: Range not satisfiable.
    """
    from fastapi import Request

    user_org = _require_org(current_user)
    _assert_org_matches(user_org, organization_id)

    service = _get_service()
    try:
        data, metadata = await service.download(
            organization_id=organization_id,
            file_id=file_id,
        )
    except (LookupError, FileNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    total_size = len(data)
    content_type = metadata.mimeType
    safe_filename = metadata.originalFilename.replace('"', '\\"')

    # Reason: Range header handling for browser PDF viewers
    if range_header:
        parsed = parse_range_header(range_header, total_size)
        if parsed is None:
            # Reason: return 416 Range Not Satisfiable for malformed/out-of-bounds range
            return Response(
                status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{total_size}"},
            )
        start, end = parsed
        chunk = data[start:end + 1]
        return Response(
            content=chunk,
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{total_size}",
                "Content-Length": str(len(chunk)),
                "Content-Disposition": f'inline; filename="{safe_filename}"',
                "Accept-Ranges": "bytes",
            },
        )

    return Response(
        content=data,
        status_code=status.HTTP_200_OK,
        media_type=content_type,
        headers={
            "Content-Length": str(total_size),
            "Content-Disposition": f'inline; filename="{safe_filename}"',
            "Accept-Ranges": "bytes",
        },
    )


@router.delete(
    "/file/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete attachment",
    description=(
        "Soft-delete an attachment. Sets deletedAt on the MongoDB record; "
        "the file is kept on disk. Rejected for documents not in Draft status "
        "(except PAYMENT documents which are always mutable)."
    ),
)
async def delete_attachment(
    file_id: str,
    organization_id: str = Query(..., description="Organisation UUID (must match caller's org)"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> Response:
    """
    Soft-delete an attachment.

    Args:
        file_id: Attachment UUID to delete.
        organization_id: Must match the caller's JWT organisation.
        current_user: Injected authenticated user.

    Returns:
        204 No Content on success.

    Raises:
        HTTPException 403: Insufficient role or organisation mismatch.
        HTTPException 404: Attachment not found.
        HTTPException 409: Source document is no longer in Draft status.
    """
    user_org = _require_org(current_user)
    _assert_org_matches(user_org, organization_id)

    if current_user.role not in _ATTACHMENT_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to delete attachments",
        )

    service = _get_service()
    try:
        await service.soft_delete(
            organization_id=organization_id,
            file_id=file_id,
            deleted_by=current_user.userId,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Note: _parse_range_header is now parse_range_header in utils/range_parser.py
# and imported above. The function is kept there to allow independent unit testing
# without triggering the FastAPI/farm_manager import chain.
