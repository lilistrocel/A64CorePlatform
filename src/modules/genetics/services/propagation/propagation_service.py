"""
Genetics Repo Module - Propagation Service

Performs propagations: derives generation numbers, mints child accessions,
and writes the event that ties parents to children.

This is where the G/F rules live:

* asexual method -> child G = max(parent G) + 1, F inherited from the parents
* sexual method  -> child F = max(parent F) + 1, G resets to 0

The reset is the point. A spore print taken off a G5 fruit produces a fresh
genetic individual with no accumulated senescence, so it starts again at G0
one filial generation on. Tissue-cloning that same fruit is G6.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Tuple

from fastapi import HTTPException, status

from ...models.accession import Accession, ParentRef, StorageLocation
from ...models.enums import PropagationMethod, ReproductionMode
from ...models.propagation import (
    PropagationCreate,
    PropagationEvent,
    PropagationTarget,
)
from ..accession.accession_service import AccessionService
from ..common import doc_to_model, model_to_doc, scope_fields
from ..database import ACCESSIONS, PROPAGATIONS, genetics_db
from ..line.line_service import LineService

logger = logging.getLogger(__name__)

_ID_KEY = "eventId"
_ACCESSION_ID_KEY = "accessionId"


class PropagationService:
    """Service for performing and querying propagations."""

    # -----------------------------------------------------------------------
    # Generation derivation
    # -----------------------------------------------------------------------

    @staticmethod
    def derive_generations(
        method: PropagationMethod,
        parents: List[Accession],
    ) -> Tuple[int, int]:
        """Compute (cloneGeneration, filialGeneration) for the children.

        Parents may be empty — recording a propagation whose source is no
        longer on file still produces a valid child, it simply starts fresh.
        """
        if parents:
            max_clone = max(p.cloneGeneration for p in parents)
            max_filial = max(p.filialGeneration for p in parents)
        else:
            max_clone = 0
            max_filial = 0

        if method.reproduction_mode == ReproductionMode.SEXUAL:
            # New genetic individual: filial advances, clone counter restarts.
            return 0, max_filial + 1

        return max_clone + 1, max_filial

    # -----------------------------------------------------------------------
    # Validation
    # -----------------------------------------------------------------------

    @staticmethod
    def _validate_parents(
        method: PropagationMethod,
        parents: List[ParentRef],
    ) -> None:
        """Reject parent lists the method cannot produce."""
        if len(parents) > method.max_parents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Method '{method.value}' accepts at most "
                    f"{method.max_parents} parent(s), got {len(parents)}"
                ),
            )

        identified = [p for p in parents if p.accessionId]
        ids = [p.accessionId for p in identified]
        if len(ids) != len(set(ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The same parent accession was supplied twice",
            )

    # -----------------------------------------------------------------------
    # Perform
    # -----------------------------------------------------------------------

    @staticmethod
    async def propagate(
        data: PropagationCreate,
        current_user: Any,
    ) -> Tuple[PropagationEvent, List[Accession]]:
        """Execute a propagation and return the event plus its children."""
        db = genetics_db.get_database()

        PropagationService._validate_parents(data.method, data.parents)

        # Resolve the identified parents; unidentified slots pass through as
        # ParentRef entries with a null accessionId.
        parent_ids = [p.accessionId for p in data.parents if p.accessionId]
        parent_map = await AccessionService.get_many(parent_ids)

        missing = [pid for pid in parent_ids if pid not in parent_map]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent accession(s) not found: {', '.join(missing)}",
            )

        parents = list(parent_map.values())
        derived_clone, derived_filial = PropagationService.derive_generations(
            data.method, parents
        )

        # Denormalise the parent line onto each ref so lineage queries and the
        # ancestry breadcrumb avoid a second lookup per hop.
        enriched_parents: List[ParentRef] = []
        for ref in data.parents:
            resolved = parent_map.get(ref.accessionId) if ref.accessionId else None
            enriched_parents.append(
                ParentRef(
                    accessionId=ref.accessionId,
                    role=ref.role,
                    lineId=ref.lineId or (resolved.lineId if resolved else None),
                    note=ref.note,
                )
            )

        performed_at = data.performedAt or datetime.utcnow()
        scope = scope_fields(current_user)

        event = PropagationEvent(
            method=data.method,
            reproductionMode=data.method.reproduction_mode,
            parents=enriched_parents,
            mediumBatchId=data.mediumBatchId,
            performedAt=performed_at,
            performedBy=data.performedBy or scope.get("createdBy"),
            operatorName=data.operatorName,
            notes=data.notes,
            sourceLineIds=sorted({p.lineId for p in parents}),
            divisionId=scope.get("divisionId"),
            organizationId=scope.get("organizationId"),
        )

        children: List[Accession] = []
        for target in data.targets:
            child = await PropagationService._build_child(
                target=target,
                parents=parents,
                enriched_parents=enriched_parents,
                derived_clone=derived_clone,
                derived_filial=derived_filial,
                event=event,
                performed_at=performed_at,
                default_medium_batch_id=data.mediumBatchId,
                scope=scope,
            )
            children.append(child)

        event.resultAccessionIds = [c.id for c in children]
        event.resultLineIds = sorted({c.lineId for c in children})
        event.vesselCount = sum(c.quantity for c in children)

        # Write children first: an orphaned accession is recoverable, an event
        # pointing at accessions that were never created is not.
        try:
            if children:
                await db[ACCESSIONS].insert_many(
                    [model_to_doc(c, _ACCESSION_ID_KEY) for c in children]
                )
            await db[PROPAGATIONS].insert_one(model_to_doc(event, _ID_KEY))
        except Exception as e:
            logger.error(f"[PropagationService] Failed to persist propagation: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to record propagation",
            )

        logger.info(
            f"[PropagationService] {data.method.value} "
            f"({event.reproductionMode.value}) produced {len(children)} accession(s), "
            f"{event.vesselCount} vessel(s) — event {event.id}"
        )
        return event, children

    @staticmethod
    async def _build_child(
        target: PropagationTarget,
        parents: List[Accession],
        enriched_parents: List[ParentRef],
        derived_clone: int,
        derived_filial: int,
        event: PropagationEvent,
        performed_at: datetime,
        default_medium_batch_id: Any,
        scope: Dict[str, Any],
    ) -> Accession:
        """Construct one child accession for a propagation target."""

        clone_gen = (
            target.cloneGenerationOverride
            if target.cloneGenerationOverride is not None
            else derived_clone
        )
        filial_gen = (
            target.filialGenerationOverride
            if target.filialGenerationOverride is not None
            else derived_filial
        )

        # A cross may found a new named line; otherwise children inherit the
        # primary parent's line.
        line_id = target.targetLineId or (parents[0].lineId if parents else None)
        if not line_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cannot determine the line for the new accession — supply "
                    "targetLineId when no parent accession is identified"
                ),
            )

        line = await LineService.get_line(line_id)
        code = await AccessionService.mint_code(line.code, clone_gen, filial_gen)

        return Accession(
            lineId=line_id,
            accessionCode=code,
            cloneGeneration=clone_gen,
            filialGeneration=filial_gen,
            parents=enriched_parents,
            form=target.form,
            quantity=target.quantity,
            unit=target.unit,
            mediumBatchId=target.mediumBatchId or default_medium_batch_id,
            # location is non-optional on Accession, so fall back to an empty
            # StorageLocation rather than passing None through.
            location=target.location or StorageLocation(),
            acquiredAt=performed_at,
            label=target.label,
            notes=target.notes,
            sourceEventId=event.id,
            createdBy=scope.get("createdBy"),
            divisionId=scope.get("divisionId"),
            organizationId=scope.get("organizationId"),
        )

    # -----------------------------------------------------------------------
    # Read
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_event(event_id: str) -> PropagationEvent:
        db = genetics_db.get_database()
        doc = await db[PROPAGATIONS].find_one({_ID_KEY: event_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Propagation event '{event_id}' not found",
            )
        return doc_to_model(doc, PropagationEvent, _ID_KEY)

    @staticmethod
    async def list_events(
        skip: int = 0,
        limit: int = 20,
        line_id: str = None,
        accession_id: str = None,
        method: str = None,
        medium_batch_id: str = None,
    ) -> Tuple[List[PropagationEvent], int]:
        db = genetics_db.get_database()

        query: Dict[str, Any] = {}
        if line_id:
            query["$or"] = [{"sourceLineIds": line_id}, {"resultLineIds": line_id}]
        if accession_id:
            clause = [
                {"parents.accessionId": accession_id},
                {"resultAccessionIds": accession_id},
            ]
            # Combine with any line filter rather than overwriting it.
            if "$or" in query:
                query = {"$and": [{"$or": query.pop("$or")}, {"$or": clause}]}
            else:
                query["$or"] = clause
        if method:
            query["method"] = method
        if medium_batch_id:
            query["mediumBatchId"] = medium_batch_id

        total = await db[PROPAGATIONS].count_documents(query)
        cursor = (
            db[PROPAGATIONS]
            .find(query)
            .sort("performedAt", -1)
            .skip(skip)
            .limit(limit)
        )

        events: List[PropagationEvent] = []
        async for doc in cursor:
            events.append(doc_to_model(doc, PropagationEvent, _ID_KEY))
        return events, total

    @staticmethod
    async def get_events_for_accessions(
        accession_ids: List[str],
    ) -> Dict[str, PropagationEvent]:
        """Map accession id -> the event that produced it.

        Used by the lineage builder to annotate edges with the method and date
        without a query per node.
        """
        if not accession_ids:
            return {}

        db = genetics_db.get_database()
        cursor = db[PROPAGATIONS].find(
            {"resultAccessionIds": {"$in": list(set(accession_ids))}}
        )

        result: Dict[str, PropagationEvent] = {}
        async for doc in cursor:
            event = doc_to_model(doc, PropagationEvent, _ID_KEY)
            for acc_id in event.resultAccessionIds:
                result[acc_id] = event
        return result
