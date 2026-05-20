"""
Purchasing Module — Vendor Service

Business logic for the vendor master collection.

All write operations emit a `vendor_changed` outbox event via OutboxWriter
on a best-effort basis (falls back gracefully if outbox is disabled).
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.vendor import VendorCreate, VendorResponse, VendorUpdate

logger = logging.getLogger(__name__)

_COLLECTION = "vendors"


def _next_vendor_code(existing_count: int) -> str:
    """
    Generate a sequential vendor code of the form VND-XXXXXX.

    Args:
        existing_count: Number of vendors already in the organisation.

    Returns:
        New vendor code string.
    """
    return f"VND-{(existing_count + 1):06d}"


def _doc_to_response(doc: Dict[str, Any]) -> VendorResponse:
    """
    Convert a raw MongoDB document to a VendorResponse.

    Args:
        doc: Raw document from MongoDB.

    Returns:
        VendorResponse Pydantic model.
    """
    return VendorResponse(
        vendorId=doc["vendorId"],
        organizationId=doc["organizationId"],
        vendorCode=doc["vendorCode"],
        name=doc["name"],
        trn=doc.get("trn"),
        addressLine1=doc.get("addressLine1"),
        addressLine2=doc.get("addressLine2"),
        city=doc.get("city"),
        country=doc.get("country", "United Arab Emirates"),
        contactName=doc.get("contactName"),
        contactEmail=doc.get("contactEmail"),
        contactPhone=doc.get("contactPhone"),
        paymentTermsCode=doc.get("paymentTermsCode"),
        currencyCode=doc.get("currencyCode", "AED"),
        creditLimit=doc.get("creditLimit"),
        bankDetails=doc.get("bankDetails"),
        notes=doc.get("notes"),
        isActive=doc.get("isActive", True),
        isBlocked=doc.get("isBlocked", False),
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
        deletedAt=doc.get("deletedAt"),
    )


class VendorService:
    """
    Service class for vendor master CRUD operations.

    Handles MongoDB interactions and outbox event emission for all vendor
    create / update / soft-delete flows.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        """
        Initialise with an active Motor database instance.

        Args:
            db: Async Motor database from the farm_db connection pool.
        """
        self._col = db[_COLLECTION]
        self._db = db

    # ------------------------------------------------------------------
    # Public CRUD methods
    # ------------------------------------------------------------------

    async def list_vendors(
        self,
        organization_id: str,
        *,
        page: int = 1,
        per_page: int = 20,
        search: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Return a paginated list of vendors for an organisation.

        Args:
            organization_id: Filter vendors to this org.
            page: Page number (1-based).
            per_page: Items per page.
            search: Optional substring match on name or vendorCode.
            is_active: Filter by active status if supplied.

        Returns:
            Dict with 'items' (list of VendorResponse), 'total', 'page',
            'perPage', 'totalPages'.
        """
        # Reason: only return non-deleted vendors by default
        query: Dict[str, Any] = {
            "organizationId": organization_id,
            "deletedAt": None,
        }
        if is_active is not None:
            query["isActive"] = is_active
        if search:
            # Reason: case-insensitive regex search on name and vendorCode
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"vendorCode": {"$regex": search, "$options": "i"}},
            ]

        total = await self._col.count_documents(query)
        offset = (page - 1) * per_page
        cursor = self._col.find(query).sort("vendorCode", 1).skip(offset).limit(per_page)
        docs = await cursor.to_list(length=per_page)

        return {
            "items": [_doc_to_response(d) for d in docs],
            "total": total,
            "page": page,
            "perPage": per_page,
            "totalPages": max(1, -(-total // per_page)),
        }

    async def get_vendor(self, organization_id: str, vendor_id: str) -> Optional[VendorResponse]:
        """
        Fetch a single vendor by vendorId.

        Args:
            organization_id: Scopes the lookup to prevent cross-org access.
            vendor_id: UUID string of the vendor.

        Returns:
            VendorResponse or None if not found / deleted.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "vendorId": vendor_id, "deletedAt": None}
        )
        return _doc_to_response(doc) if doc else None

    async def create_vendor(
        self,
        data: VendorCreate,
        created_by: str,
        company_code: str = "DEFAULT",
    ) -> VendorResponse:
        """
        Create a new vendor and emit vendor_changed outbox event.

        Args:
            data: Validated VendorCreate payload.
            created_by: UUID string of the creating user.
            company_code: Finance company code for outbox event routing.

        Returns:
            Created VendorResponse.

        Raises:
            ValueError: If vendorCode already exists for the organisation.
        """
        org_id = str(data.organizationId)

        # Auto-generate vendorCode if not supplied
        vendor_code = data.vendorCode
        if not vendor_code:
            count = await self._col.count_documents({"organizationId": org_id})
            vendor_code = _next_vendor_code(count)

        # Reason: unique constraint on (organizationId, vendorCode)
        existing = await self._col.find_one(
            {"organizationId": org_id, "vendorCode": vendor_code}
        )
        if existing:
            raise ValueError(f"Vendor code '{vendor_code}' already exists in this organisation")

        now = datetime.now(tz=timezone.utc)
        vendor_id = str(uuid.uuid4())

        doc: Dict[str, Any] = {
            "vendorId": vendor_id,
            "organizationId": org_id,
            "vendorCode": vendor_code,
            "name": data.name,
            "trn": data.trn,
            "addressLine1": data.addressLine1,
            "addressLine2": data.addressLine2,
            "city": data.city,
            "country": data.country,
            "contactName": data.contactName,
            "contactEmail": data.contactEmail,
            "contactPhone": data.contactPhone,
            "paymentTermsCode": data.paymentTermsCode,
            "currencyCode": data.currencyCode,
            "creditLimit": float(data.creditLimit) if data.creditLimit is not None else None,
            "bankDetails": data.bankDetails.model_dump() if data.bankDetails else None,
            "notes": data.notes,
            "isActive": True,
            "isBlocked": False,
            "createdAt": now,
            "createdBy": created_by,
            "updatedAt": now,
            "updatedBy": created_by,
            "deletedAt": None,
        }

        await self._col.insert_one(doc)

        # Emit outbox event (best-effort)
        await self._emit_event(
            event_type="vendor_changed",
            vendor_id=vendor_id,
            vendor_code=vendor_code,
            doc=doc,
            organization_id=org_id,
            source_user_id=created_by,
            company_code=company_code,
            is_deleted=False,
        )

        logger.info("Created vendor vendorCode=%s org=%s", vendor_code, org_id)
        return _doc_to_response(doc)

    async def update_vendor(
        self,
        organization_id: str,
        vendor_id: str,
        data: VendorUpdate,
        updated_by: str,
        company_code: str = "DEFAULT",
    ) -> Optional[VendorResponse]:
        """
        Partially update a vendor and emit vendor_changed outbox event.

        Args:
            organization_id: Scopes the update to this org.
            vendor_id: UUID string of the vendor to update.
            data: Partial update data.
            updated_by: UUID string of the updating user.
            company_code: Finance company code for outbox routing.

        Returns:
            Updated VendorResponse or None if not found.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "vendorId": vendor_id, "deletedAt": None}
        )
        if not doc:
            return None

        now = datetime.now(tz=timezone.utc)
        updates: Dict[str, Any] = {"updatedAt": now, "updatedBy": updated_by}

        # Only update fields that were explicitly supplied
        update_dict = data.model_dump(exclude_none=True)
        for field, value in update_dict.items():
            if field == "bankDetails" and value is not None:
                updates["bankDetails"] = value.model_dump() if hasattr(value, "model_dump") else value
            elif field == "creditLimit" and value is not None:
                updates["creditLimit"] = float(value)
            else:
                updates[field] = value

        await self._col.update_one(
            {"vendorId": vendor_id},
            {"$set": updates},
        )

        updated_doc = await self._col.find_one({"vendorId": vendor_id})
        assert updated_doc is not None

        # Emit outbox event (best-effort)
        await self._emit_event(
            event_type="vendor_changed",
            vendor_id=vendor_id,
            vendor_code=updated_doc["vendorCode"],
            doc=updated_doc,
            organization_id=organization_id,
            source_user_id=updated_by,
            company_code=company_code,
            is_deleted=False,
        )

        logger.info("Updated vendor vendorId=%s org=%s", vendor_id, organization_id)
        return _doc_to_response(updated_doc)

    async def soft_delete_vendor(
        self,
        organization_id: str,
        vendor_id: str,
        deleted_by: str,
        company_code: str = "DEFAULT",
    ) -> bool:
        """
        Soft-delete a vendor by setting deletedAt and isActive=False.

        Args:
            organization_id: Scopes the deletion to this org.
            vendor_id: UUID string of the vendor to delete.
            deleted_by: UUID string of the deleting user.
            company_code: Finance company code for outbox routing.

        Returns:
            True if deleted, False if vendor not found.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "vendorId": vendor_id, "deletedAt": None}
        )
        if not doc:
            return False

        now = datetime.now(tz=timezone.utc)
        await self._col.update_one(
            {"vendorId": vendor_id},
            {"$set": {"deletedAt": now, "isActive": False, "updatedAt": now, "updatedBy": deleted_by}},
        )

        # Emit soft-delete outbox event (best-effort)
        await self._emit_event(
            event_type="vendor_changed",
            vendor_id=vendor_id,
            vendor_code=doc["vendorCode"],
            doc={**doc, "isActive": False, "deletedAt": now},
            organization_id=organization_id,
            source_user_id=deleted_by,
            company_code=company_code,
            is_deleted=True,
        )

        logger.info("Soft-deleted vendor vendorId=%s org=%s", vendor_id, organization_id)
        return True

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _emit_event(
        self,
        *,
        event_type: str,
        vendor_id: str,
        vendor_code: str,
        doc: Dict[str, Any],
        organization_id: str,
        source_user_id: str,
        company_code: str,
        is_deleted: bool,
    ) -> None:
        """
        Emit a finance outbox event for a vendor change.

        Wraps OutboxWriter.publish() and swallows all exceptions so that
        outbox failures never break the vendor CRUD response.

        Args:
            event_type: Always 'vendor_changed'.
            vendor_id: UUID string of the vendor.
            vendor_code: Vendor code for the payload.
            doc: Full MongoDB document after the operation.
            organization_id: Org UUID string.
            source_user_id: Acting user UUID string.
            company_code: Finance company code.
            is_deleted: True if this is a soft-delete event.
        """
        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter

            payload = {
                "vendorId": vendor_id,
                "vendorCode": vendor_code,
                "name": doc["name"],
                "trn": doc.get("trn"),
                "isActive": doc.get("isActive", True),
                "paymentTermsCode": doc.get("paymentTermsCode"),
                "currencyCode": doc.get("currencyCode", "AED"),
                "creditLimit": str(doc["creditLimit"]) if doc.get("creditLimit") is not None else None,
                "bankDetails": doc.get("bankDetails"),
                "contactInfo": {
                    "contactName": doc.get("contactName"),
                    "contactEmail": doc.get("contactEmail"),
                    "contactPhone": doc.get("contactPhone"),
                } if any(doc.get(k) for k in ["contactName", "contactEmail", "contactPhone"]) else None,
                "isDeleted": is_deleted,
            }

            await OutboxWriter.publish(
                db=self._db,
                event_type=event_type,
                organization_id=organization_id,
                company_code=company_code,
                payload=payload,
                source_user_id=source_user_id,
                source_document_id=vendor_id,
            )
        except Exception as exc:
            # Reason: outbox failure must never block the business write
            logger.warning(
                "Failed to emit %s event for vendor %s: %s",
                event_type, vendor_id, exc,
            )
