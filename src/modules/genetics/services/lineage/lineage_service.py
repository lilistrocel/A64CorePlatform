"""
Genetics Repo Module - Lineage Service

Builds the lineage DAG (descendants and/or ancestors of an accession, or the
whole graph for a line) and the flattened ancestry breadcrumb.

The graph is returned flat — nodes plus edges — because a cross gives a node
two parents, so it cannot be expressed as a nested tree. Layout is the
frontend's job.

Traversal is breadth-first and batched: one query per depth level rather than
one per node, and hard-capped by depth and node count so a wide clone fan-out
cannot melt the API.
"""

import logging
from typing import Dict, List, Optional, Set, Tuple

from ...config.settings import settings
from ...models.accession import Accession
from ...models.enums import ParentRole
from ...models.lineage import (
    AncestryChain,
    AncestryStep,
    LineageEdge,
    LineageGraph,
    LineageNode,
)
from ..accession.accession_service import AccessionService
from ..common import doc_to_model, generation_label
from ..database import ACCESSIONS, genetics_db
from ..line.line_service import LineService
from ..medium.medium_service import MediumService
from ..propagation.propagation_service import PropagationService

logger = logging.getLogger(__name__)

_ACCESSION_ID_KEY = "accessionId"

# Order used when a node has several parents and the breadcrumb must pick one
# to follow. Clone source first (asexual chains are the common case), then the
# maternal side, which is the conventional primary line in both plant and
# animal pedigrees.
_PRIMARY_ROLE_ORDER = [
    ParentRole.CLONE_SOURCE,
    ParentRole.SEED_PARENT,
    ParentRole.DAM,
    ParentRole.SPORE_SOURCE,
    ParentRole.POLLEN_PARENT,
    ParentRole.SIRE,
    ParentRole.UNKNOWN,
]


