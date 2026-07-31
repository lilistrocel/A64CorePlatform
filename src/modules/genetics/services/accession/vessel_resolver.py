"""
Genetics Repo Module - Vessel Resolver (T-804)

A printed label carries a fixed vessel ordinal (``#7``) that never changes,
but the accession record it points at can — a batch split moves a subset of
vessels into a new child record. This module walks that split chain forward
so a scan of an old label still lands on the record that currently holds the
physical vessel.

See ``Docs/2-Working-Progress/genetics-label-qr-spec.md`` §3 for why the
ordinal cannot be derived from ``quantity``, and §4.1 for the walk algorithm
this implements.

This function is reachable from the unauthenticated public info-page route
(T-804 step 3), so it must never raise on malformed or cyclical data — it
degrades to "resolved as far as we could" rather than 500ing a public page.
"""

import logging

from ...models.accession import Accession
from ..common import doc_to_model
from ..database import ACCESSIONS, genetics_db

logger = logging.getLogger(__name__)

_ID_KEY = "accessionId"

# Hard ceiling on the forward walk. A real split chain is never this deep in
# practice; the cap exists purely so a data anomaly (e.g. a cycle introduced
# by a bug or a hand-edited document) degrades gracefully instead of looping
# forever on a route that has no authentication to rate-limit misuse away.
MAX_SPLIT_DEPTH = 10


async def resolve_vessel(accession: Accession, vessel_no: int) -> Accession:
    """Follow splits forward to the accession that currently holds this ordinal.

    Returns the passed accession unchanged when no child has claimed the
    ordinal — the vessel is still part of the batch.

    Range-checking ``vessel_no`` against ``accession.labelledVesselCount`` is
    explicitly NOT this function's job — the caller (the public route) is
    responsible for rejecting an out-of-range ordinal with its own 404. This
    function only performs the forward walk with whatever ordinal it is given.
    """
    db = genetics_db.get_database()
    current = accession

    for _ in range(MAX_SPLIT_DEPTH):
        child_doc = await db[ACCESSIONS].find_one(
            {
                "splitFromAccessionId": current.id,
                # Mongo array-field equality: matches any document whose
                # sourceVesselNumbers array contains this value.
                "sourceVesselNumbers": vessel_no,
            }
        )
        if not child_doc:
            return current
        current = doc_to_model(child_doc, Accession, _ID_KEY)

    logger.warning(
        f"[vessel_resolver] Split-chain depth exceeded {MAX_SPLIT_DEPTH} "
        f"while resolving vessel #{vessel_no} starting from accession "
        f"{accession.accessionCode} ({accession.id}); stopping at "
        f"{current.accessionCode} ({current.id}) rather than looping further"
    )
    return current
