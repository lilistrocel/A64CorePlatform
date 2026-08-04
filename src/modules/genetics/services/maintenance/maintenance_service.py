"""
Genetics Repo Module - Maintenance Service (T-809)

Org-wide database hygiene, distinct from ``LineService.cascade_purge_line``:
cascade purge cleans up everything ONE named, still-known line made; this
sweeps the whole database for records whose ``lineId`` points at a line that
no longer exists AT ALL. In practice this is the leftovers from before this
feature existed — a line removed some other way (a direct database edit, a
bug, a migration) that left records behind with nothing to clean them up
line-scoped, because the line they point at can no longer be looked up to
even ask.

**Orphan definition is deliberately narrow — read this before touching the
matching logic.** A null/absent ``lineId`` is NOT an orphan. It is common,
legitimate data shape: older observations predate the ``lineId``
denormalisation onto that collection, and plenty of records simply never
carried one. Only a ``lineId`` that IS set and does NOT resolve to any
existing ``genetic_lines`` document counts as an orphan. Getting this
backwards — treating "no lineId" as orphaned — deletes live, correctly
recorded records that simply never had (or never needed) a line reference.
This is not a hypothetical: it is the exact mistake this module exists to
never make.

Propagation events do not carry a single ``lineId`` — they carry
``sourceLineIds``/``resultLineIds`` (arrays; a cross cites two parent
lines). An event is only treated as orphaned when EVERY line id it
references is missing. If even one referenced line still exists, the event
still traces to something real and is left alone — a partial reference is
not the same as a dangling one.
"""

import logging
from typing import Any, Dict, List, Set

from ..database import ACCESSIONS, LINES, OBSERVATIONS, PROPAGATIONS, genetics_db

logger = logging.getLogger(__name__)


class MaintenanceService:
    """Org-wide database hygiene sweeps for the genetics repo."""

    # -------------------------------------------------------------------
    # Shared lookup
    # -------------------------------------------------------------------

    @staticmethod
    async def _existing_line_ids(db: Any) -> Set[str]:
        """All ``lineId`` values currently in ``genetic_lines``.

        A plain Python set diff against this, rather than a Mongo ``$nin``
        filter, is deliberate: propagation-event orphan detection below
        needs custom "every referenced id missing" logic that a single
        query operator cannot express, so the accession/observation checks
        use the same in-process approach for one consistent, easy-to-audit
        code path rather than mixing query-side and application-side rules.
        """
        ids: Set[str] = set()
        async for doc in db[LINES].find({}, {"lineId": 1}):
            line_id = doc.get("lineId")
            if line_id:
                ids.add(line_id)
        return ids

    # -------------------------------------------------------------------
    # Read-only detection
    # -------------------------------------------------------------------

    @staticmethod
    async def find_orphans() -> Dict[str, Any]:
        """Find accessions, propagation events and observations whose line is gone.

        Read-only — gathers explicit id/code lists and counts, deletes
        nothing. Powers both ``GET /maintenance/orphans`` and, unchanged, the
        preview half of ``DELETE /maintenance/orphans?dryRun=true`` — one
        detection routine, so what a dry run/GET reports and what the real
        delete acts on can never drift apart.

        See the module docstring for the null-vs-orphan distinction and the
        propagation-event "every reference missing" rule — both are
        load-bearing for not deleting live records.
        """
        db = genetics_db.get_database()
        existing = await MaintenanceService._existing_line_ids(db)

        orphan_accessions: List[Dict[str, str]] = []
        async for doc in db[ACCESSIONS].find({}):
            line_id = doc.get("lineId")
            # Reason: a set lineId that resolves to nothing is an orphan; an
            # absent/empty one is simply unscoped data, never an orphan.
            if line_id and line_id not in existing:
                orphan_accessions.append(
                    {
                        "accessionId": doc.get("accessionId"),
                        "accessionCode": doc.get("accessionCode", ""),
                        "lineId": line_id,
                    }
                )

        orphan_observations: List[Dict[str, str]] = []
        async for doc in db[OBSERVATIONS].find({}):
            line_id = doc.get("lineId")
            if line_id and line_id not in existing:
                orphan_observations.append(
                    {
                        "observationId": doc.get("observationId"),
                        "lineId": line_id,
                    }
                )

        orphan_events: List[Dict[str, Any]] = []
        async for doc in db[PROPAGATIONS].find({}):
            referenced = {
                lid
                for lid in (doc.get("sourceLineIds") or [])
                + (doc.get("resultLineIds") or [])
                if lid
            }
            # Reason: only orphaned when there is something to check (a
            # cross with genuinely unrecorded parent lines has an empty
            # `referenced` set and is left alone) AND none of what is
            # referenced still exists.
            if referenced and not (referenced & existing):
                orphan_events.append(
                    {
                        "eventId": doc.get("eventId"),
                        "lineIds": sorted(referenced),
                    }
                )

        return {
            "accessions": orphan_accessions,
            "observations": orphan_observations,
            "propagationEvents": orphan_events,
            "counts": {
                "accessions": len(orphan_accessions),
                "observations": len(orphan_observations),
                "propagationEvents": len(orphan_events),
            },
        }

    # -------------------------------------------------------------------
    # Delete
    # -------------------------------------------------------------------

    @staticmethod
    async def delete_orphans(
        current_user: Any, dry_run: bool = False
    ) -> Dict[str, Any]:
        """Remove orphaned records found by ``find_orphans``.

        Deletes strictly by the explicit id lists ``find_orphans`` just
        gathered — never a broad filter re-evaluated at delete time — so a
        later edit to the detection query cannot silently widen what this
        deletes.

        Args:
            current_user: The authenticated (super_admin) caller, logged
                with the deletion.
            dry_run: When true, returns exactly what WOULD be removed
                (same shape as ``find_orphans``, plus ``dryRun``) and
                deletes nothing.

        Returns:
            The ``find_orphans`` result dict, with ``dryRun`` added.
        """
        orphans = await MaintenanceService.find_orphans()
        result: Dict[str, Any] = {**orphans, "dryRun": dry_run}

        if dry_run:
            return result

        db = genetics_db.get_database()
        accession_ids = [
            a["accessionId"] for a in orphans["accessions"] if a.get("accessionId")
        ]
        observation_ids = [
            o["observationId"]
            for o in orphans["observations"]
            if o.get("observationId")
        ]
        event_ids = [
            e["eventId"] for e in orphans["propagationEvents"] if e.get("eventId")
        ]

        if accession_ids:
            await db[ACCESSIONS].delete_many({"accessionId": {"$in": accession_ids}})
        if observation_ids:
            await db[OBSERVATIONS].delete_many(
                {"observationId": {"$in": observation_ids}}
            )
        if event_ids:
            await db[PROPAGATIONS].delete_many({"eventId": {"$in": event_ids}})

        logger.warning(
            f"[MaintenanceService] Deleted orphans: "
            f"{len(accession_ids)} accessions, "
            f"{len(observation_ids)} observations, "
            f"{len(event_ids)} propagation events — "
            f"by user {getattr(current_user, 'userId', None)}"
        )
        return result
