"""
Purchasing Module — Payment Terms Service

Business logic for the payment_terms master collection.

Operations is the master for payment terms. Finance service only logs
receipt of change events.  Write operations are admin-only.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.payment_terms import (
    DEFAULT_PAYMENT_TERMS,
    PaymentTermsCreate,
    PaymentTermsResponse,
    PaymentTermsUpdate,
)

logger = logging.getLogger(__name__)

_COLLECTION = "payment_terms"


def _doc_to_response(doc: Dict[str, Any]) -> PaymentTermsResponse:
    """
    Convert a raw MongoDB document to a PaymentTermsResponse.

    Args:
        doc: Raw document from MongoDB.

    Returns:
        PaymentTermsResponse Pydantic model.
    """
    return PaymentTermsResponse(
        termsId=doc["termsId"],
        organizationId=doc["organizationId"],
        termsCode=doc["termsCode"],
        description=doc["description"],
        netDays=doc["netDays"],
        isActive=doc.get("isActive", True),
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
    )


class PaymentTermsService:
    """
    Service class for payment terms CRUD operations.

    Handles MongoDB interactions and outbox event emission.
    Seeds default terms on first access per organisation.
    """

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        """
        Initialise with an active Motor database instance.

        Args:
            db: Async Motor database instance.
        """
        self._col = db[_COLLECTION]
        self._db = db

    async def ensure_seeded(self, organization_id: str, created_by: str) -> None:
        """
        Seed default payment terms for an organisation on first use.

        Idempotent — does nothing if any terms already exist for the org.

        Args:
            organization_id: The organisation to seed terms for.
            created_by: User UUID string to attribute the seed to.
        """
        existing_count = await self._col.count_documents(
            {"organizationId": organization_id}
        )
        if existing_count > 0:
            return

        now = datetime.now(tz=timezone.utc)
        docs = []
        for term in DEFAULT_PAYMENT_TERMS:
            docs.append(
                {
                    "termsId": str(uuid.uuid4()),
                    "organizationId": organization_id,
                    "termsCode": term["termsCode"],
                    "description": term["description"],
                    "netDays": term["netDays"],
                    "isActive": True,
                    "createdAt": now,
                    "createdBy": created_by,
                    "updatedAt": now,
                }
            )

        if docs:
            await self._col.insert_many(docs)
            logger.info(
                "Seeded %d default payment terms for org=%s",
                len(docs),
                organization_id,
            )

    async def list_terms(
        self,
        organization_id: str,
        *,
        is_active: Optional[bool] = None,
    ) -> List[PaymentTermsResponse]:
        """
        Return all payment terms for an organisation.

        Ensures default seed exists before returning results.

        Args:
            organization_id: Filter terms to this org.
            is_active: Filter by active status if supplied.

        Returns:
            List of PaymentTermsResponse objects.
        """
        query: Dict[str, Any] = {"organizationId": organization_id}
        if is_active is not None:
            query["isActive"] = is_active

        cursor = self._col.find(query).sort("termsCode", 1)
        docs = await cursor.to_list(length=200)
        return [_doc_to_response(d) for d in docs]

    async def get_terms(
        self, organization_id: str, terms_id: str
    ) -> Optional[PaymentTermsResponse]:
        """
        Fetch a single payment terms record by termsId.

        Args:
            organization_id: Scopes the lookup to this org.
            terms_id: UUID string of the terms record.

        Returns:
            PaymentTermsResponse or None if not found.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "termsId": terms_id}
        )
        return _doc_to_response(doc) if doc else None

    async def create_terms(
        self,
        data: PaymentTermsCreate,
        created_by: str,
        company_code: str = "DEFAULT",
    ) -> PaymentTermsResponse:
        """
        Create a new payment terms record and emit outbox event.

        Args:
            data: Validated PaymentTermsCreate payload.
            created_by: UUID string of the creating user.
            company_code: Finance company code for outbox event routing.

        Returns:
            Created PaymentTermsResponse.

        Raises:
            ValueError: If termsCode already exists for the organisation.
        """
        org_id = str(data.organizationId)

        existing = await self._col.find_one(
            {"organizationId": org_id, "termsCode": data.termsCode}
        )
        if existing:
            raise ValueError(
                f"Terms code '{data.termsCode}' already exists in this organisation"
            )

        now = datetime.now(tz=timezone.utc)
        terms_id = str(uuid.uuid4())

        doc: Dict[str, Any] = {
            "termsId": terms_id,
            "organizationId": org_id,
            "termsCode": data.termsCode,
            "description": data.description,
            "netDays": data.netDays,
            "isActive": True,
            "createdAt": now,
            "createdBy": created_by,
            "updatedAt": now,
        }

        await self._col.insert_one(doc)
        await self._emit_event(
            terms_id=terms_id,
            doc=doc,
            organization_id=org_id,
            source_user_id=created_by,
            company_code=company_code,
            is_deleted=False,
        )

        logger.info("Created payment terms termsCode=%s org=%s", data.termsCode, org_id)
        return _doc_to_response(doc)

    async def update_terms(
        self,
        organization_id: str,
        terms_id: str,
        data: PaymentTermsUpdate,
        updated_by: str,
        company_code: str = "DEFAULT",
    ) -> Optional[PaymentTermsResponse]:
        """
        Partially update a payment terms record and emit outbox event.

        Args:
            organization_id: Scopes the update to this org.
            terms_id: UUID string of the terms to update.
            data: Partial update data.
            updated_by: UUID string of the updating user.
            company_code: Finance company code for outbox routing.

        Returns:
            Updated PaymentTermsResponse or None if not found.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "termsId": terms_id}
        )
        if not doc:
            return None

        now = datetime.now(tz=timezone.utc)
        updates: Dict[str, Any] = {"updatedAt": now}
        for field, value in data.model_dump(exclude_none=True).items():
            updates[field] = value

        await self._col.update_one({"termsId": terms_id}, {"$set": updates})
        updated_doc = await self._col.find_one({"termsId": terms_id})
        assert updated_doc is not None

        await self._emit_event(
            terms_id=terms_id,
            doc=updated_doc,
            organization_id=organization_id,
            source_user_id=updated_by,
            company_code=company_code,
            is_deleted=False,
        )

        return _doc_to_response(updated_doc)

    async def soft_delete_terms(
        self,
        organization_id: str,
        terms_id: str,
        deleted_by: str,
        company_code: str = "DEFAULT",
    ) -> bool:
        """
        Soft-delete a payment terms record by setting isActive=False.

        Args:
            organization_id: Scopes the deletion to this org.
            terms_id: UUID string of the terms to delete.
            deleted_by: UUID string of the deleting user.
            company_code: Finance company code for outbox routing.

        Returns:
            True if deleted, False if not found.
        """
        doc = await self._col.find_one(
            {"organizationId": organization_id, "termsId": terms_id}
        )
        if not doc:
            return False

        now = datetime.now(tz=timezone.utc)
        await self._col.update_one(
            {"termsId": terms_id},
            {"$set": {"isActive": False, "updatedAt": now}},
        )

        await self._emit_event(
            terms_id=terms_id,
            doc={**doc, "isActive": False},
            organization_id=organization_id,
            source_user_id=deleted_by,
            company_code=company_code,
            is_deleted=True,
        )

        logger.info(
            "Deactivated payment terms termsId=%s org=%s", terms_id, organization_id
        )
        return True

    async def _emit_event(
        self,
        *,
        terms_id: str,
        doc: Dict[str, Any],
        organization_id: str,
        source_user_id: str,
        company_code: str,
        is_deleted: bool,
    ) -> None:
        """Emit payment_terms_changed outbox event (best-effort)."""
        try:
            from src.modules.finance_bridge.outbox_writer import OutboxWriter

            payload = {
                "termsId": terms_id,
                "termsCode": doc["termsCode"],
                "description": doc["description"],
                "netDays": doc["netDays"],
                "isActive": doc.get("isActive", True),
                "isDeleted": is_deleted,
            }

            await OutboxWriter.publish(
                db=self._db,
                event_type="payment_terms_changed",
                organization_id=organization_id,
                company_code=company_code,
                payload=payload,
                source_user_id=source_user_id,
                source_document_id=terms_id,
            )
        except Exception as exc:
            logger.warning(
                "Failed to emit payment_terms_changed event for terms %s: %s",
                terms_id,
                exc,
            )
