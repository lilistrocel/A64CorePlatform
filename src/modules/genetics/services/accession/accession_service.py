"""
Genetics Repo Module - Accession Service

CRUD for ``genetic_accessions`` plus accession-code minting and the batch
split operation.

Accessions created by a propagation come through ``PropagationService``;
this service handles founding material registered by hand and everything
that happens to an accession afterwards.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from ...models.accession import (
    Accession,
    AccessionCreate,
    AccessionSplit,
    AccessionUpdate,
)
from ...models.enums import AccessionStatus
from ..common import (
    build_accession_code,
    doc_to_model,
    generate_public_token,
    generation_label,
    model_to_doc,
    scope_fields,
    slugify_code,
)
from ..database import ACCESSIONS, genetics_db
from ..line.line_service import LineService

logger = logging.getLogger(__name__)

_ID_KEY = "accessionId"

# Guard against an unbounded retry loop if code generation keeps colliding.
_MAX_CODE_ATTEMPTS = 50

# publicToken has a ~1.1e15 space (T-804) — a real collision on insert would
# be a near-impossible coincidence, but an unhandled 500 on the create path
# is still not acceptable, so a small bounded retry covers it.
_MAX_TOKEN_ATTEMPTS = 5


def _is_public_token_collision(error: DuplicateKeyError) -> bool:
    """Distinguish a publicToken unique-index collision from any other
    duplicate-key error (accessionId, accessionCode) so only the former is
    retried here — the latter already has its own handling upstream."""
    key_pattern = (
        (error.details or {}).get("keyPattern", {}) if hasattr(error, "details") else {}
    )
    if "publicToken" in key_pattern:
        return True
    return "publicToken" in str(error)


class AccessionService:
    """Service for managing physical genetic material."""

    # -----------------------------------------------------------------------
    # Code generation
    # -----------------------------------------------------------------------

    @staticmethod
    async def mint_code(
        line_code: str,
        clone_generation: int,
        filial_generation: int,
    ) -> str:
        """Generate the next free accession code for a line/generation pair.

        The sequence restarts per generation, so codes read
        ``PO-BLU-G1-001 … PO-BLU-G1-008``. Uniqueness is enforced by a unique
        index on ``accessionCode``; this loop only avoids the obvious
        collisions so inserts rarely bounce.
        """
        db = genetics_db.get_database()

        # Codes are slugified to [A-Z0-9-], so the prefix carries no regex
        # metacharacters and can be anchored directly.
        prefix = (
            f"{slugify_code(line_code)}-"
            f"{generation_label(clone_generation, filial_generation)}-"
        )
        prefix_count = await db[ACCESSIONS].count_documents(
            {"accessionCode": {"$regex": f"^{prefix}"}}
        )

        sequence = prefix_count + 1
        for _ in range(_MAX_CODE_ATTEMPTS):
            candidate = build_accession_code(
                line_code, clone_generation, filial_generation, sequence
            )
            exists = await db[ACCESSIONS].find_one(
                {"accessionCode": candidate}, {"_id": 1}
            )
            if not exists:
                return candidate
            sequence += 1

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate a unique accession code",
        )

    # -----------------------------------------------------------------------
    # Create
    # -----------------------------------------------------------------------

    @staticmethod
    async def create_accession(data: AccessionCreate, current_user: Any) -> Accession:
        """Register founding material by hand (a G0, or an outside acquisition)."""
        line = await LineService.get_line(data.lineId)
        db = genetics_db.get_database()

        payload = data.model_dump()
        supplied_code = payload.pop("accessionCode", None)

        code = supplied_code or await AccessionService.mint_code(
            line.code, data.cloneGeneration, data.filialGeneration
        )

        if supplied_code:
            clash = await db[ACCESSIONS].find_one({"accessionCode": code}, {"_id": 1})
            if clash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Accession code '{code}' is already in use",
                )

        accession = Accession(
            **payload,
            accessionCode=code,
            **scope_fields(current_user),
        )

        for attempt in range(_MAX_TOKEN_ATTEMPTS):
            try:
                await db[ACCESSIONS].insert_one(model_to_doc(accession, _ID_KEY))
                break
            except DuplicateKeyError as e:
                if (
                    not _is_public_token_collision(e)
                    or attempt == _MAX_TOKEN_ATTEMPTS - 1
                ):
                    logger.error(f"[AccessionService] insert_one failed: {e}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create accession",
                    )
                logger.warning(
                    "[AccessionService] publicToken collision on create "
                    f"(attempt {attempt + 1}/{_MAX_TOKEN_ATTEMPTS}), regenerating"
                )
                accession.publicToken = generate_public_token()
            except Exception as e:
                logger.error(f"[AccessionService] insert_one failed: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create accession",
                )

        logger.info(
            f"[AccessionService] Created accession {accession.accessionCode} "
            f"on line {line.code} by user {getattr(current_user, 'userId', None)}"
        )
        return accession

    # -----------------------------------------------------------------------
    # Read
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_accession(accession_id: str) -> Accession:
        db = genetics_db.get_database()
        doc = await db[ACCESSIONS].find_one({_ID_KEY: accession_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Accession '{accession_id}' not found",
            )
        return doc_to_model(doc, Accession, _ID_KEY)

    @staticmethod
    async def get_by_code(accession_code: str) -> Accession:
        """Look an accession up by its printed code — the barcode-scan path."""
        db = genetics_db.get_database()
        doc = await db[ACCESSIONS].find_one({"accessionCode": accession_code})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Accession code '{accession_code}' not found",
            )
        return doc_to_model(doc, Accession, _ID_KEY)

    @staticmethod
    async def list_accessions(
        skip: int = 0,
        limit: int = 20,
        line_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        form: Optional[str] = None,
        medium_batch_id: Optional[str] = None,
        room_id: Optional[str] = None,
        facility_id: Optional[str] = None,
        search: Optional[str] = None,
        generation: Optional[int] = None,
        active_only: bool = False,
    ) -> Tuple[List[Accession], int]:
        db = genetics_db.get_database()

        query: Dict[str, Any] = {}
        if line_id:
            query["lineId"] = line_id
        if status_filter:
            query["status"] = status_filter
        elif active_only:
            query["status"] = AccessionStatus.ACTIVE.value
        if form:
            query["form"] = form
        if medium_batch_id:
            query["mediumBatchId"] = medium_batch_id
        if room_id:
            query["location.roomId"] = room_id
        if facility_id:
            query["location.facilityId"] = facility_id
        if generation is not None:
            query["cloneGeneration"] = generation
        if search:
            query["$or"] = [
                {"accessionCode": {"$regex": search, "$options": "i"}},
                {"label": {"$regex": search, "$options": "i"}},
            ]

        total = await db[ACCESSIONS].count_documents(query)
        cursor = (
            db[ACCESSIONS]
            .find(query)
            .sort([("cloneGeneration", 1), ("accessionCode", 1)])
            .skip(skip)
            .limit(limit)
        )

        accessions: List[Accession] = []
        async for doc in cursor:
            accessions.append(doc_to_model(doc, Accession, _ID_KEY))

        return accessions, total

    @staticmethod
    async def list_children(accession_id: str) -> List[Accession]:
        """Direct descendants of an accession, in generation order."""
        db = genetics_db.get_database()
        cursor = (
            db[ACCESSIONS]
            .find({"parents.accessionId": accession_id})
            .sort("accessionCode", 1)
        )
        return [doc_to_model(doc, Accession, _ID_KEY) async for doc in cursor]

    # -----------------------------------------------------------------------
    # Update
    # -----------------------------------------------------------------------

    @staticmethod
    async def update_accession(accession_id: str, data: AccessionUpdate) -> Accession:
        await AccessionService.get_accession(accession_id)

        update_fields = data.model_dump(exclude_unset=True, exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        # Discarding is a terminal state worth stamping, so the timeline shows
        # when material actually left the lab rather than when the row changed.
        if update_fields.get("status") in (
            AccessionStatus.DISCARDED.value,
            AccessionStatus.CONSUMED.value,
        ):
            update_fields.setdefault("discardedAt", datetime.utcnow())

        update_fields["updatedAt"] = datetime.utcnow()

        db = genetics_db.get_database()
        await db[ACCESSIONS].update_one(
            {_ID_KEY: accession_id}, {"$set": update_fields}
        )

        logger.info(
            f"[AccessionService] Updated accession {accession_id}: {list(update_fields.keys())}"
        )
        return await AccessionService.get_accession(accession_id)

    # -----------------------------------------------------------------------
    # Split
    # -----------------------------------------------------------------------

    @staticmethod
    async def split_accession(
        accession_id: str,
        data: AccessionSplit,
        current_user: Any,
    ) -> Tuple[Accession, Accession]:
        """Move N vessels out of a batch record into their own accession.

        This is not a propagation — no new generation, no new genetics. It is
        the same material tracked separately because one vessel diverged.
        Generations and parents are copied verbatim so the lineage is unbroken.

        Returns the (updated parent batch, new split-off accession).
        """
        source = await AccessionService.get_accession(accession_id)

        if data.quantity > source.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot split {data.quantity} out of {source.quantity} "
                    f"{source.unit} held by {source.accessionCode}"
                ),
            )
        if data.quantity == source.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Splitting the entire batch would leave an empty record; "
                    "update the accession directly instead"
                ),
            )

        # T-804 — vessel-ordinal validation. vesselNumbers is optional; an
        # empty list means "unnumbered split" and none of these checks run,
        # matching the behaviour of every caller that predates this field.
        # See genetics-label-qr-spec.md §3-4.1 for why the ordinal cannot be
        # derived from quantity.
        if data.vesselNumbers:
            if len(data.vesselNumbers) != data.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"vesselNumbers {sorted(data.vesselNumbers)} names "
                        f"{len(data.vesselNumbers)} ordinal(s) but quantity is "
                        f"{data.quantity} — one ordinal must be named per "
                        f"vessel being split"
                    ),
                )

            out_of_range = sorted(
                n for n in data.vesselNumbers if n < 1 or n > source.labelledVesselCount
            )
            if out_of_range:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Ordinal(s) {out_of_range} are outside the labelled "
                        f"range 1..{source.labelledVesselCount} for "
                        f"{source.accessionCode}"
                    ),
                )

            claimed = await AccessionService._claimed_vessel_numbers(source.id)
            already_claimed = sorted(set(data.vesselNumbers) & claimed)
            if already_claimed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Ordinal(s) {already_claimed} are already claimed by "
                        f"a sibling split of {source.accessionCode}"
                    ),
                )

            seen: set = set()
            duplicates = sorted(
                {n for n in data.vesselNumbers if n in seen or seen.add(n)}
            )
            if duplicates:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"vesselNumbers contains duplicate ordinal(s): {duplicates}",
                )

        line = await LineService.get_line(source.lineId)
        db = genetics_db.get_database()

        new_code = await AccessionService.mint_code(
            line.code, source.cloneGeneration, source.filialGeneration
        )

        child = Accession(
            lineId=source.lineId,
            accessionCode=new_code,
            cloneGeneration=source.cloneGeneration,
            filialGeneration=source.filialGeneration,
            parents=source.parents,
            provenance=source.provenance,
            form=source.form,
            quantity=data.quantity,
            unit=source.unit,
            mediumBatchId=source.mediumBatchId,
            location=source.location,
            acquiredAt=source.acquiredAt,
            colonizedAt=source.colonizedAt,
            label=data.label or source.label,
            notes=data.reason,
            tags=list(source.tags),
            status=data.status or source.status,
            sourceEventId=source.sourceEventId,
            splitFromAccessionId=source.id,
            sourceVesselNumbers=list(data.vesselNumbers),
            **scope_fields(current_user),
        )

        await db[ACCESSIONS].insert_one(model_to_doc(child, _ID_KEY))
        await db[ACCESSIONS].update_one(
            {_ID_KEY: accession_id},
            {
                "$inc": {"quantity": -data.quantity},
                "$set": {"updatedAt": datetime.utcnow()},
            },
        )

        logger.info(
            f"[AccessionService] Split {data.quantity} {source.unit} out of "
            f"{source.accessionCode} into {child.accessionCode}"
        )

        updated_source = await AccessionService.get_accession(accession_id)
        return updated_source, child

    @staticmethod
    async def _claimed_vessel_numbers(source_id: str) -> set:
        """Union of ``sourceVesselNumbers`` across every existing split of
        ``source_id`` — the set of ordinals a new sibling split may not reuse.

        T-804: a projection-only query, not ``get_many`` / ``list_children``,
        because callers here only need the ordinal lists, not full documents.
        """
        db = genetics_db.get_database()
        claimed: set = set()
        cursor = db[ACCESSIONS].find(
            {"splitFromAccessionId": source_id},
            {"sourceVesselNumbers": 1},
        )
        async for doc in cursor:
            claimed.update(doc.get("sourceVesselNumbers") or [])
        return claimed

    # -----------------------------------------------------------------------
    # Room occupancy
    # -----------------------------------------------------------------------

    @staticmethod
    async def room_occupancy(
        facility_id: Optional[str] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Summarise what is physically held in each room.

        Returns ``{roomId: {vessels, records, byForm: {...}}}`` in one
        aggregation, so a facility page can annotate every room from a single
        request rather than one per room.

        Only live material is counted — discarded and consumed records would
        otherwise make a long-running lab look permanently full.
        """
        db = genetics_db.get_database()

        match: Dict[str, Any] = {
            "location.roomId": {"$ne": None},
            "status": {
                "$nin": [
                    AccessionStatus.DISCARDED.value,
                    AccessionStatus.CONSUMED.value,
                ]
            },
        }
        if facility_id:
            match["location.facilityId"] = facility_id

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {"room": "$location.roomId", "form": "$form"},
                    "vessels": {"$sum": "$quantity"},
                    "records": {"$sum": 1},
                }
            },
        ]

        out: Dict[str, Dict[str, Any]] = {}
        async for row in db[ACCESSIONS].aggregate(pipeline):
            room_id = row["_id"]["room"]
            form = row["_id"]["form"]
            entry = out.setdefault(room_id, {"vessels": 0, "records": 0, "byForm": {}})
            entry["vessels"] += row["vessels"]
            entry["records"] += row["records"]
            entry["byForm"][form] = entry["byForm"].get(form, 0) + row["vessels"]
        return out

    # -----------------------------------------------------------------------
    # Helpers used by other services
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_many(accession_ids: List[str]) -> Dict[str, Accession]:
        """Fetch several accessions by id in one round trip."""
        if not accession_ids:
            return {}
        db = genetics_db.get_database()
        cursor = db[ACCESSIONS].find({_ID_KEY: {"$in": list(set(accession_ids))}})
        return {
            doc[_ID_KEY]: doc_to_model(doc, Accession, _ID_KEY) async for doc in cursor
        }
