"""
Genetics Repo Module - Line Service

CRUD for ``genetic_lines`` plus the accession rollups shown on the repo home
cards.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from ...models.line import Line, LineCreate, LineStats, LineUpdate, LineWithStats
from ..common import doc_to_model, model_to_doc, scope_fields, slugify_code
from ..database import ACCESSIONS, LINES, OBSERVATIONS, PROPAGATIONS, genetics_db

logger = logging.getLogger(__name__)

_ID_KEY = "lineId"


class LineService:
    """Service for managing genetic lines (the named identities)."""

    # -----------------------------------------------------------------------
    # Create
    # -----------------------------------------------------------------------

    @staticmethod
    async def create_line(data: LineCreate, current_user: Any) -> Line:
        db = genetics_db.get_database()

        code = slugify_code(data.code)
        if not code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Line code must contain at least one alphanumeric character",
            )

        existing = await db[LINES].find_one({"code": code})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A line with code '{code}' already exists",
            )

        # A derived line must point at a line that exists, otherwise the
        # lineage view would render an orphan branch.
        if data.parentLineId:
            await LineService.get_line(data.parentLineId)

        payload = data.model_dump()
        payload["code"] = code

        line = Line(**payload, **scope_fields(current_user))

        try:
            await db[LINES].insert_one(model_to_doc(line, _ID_KEY))
        except Exception as e:
            logger.error(f"[LineService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create genetic line",
            )

        logger.info(
            f"[LineService] Created line {line.id} '{line.code}' "
            f"({line.kind}) by user {getattr(current_user, 'userId', None)}"
        )
        return line

    # -----------------------------------------------------------------------
    # Read
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_line(line_id: str) -> Line:
        db = genetics_db.get_database()
        doc = await db[LINES].find_one({_ID_KEY: line_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Genetic line '{line_id}' not found",
            )
        return doc_to_model(doc, Line, _ID_KEY)

    @staticmethod
    async def list_lines(
        skip: int = 0,
        limit: int = 20,
        kind: Optional[str] = None,
        search: Optional[str] = None,
        tag: Optional[str] = None,
        parent_line_id: Optional[str] = None,
        linked_strain_id: Optional[str] = None,
        linked_plant_data_id: Optional[str] = None,
        active_only: bool = False,
        with_stats: bool = True,
    ) -> Tuple[List[Line], int]:
        """List lines, optionally enriched with accession rollups."""
        db = genetics_db.get_database()

        query: Dict[str, Any] = {}
        if kind:
            query["kind"] = kind
        if tag:
            query["tags"] = tag
        if parent_line_id:
            query["parentLineId"] = parent_line_id
        if linked_strain_id:
            query["linkedStrainId"] = linked_strain_id
        if linked_plant_data_id:
            query["linkedPlantDataId"] = linked_plant_data_id
        if active_only:
            query["isActive"] = True
        if search:
            # Escape-free regex is acceptable here because the value is bound
            # as a pattern, not concatenated into a query string.
            query["$or"] = [
                {"commonName": {"$regex": search, "$options": "i"}},
                {"code": {"$regex": search, "$options": "i"}},
                {"scientificName": {"$regex": search, "$options": "i"}},
            ]

        total = await db[LINES].count_documents(query)
        cursor = db[LINES].find(query).sort("commonName", 1).skip(skip).limit(limit)

        lines: List[Line] = []
        async for doc in cursor:
            lines.append(doc_to_model(doc, Line, _ID_KEY))

        if not with_stats:
            return lines, total

        stats_map = await LineService._bulk_stats([ln.id for ln in lines])
        enriched: List[Line] = [
            LineWithStats(
                **line.model_dump(),
                stats=stats_map.get(line.id, LineStats()),
            )
            for line in lines
        ]
        return enriched, total

    @staticmethod
    async def get_line_with_stats(line_id: str) -> LineWithStats:
        line = await LineService.get_line(line_id)
        stats_map = await LineService._bulk_stats([line_id])
        return LineWithStats(
            **line.model_dump(),
            stats=stats_map.get(line_id, LineStats()),
        )

    # -----------------------------------------------------------------------
    # Stats
    # -----------------------------------------------------------------------

    @staticmethod
    async def _bulk_stats(line_ids: List[str]) -> Dict[str, LineStats]:
        """Aggregate accession rollups for several lines in one round trip."""
        if not line_ids:
            return {}

        db = genetics_db.get_database()

        pipeline = [
            {"$match": {"lineId": {"$in": line_ids}}},
            {
                "$group": {
                    "_id": "$lineId",
                    "totalAccessions": {"$sum": 1},
                    "activeAccessions": {
                        "$sum": {"$cond": [{"$eq": ["$status", "active"]}, 1, 0]}
                    },
                    "contaminatedAccessions": {
                        "$sum": {"$cond": [{"$eq": ["$status", "contaminated"]}, 1, 0]}
                    },
                    "maxCloneGeneration": {"$max": "$cloneGeneration"},
                    "maxFilialGeneration": {"$max": "$filialGeneration"},
                    "lastActivityAt": {"$max": "$createdAt"},
                }
            },
        ]

        result: Dict[str, LineStats] = {}
        async for row in db[ACCESSIONS].aggregate(pipeline):
            result[row["_id"]] = LineStats(
                totalAccessions=row.get("totalAccessions", 0),
                activeAccessions=row.get("activeAccessions", 0),
                contaminatedAccessions=row.get("contaminatedAccessions", 0),
                maxCloneGeneration=row.get("maxCloneGeneration") or 0,
                maxFilialGeneration=row.get("maxFilialGeneration") or 0,
                lastActivityAt=row.get("lastActivityAt"),
            )

        # Child-line counts come from the lines collection, not accessions.
        child_pipeline = [
            {"$match": {"parentLineId": {"$in": line_ids}}},
            {"$group": {"_id": "$parentLineId", "count": {"$sum": 1}}},
        ]
        async for row in db[LINES].aggregate(child_pipeline):
            stats = result.setdefault(row["_id"], LineStats())
            stats.childLineCount = row.get("count", 0)

        return result

    # -----------------------------------------------------------------------
    # Update
    # -----------------------------------------------------------------------

    @staticmethod
    async def update_line(line_id: str, data: LineUpdate) -> Line:
        await LineService.get_line(line_id)

        update_fields = data.model_dump(exclude_unset=True, exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        db = genetics_db.get_database()

        if "code" in update_fields:
            new_code = slugify_code(update_fields["code"])
            clash = await db[LINES].find_one(
                {"code": new_code, _ID_KEY: {"$ne": line_id}}
            )
            if clash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A line with code '{new_code}' already exists",
                )
            update_fields["code"] = new_code

        if update_fields.get("parentLineId"):
            if update_fields["parentLineId"] == line_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A line cannot be its own parent",
                )
            await LineService.get_line(update_fields["parentLineId"])

        update_fields["updatedAt"] = datetime.utcnow()
        await db[LINES].update_one({_ID_KEY: line_id}, {"$set": update_fields})

        logger.info(f"[LineService] Updated line {line_id}: {list(update_fields.keys())}")
        return await LineService.get_line(line_id)

    # -----------------------------------------------------------------------
    # Deactivate
    # -----------------------------------------------------------------------

    @staticmethod
    async def deactivate_line(line_id: str) -> Line:
        """Soft-delete a line that HAS material on it — keep its history.

        Sets ``isActive: false`` and keeps the document — the normal
        retirement path for a line carrying accessions, propagation history,
        observations or anything else, because hard-deleting it would break
        traceability chains that may span years. This is unchanged by, and
        deliberately kept separate from, ``purge_line`` and
        ``cascade_purge_line`` below. Three distinct operations answer three
        different questions — use whichever matches what actually happened:

        * ``deactivate_line`` (this method) — "retire a REAL line, keep its
          history." The line produced real material and that material's
          traceability must survive. Never deletes anything.
        * ``purge_line`` — "remove an EMPTY line" (a typo, a duplicate, a
          mis-click before anything was recorded against it). Hard-deletes
          the line document itself, but only ever at zero dependents;
          refuses otherwise rather than cascading.
        * ``cascade_purge_line`` — "remove a CANCELLED TEST/DEMO and
          everything it made." The explicit, confirmed, audited escalation
          for when the whole line — and every accession, propagation event
          and observation recorded against it — was never real production
          work to begin with. Requires the operator to type the line's exact
          code back and hard-refuses regardless of confirmation if the line
          has harvests or child lines, because either one means real
          downstream work exists.

        Do not merge these three; picking the wrong one either destroys
        history that should have survived or leaves clutter that should have
        been removed.
        """
        await LineService.get_line(line_id)
        db = genetics_db.get_database()
        await db[LINES].update_one(
            {_ID_KEY: line_id},
            {"$set": {"isActive": False, "updatedAt": datetime.utcnow()}},
        )
        logger.info(f"[LineService] Deactivated line {line_id}")
        return await LineService.get_line(line_id)

    # -----------------------------------------------------------------------
    # Hard delete (purge) — refuse rather than cascade
    #
    # Mirrors RoomService.room_dependents() / delete_room() in
    # mushroom_manager: count everything that would be orphaned, and only
    # allow the delete when that count is zero across the board. See
    # purge_line's docstring for why the zero-dependents gate is load-bearing
    # for accession-code safety, not just a convenience check.
    # -----------------------------------------------------------------------

    @staticmethod
    async def line_dependents(line_id: str) -> Dict[str, int]:
        """Count everything that would be orphaned by purging this line.

        Lets a UI explain a refusal before the user even tries ("this line
        has 6 accessions and 5 propagation events") rather than a bare 409.
        Deliberately does not check that the line itself exists first — it
        mirrors ``RoomService.room_dependents`` exactly, which does the same:
        an unknown id simply counts zero dependents everywhere.
        """
        db = genetics_db.get_database()
        return {
            "accessions": await db[ACCESSIONS].count_documents({"lineId": line_id}),
            "propagationEvents": await db[PROPAGATIONS].count_documents(
                {"$or": [{"sourceLineIds": line_id}, {"resultLineIds": line_id}]}
            ),
            "observations": await db[OBSERVATIONS].count_documents({"lineId": line_id}),
            "childLines": await db[LINES].count_documents({"parentLineId": line_id}),
            # mushroom_harvests belongs to mushroom_manager, not this module,
            # but both share one MongoDB — the same cross-module reach
            # RoomService.room_dependents already relies on (it queries
            # genetic_accessions directly). lineId is denormalised onto the
            # harvest document precisely so this kind of rollup doesn't need
            # a join back through the accession.
            "harvests": await db.mushroom_harvests.count_documents({"lineId": line_id}),
        }

    @staticmethod
    async def purge_line(line_id: str, current_user: Any) -> Dict[str, str]:
        """Hard-delete a line, but only when nothing has ever used it.

        Deliberately refuses rather than cascading — same posture as
        ``RoomService.delete_room``. This is not an escalation of
        ``deactivate_line``; it exists for the opposite case, a line that
        never accumulated any accessions, propagation events, observations,
        child lines or harvests (created by mistake, a typo, or a test). A
        line that HAS material must go through ``deactivate_line`` instead —
        purge will refuse it, never cascade through it.

        For a line that DOES have material but that material was itself
        never real (a whole cancelled test/demo run, not a typo), see
        ``cascade_purge_line`` below — a separate, explicitly-confirmed,
        super_admin-only operation. This method never cascades and never
        will; do not loosen its zero-dependents gate to partially bridge the
        two (see the reasoning below for why that specifically breaks
        accession-code safety).

        Why the zero-dependents gate must never be relaxed: ``code`` is
        globally unique (enforced in ``create_line``) and is baked into every
        accession code minted from this line, e.g. ``PO-BLU-G3-001``, which is
        also what gets printed on the physical vessel label. Purging a line
        frees its ``code`` for reuse. Because purge only ever succeeds at zero
        accessions, no accession code can exist that was minted under this
        line's code — there is nothing left for a future line's reused code to
        collide with. If this gate is ever loosened (e.g. to permit purging a
        line whose accessions are all "discarded" or "contaminated" rather
        than requiring zero), that guarantee breaks: a future line reusing the
        freed code would mint accession codes that either collide with the
        unique ``accessionCode`` index on records still in the database, or —
        worse, if those old records were also removed — leave a stale printed
        label on a vessel that now resolves to entirely unrelated material.
        Re-derive this reasoning before changing the gate; do not just widen
        the condition to make a particular purge request succeed.
        """
        line = await LineService.get_line(line_id)
        blocking = await LineService.line_dependents(line_id)

        if any(blocking.values()):
            parts = [f"{v} {k}" for k, v in blocking.items() if v]
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Line '{line.code}' still has {', '.join(parts)} attached. "
                    f"Purging it would orphan those records and free its code "
                    f"for reuse while old labels may still carry it. Deactivate "
                    f"the line instead to retire it while keeping its history, "
                    f"or remove/reassign the attached records first."
                ),
            )

        db = genetics_db.get_database()
        await db[LINES].delete_one({_ID_KEY: line_id})
        logger.info(
            f"[LineService] Purged line {line.code} ({line_id}) "
            f"by user {getattr(current_user, 'userId', None)}"
        )
        return {"code": line.code, "lineId": line_id}

    # -----------------------------------------------------------------------
    # Cascade purge (T-809) — explicit, confirmed, audited escalation
    #
    # Distinct from purge_line above, which refuses outright the moment any
    # dependent exists. This method is for the deliberate case the user
    # described: "sometimes i have demo lines or test lines which shouldn't
    # clutter when the test or demo is cancelled" — the whole line, and
    # everything recorded against it, was never real work. It is reached
    # only through DELETE /{line_id}/purge?cascade=true, gated at
    # super_admin (one tier above purge_line's genetics.delete — see
    # middleware/auth.py) and requires the operator to type the line's exact
    # code as `confirm`, mirroring the GitHub repo-deletion pattern: a
    # cascade reachable by a single click on the wrong row is how someone
    # loses a month of work.
    # -----------------------------------------------------------------------

    @staticmethod
    async def _gather_cascade_preview(line_id: str) -> Dict[str, Any]:
        """Gather exactly what a cascade purge would touch, as explicit id lists.

        The single source of truth for three different consumers —
        ``cascade_purge_line``'s dry-run response, its pre-delete
        audit-log snapshot, and the actual delete's ``$in`` filters — so
        what dry run showed the operator, what gets logged as "destroyed",
        and what actually gets deleted can never drift apart from one
        another. Deliberately returns ids gathered up front rather than a
        filter expression: every delete this feeds is by explicit id list,
        never a broad `{"lineId": line_id}` re-evaluated at delete time,
        per the same "gather first, delete by id list" rule the cascade
        purge as a whole must follow.
        """
        line = await LineService.get_line(line_id)
        db = genetics_db.get_database()

        accession_ids: List[str] = []
        accession_codes: List[str] = []
        async for doc in db[ACCESSIONS].find({"lineId": line_id}):
            accession_ids.append(doc["accessionId"])
            accession_codes.append(doc.get("accessionCode", ""))

        event_ids: List[str] = []
        async for doc in db[PROPAGATIONS].find(
            {"$or": [{"sourceLineIds": line_id}, {"resultLineIds": line_id}]}
        ):
            event_ids.append(doc["eventId"])

        observation_ids: List[str] = []
        async for doc in db[OBSERVATIONS].find({"lineId": line_id}):
            observation_ids.append(doc["observationId"])

        harvests = await db.mushroom_harvests.count_documents({"lineId": line_id})
        child_lines = await db[LINES].count_documents({"parentLineId": line_id})

        return {
            "line": line,
            "accessionIds": accession_ids,
            "accessionCodes": accession_codes,
            "propagationEventIds": event_ids,
            "observationIds": observation_ids,
            "harvests": harvests,
            "childLines": child_lines,
        }

    @staticmethod
    async def cascade_purge_line(
        line_id: str,
        confirm: Optional[str],
        current_user: Any,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        """Remove a cancelled test/demo line AND everything it made.

        The deliberate cascade counterpart to ``purge_line``'s
        refuse-rather-than-cascade default, which stays the safe default for
        every other case. This method exists for exactly one situation: the
        whole line was a test, a demo, or otherwise never real work, and the
        operator wants it — and every accession, propagation event and
        observation recorded against it — gone.

        Two categories HARD-REFUSE unconditionally, before ``confirm`` is
        even checked, and cannot be bypassed by ``cascade=true``:

        * **Harvests.** A ``mushroom_harvests`` row carrying this ``lineId``
          is real production yield. A line with harvests is not a test line,
          whatever it is named.
        * **Child lines.** Another line derived via ``parentLineId`` means
          real downstream work exists — a novel trait was promoted, a cross
          was named. The operator must deal with the child line first.

        This is the line between "cleaning up a cancelled test" and
        "destroying production history" — do not add a bypass for either
        category, and do not let the zero-dependents gate on ``purge_line``
        drift toward permitting this same reach by a different route.

        Args:
            line_id: The line to cascade-purge.
            confirm: Must exactly equal the line's ``code``. Required only
                when actually deleting (``dry_run=False``) — a dry run is
                precisely the tool for finding out what the code even is
                before typing it back, so it does not itself require
                ``confirm``.
            current_user: The authenticated (super_admin) caller.
            dry_run: When true, returns exactly what WOULD be deleted
                (counts, accession codes, and id lists) and deletes nothing.
                The two hard-refuse checks above still apply — a dry run
                that hides an inevitable refusal would be worse than useless
                to a UI trying to populate a confirmation dialog.

        Returns:
            A summary dict: ``lineId``, ``code``, ``dryRun``,
            ``accessionsRemoved``/``accessionCodesRemoved``,
            ``propagationEventsRemoved``/``propagationEventIds``,
            ``observationsRemoved``/``observationIds``.

        Raises:
            HTTPException: 404 unknown line; 409 harvests or child lines
            present (either category, regardless of ``confirm`` or
            ``dry_run``); 400 ``confirm`` missing or not an exact match
            (only checked when ``dry_run`` is false).
        """
        preview = await LineService._gather_cascade_preview(line_id)
        line: Line = preview["line"]

        if preview["harvests"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Line '{line.code}' has {preview['harvests']} harvest(s) "
                    f"recorded against it — real production yield, not a test "
                    f"line, whatever it is named. Cascade purge refuses "
                    f"unconditionally; deactivate the line instead."
                ),
            )

        if preview["childLines"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Line '{line.code}' has {preview['childLines']} child "
                    f"line(s) derived from it — real downstream work exists. "
                    f"Cascade purge refuses unconditionally; remove or "
                    f"reassign the child lines first."
                ),
            )

        result: Dict[str, Any] = {
            "lineId": line.id,
            "code": line.code,
            "dryRun": dry_run,
            "accessionsRemoved": len(preview["accessionIds"]),
            "accessionCodesRemoved": preview["accessionCodes"],
            "propagationEventsRemoved": len(preview["propagationEventIds"]),
            "propagationEventIds": preview["propagationEventIds"],
            "observationsRemoved": len(preview["observationIds"]),
            "observationIds": preview["observationIds"],
        }

        if dry_run:
            return result

        if not confirm or confirm != line.code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Confirmation required: to cascade-purge line "
                    f"'{line.code}', pass confirm='{line.code}' exactly. "
                    f"This is deliberate friction — a cascade that can be "
                    f"triggered by a single click on the wrong row can lose "
                    f"real work."
                ),
            )

        db = genetics_db.get_database()
        if preview["accessionIds"]:
            await db[ACCESSIONS].delete_many({"accessionId": {"$in": preview["accessionIds"]}})
        if preview["propagationEventIds"]:
            await db[PROPAGATIONS].delete_many(
                {"eventId": {"$in": preview["propagationEventIds"]}}
            )
        if preview["observationIds"]:
            await db[OBSERVATIONS].delete_many(
                {"observationId": {"$in": preview["observationIds"]}}
            )
        await db[LINES].delete_one({_ID_KEY: line_id})

        logger.warning(
            f"[LineService] CASCADE PURGED line {line.code} ({line_id}) — "
            f"{result['accessionsRemoved']} accessions, "
            f"{result['propagationEventsRemoved']} propagation events, "
            f"{result['observationsRemoved']} observations — "
            f"by user {getattr(current_user, 'userId', None)}"
        )
        return result

    # -----------------------------------------------------------------------
    # Growing-profile links
    # -----------------------------------------------------------------------

    @staticmethod
    async def count_by_linked_profile() -> Dict[str, Dict[str, int]]:
        """Count genetic lines per linked growing profile.

        Powers the reverse link on the Strain Library and Plant Library — "N
        genetic lines carry this strain" — in one round trip rather than a
        request per row.

        Returns ``{"strains": {strainId: count}, "plants": {plantDataId: count}}``.
        """
        db = genetics_db.get_database()

        strains: Dict[str, int] = {}
        async for row in db[LINES].aggregate(
            [
                {"$match": {"linkedStrainId": {"$ne": None}}},
                {"$group": {"_id": "$linkedStrainId", "count": {"$sum": 1}}},
            ]
        ):
            strains[row["_id"]] = row["count"]

        plants: Dict[str, int] = {}
        async for row in db[LINES].aggregate(
            [
                {"$match": {"linkedPlantDataId": {"$ne": None}}},
                {"$group": {"_id": "$linkedPlantDataId", "count": {"$sum": 1}}},
            ]
        ):
            plants[row["_id"]] = row["count"]

        return {"strains": strains, "plants": plants}

    # -----------------------------------------------------------------------
    # Helpers used by other services
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_line_codes(line_ids: List[str]) -> Dict[str, Dict[str, str]]:
        """Map line ids to their code/name for denormalised display."""
        if not line_ids:
            return {}
        db = genetics_db.get_database()
        cursor = db[LINES].find(
            {_ID_KEY: {"$in": list(set(line_ids))}},
            {_ID_KEY: 1, "code": 1, "commonName": 1},
        )
        return {
            doc[_ID_KEY]: {
                "code": doc.get("code", ""),
                "commonName": doc.get("commonName", ""),
            }
            async for doc in cursor
        }