class LineageService:
    """Service for lineage graph construction and ancestry traversal."""

    # -----------------------------------------------------------------------
    # Graph
    # -----------------------------------------------------------------------

    @staticmethod
    async def build_graph(
        root_accession_id: Optional[str] = None,
        line_id: Optional[str] = None,
        include_ancestors: bool = True,
        include_descendants: bool = True,
        max_depth: Optional[int] = None,
    ) -> LineageGraph:
        """Build a lineage DAG.

        Either ``root_accession_id`` (walk out from one accession) or
        ``line_id`` (every accession on a line) must be supplied.
        """
        depth_cap = min(
            max_depth or settings.MAX_LINEAGE_DEPTH,
            settings.MAX_LINEAGE_DEPTH,
        )

        if line_id and not root_accession_id:
            accessions, truncated = await LineageService._collect_line(line_id)
            depths = {a.id: 0 for a in accessions}
            root_id = None
        elif root_accession_id:
            root = await AccessionService.get_accession(root_accession_id)
            accessions, depths, truncated = await LineageService._collect_around(
                root,
                include_ancestors=include_ancestors,
                include_descendants=include_descendants,
                depth_cap=depth_cap,
            )
            root_id = root.id
        else:
            return LineageGraph()

        nodes, edges = await LineageService._assemble(accessions, depths, root_id)

        return LineageGraph(
            rootAccessionId=root_id,
            rootLineId=line_id,
            nodes=nodes,
            edges=edges,
            maxDepth=max(depths.values()) if depths else 0,
            truncated=truncated,
        )

    @staticmethod
    async def _collect_line(line_id: str) -> Tuple[List[Accession], bool]:
        """Every accession belonging to one line, capped at the node limit."""
        db = genetics_db.get_database()
        cursor = (
            db[ACCESSIONS]
            .find({"lineId": line_id})
            .sort([("cloneGeneration", 1), ("accessionCode", 1)])
            .limit(settings.MAX_LINEAGE_NODES + 1)
        )
        accessions = [
            doc_to_model(doc, Accession, _ACCESSION_ID_KEY) async for doc in cursor
        ]

        truncated = len(accessions) > settings.MAX_LINEAGE_NODES
        return accessions[: settings.MAX_LINEAGE_NODES], truncated

    @staticmethod
    async def _collect_around(
        root: Accession,
        include_ancestors: bool,
        include_descendants: bool,
        depth_cap: int,
    ) -> Tuple[List[Accession], Dict[str, int], bool]:
        """Breadth-first walk out from a root accession in both directions.

        Follows two distinct edge types outward, both under the same
        ``depth_cap`` / ``MAX_LINEAGE_NODES`` budget — a split hop is not a
        separate allowance, just another hop:

        - propagation: a child's ``parents[].accessionId`` cites the parent.
        - split: a child's ``splitFromAccessionId`` cites the batch it was
          carved out of with no new generation (``AccessionService.
          split_accession``). Without this, a split-off record is a sibling
          sharing the same parents as the batch it came from — reachable
          from neither direction — which is exactly the blind spot this
          traversal exists to close.
        """
        db = genetics_db.get_database()

        collected: Dict[str, Accession] = {root.id: root}
        depths: Dict[str, int] = {root.id: 0}
        truncated = False

        # --- Descendants: children reference the parent by nested id, or by
        # splitFromAccessionId when the child is a split-off record ---------
        if include_descendants:
            frontier: List[str] = [root.id]
            depth = 0
            while frontier and depth < depth_cap:
                depth += 1
                propagated_cursor = db[ACCESSIONS].find(
                    {"parents.accessionId": {"$in": frontier}}
                )
                split_cursor = db[ACCESSIONS].find(
                    {"splitFromAccessionId": {"$in": frontier}}
                )
                next_frontier: List[str] = []
                for cursor in (propagated_cursor, split_cursor):
                    async for doc in cursor:
                        child = doc_to_model(doc, Accession, _ACCESSION_ID_KEY)
                        if child.id in collected:
                            continue
                        if len(collected) >= settings.MAX_LINEAGE_NODES:
                            truncated = True
                            break
                        collected[child.id] = child
                        depths[child.id] = depth
                        next_frontier.append(child.id)
                    if truncated:
                        break
                if truncated:
                    break
                frontier = next_frontier

        # --- Ancestors: follow the parent refs upward, plus a split's own
        # splitFromAccessionId (the batch it was carved out of) -------------
        if include_ancestors:
            frontier = [p.accessionId for p in root.parents if p.accessionId]
            if root.splitFromAccessionId:
                frontier.append(root.splitFromAccessionId)
            # Ancestors get negative depths (normalised to 0 further down), so
            # the cap is counted on a separate positive step counter.
            depth = 0
            steps_up = 0
            while frontier and steps_up < depth_cap:
                steps_up += 1
                depth -= 1
                fetched = await AccessionService.get_many(frontier)
                next_frontier = []
                for parent in fetched.values():
                    if parent.id in collected:
                        continue
                    if len(collected) >= settings.MAX_LINEAGE_NODES:
                        truncated = True
                        break
                    collected[parent.id] = parent
                    depths[parent.id] = depth
                    next_frontier.extend(
                        p.accessionId for p in parent.parents if p.accessionId
                    )
                    if parent.splitFromAccessionId:
                        next_frontier.append(parent.splitFromAccessionId)
                if truncated:
                    break
                frontier = next_frontier

        # Normalise depths so the shallowest ancestor sits at 0 and the root
        # keeps a positive offset — simpler for the frontend to lay out rows.
        if depths:
            offset = min(depths.values())
            depths = {k: v - offset for k, v in depths.items()}

        return list(collected.values()), depths, truncated

    @staticmethod
    async def _assemble(
        accessions: List[Accession],
        depths: Dict[str, int],
        root_id: Optional[str],
    ) -> Tuple[List[LineageNode], List[LineageEdge]]:
        """Turn collected accessions into display nodes and annotated edges."""
        if not accessions:
            return [], []

        line_meta = await LineService.get_line_codes([a.lineId for a in accessions])
        batch_codes = await MediumService.get_batch_codes(
            [a.mediumBatchId for a in accessions if a.mediumBatchId]
        )
        events = await PropagationService.get_events_for_accessions(
            [a.id for a in accessions]
        )

        present: Set[str] = {a.id for a in accessions}

        nodes: List[LineageNode] = []
        edges: List[LineageEdge] = []

        for accession in accessions:
            meta = line_meta.get(accession.lineId, {})
            nodes.append(
                LineageNode(
                    accessionId=accession.id,
                    accessionCode=accession.accessionCode,
                    lineId=accession.lineId,
                    lineCode=meta.get("code"),
                    lineName=meta.get("commonName"),
                    cloneGeneration=accession.cloneGeneration,
                    filialGeneration=accession.filialGeneration,
                    generationLabel=generation_label(
                        accession.cloneGeneration, accession.filialGeneration
                    ),
                    form=accession.form,
                    quantity=accession.quantity,
                    unit=accession.unit,
                    status=accession.status,
                    mediumBatchId=accession.mediumBatchId,
                    mediumBatchCode=batch_codes.get(accession.mediumBatchId),
                    acquiredAt=accession.acquiredAt,
                    createdAt=accession.createdAt,
                    depth=depths.get(accession.id, 0),
                    isRoot=accession.id == root_id,
                    hasUnknownParent=any(
                        p.accessionId is None for p in accession.parents
                    ),
                )
            )

            event = events.get(accession.id)
            for parent in accession.parents:
                # Edges to accessions outside the collected set are dropped;
                # an edge whose source is unidentified is kept with a null
                # source so the UI can render the dangling "unknown" stub.
                if parent.accessionId and parent.accessionId not in present:
                    continue
                edges.append(
                    LineageEdge(
                        fromAccessionId=parent.accessionId,
                        toAccessionId=accession.id,
                        role=parent.role,
                        kind="propagation",
                        eventId=event.id if event else None,
                        method=event.method if event else None,
                        reproductionMode=event.reproductionMode if event else None,
                        performedAt=event.performedAt if event else None,
                        mediumBatchId=event.mediumBatchId if event else None,
                        mediumBatchCode=(
                            batch_codes.get(event.mediumBatchId) if event else None
                        ),
                    )
                )

            # A split is not a propagation — no new generation, no event, no
            # medium. Emitted as its own edge, kind="split", so the frontend
            # can draw the batch this record was carved out of without
            # mistaking it for a generation change. Dropped, like the
            # propagation edges above, when the source fell outside the
            # collected set (depth/node cap truncation).
            if (
                accession.splitFromAccessionId
                and accession.splitFromAccessionId in present
            ):
                edges.append(
                    LineageEdge(
                        fromAccessionId=accession.splitFromAccessionId,
                        toAccessionId=accession.id,
                        kind="split",
                    )
                )

        nodes.sort(key=lambda n: (n.depth, n.accessionCode))
        return nodes, edges

    # -----------------------------------------------------------------------
    # Ancestry breadcrumb
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_ancestry(accession_id: str) -> AncestryChain:
        """Root-first ancestry path for one accession.

        Follows the primary parent at each hop so the breadcrumb stays linear;
        ``hasBranching`` flags that a cross was passed through and the full DAG
        is worth opening.
        """
        accession = await AccessionService.get_accession(accession_id)

        chain: List[Accession] = [accession]
        # roles[i] records how chain[i] was produced, so it stays index-aligned
        # with chain (child-first) and survives the reversal below.
        roles: List[Optional[ParentRole]] = []
        has_branching = False
        reached_unknown = False
        seen: Set[str] = {accession.id}

        current = accession
        for _ in range(settings.MAX_LINEAGE_DEPTH):
            if not current.parents:
                break

            primary = LineageService._pick_primary(current.parents)
            if primary is None or primary.accessionId is None:
                reached_unknown = True
                roles.append(primary.role if primary else ParentRole.UNKNOWN)
                break

            if len(current.parents) > 1:
                has_branching = True

            if primary.accessionId in seen:
                # Defensive: a cycle should be impossible, but a corrupted
                # parent ref must not spin the request forever.
                logger.warning(
                    f"[LineageService] Cycle detected at {primary.accessionId}; "
                    f"truncating ancestry for {accession_id}"
                )
                break

            parent_map = await AccessionService.get_many([primary.accessionId])
            parent = parent_map.get(primary.accessionId)
            if parent is None:
                reached_unknown = True
                break

            seen.add(parent.id)
            roles.append(primary.role)
            chain.append(parent)
            current = parent

        # The oldest entry in the chain was not produced by anything on file,
        # so pad roles to the chain length before reversing. Without this the
        # two lists reverse out of step and every step shows its child's role.
        while len(roles) < len(chain):
            roles.append(None)

        # chain is child-first; flip to root-first for display.
        chain.reverse()
        roles.reverse()

        line_meta = await LineService.get_line_codes([a.lineId for a in chain])
        events = await PropagationService.get_events_for_accessions(
            [a.id for a in chain]
        )
        batch_codes = await MediumService.get_batch_codes(
            [e.mediumBatchId for e in events.values() if e.mediumBatchId]
        )

        steps: List[AncestryStep] = []

        if reached_unknown:
            steps.append(
                AncestryStep(
                    accessionCode=None,
                    generationLabel=None,
                    isUnknown=True,
                    role=ParentRole.UNKNOWN,
                )
            )

        for index, item in enumerate(chain):
            event = events.get(item.id)
            meta = line_meta.get(item.lineId, {})
            steps.append(
                AncestryStep(
                    accessionId=item.id,
                    accessionCode=item.accessionCode,
                    lineId=item.lineId,
                    lineCode=meta.get("code"),
                    generationLabel=generation_label(
                        item.cloneGeneration, item.filialGeneration
                    ),
                    # roles is padded and reversed alongside chain, so index i
                    # describes how item i was produced (None at the root).
                    role=roles[index] or ParentRole.CLONE_SOURCE,
                    method=event.method if event else None,
                    performedAt=event.performedAt if event else None,
                    mediumBatchCode=(
                        batch_codes.get(event.mediumBatchId) if event else None
                    ),
                )
            )

        return AncestryChain(
            accessionId=accession_id,
            steps=steps,
            hasBranching=has_branching,
            reachedUnknownOrigin=reached_unknown,
        )

    @staticmethod
    def _pick_primary(parents) -> Optional[object]:
        """Choose which parent the linear breadcrumb should follow."""
        if not parents:
            return None
        for role in _PRIMARY_ROLE_ORDER:
            for parent in parents:
                if parent.role == role:
                    return parent
        return parents[0]
