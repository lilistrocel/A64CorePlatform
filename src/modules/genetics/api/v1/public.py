"""
Genetics Repo Module - Public Label Info Route (T-804 step 3)

**This is the first unauthenticated route in the platform.** Auth in this
codebase is per-route via ``Depends(require_view)`` and friends — there is
no global middleware that exempts a route, so an unauthenticated route is
created simply by omitting the dependency. That makes it easy to create by
accident, which is exactly why this module exists on its own, mounted by
``register.py`` as a *separate* router with its own prefix rather than as
another entry in ``api/v1/__init__.py``'s ``api_router`` (which is mounted
at ``/api/v1/genetics`` and every route on it is authenticated). Keeping the
public surface structurally separate means nobody can later add an
unauthenticated route to the authenticated router by accident.

See ``Docs/2-Working-Progress/genetics-label-qr-spec.md`` §5.2 for the full
contract. Five rules are load-bearing and are called out again at the point
each is enforced below:

1. **Hand-built response model.** ``PublicAccessionInfo`` and its nested
   models are assembled field by field — never ``response_model=Accession``,
   never a ``model_dump()`` of an internal model with keys popped after the
   fact. The failure mode here is *leaking*, the inverse of the
   ``response_model``-strips-fields trap already documented in CLAUDE.md,
   and it fails silently in the more dangerous direction.
2. **Rate limited** — 30 req/min per IP, enforced explicitly in this module
   rather than relying on the platform-wide per-role limiter (see
   ``enforce_public_rate_limit`` below for why).
3. **Never returns** internal ids, ``location.roomId``/``unit``/``position``,
   ``notes``, ``tags``, ``createdBy``, ``divisionId``, ``organizationId``, or
   any accession's ``publicToken`` — including parents in the lineage array
   *and* every node/edge in ``lineageGraph`` (T-804 follow-up), which is
   keyed by ``accessionCode`` rather than the internal UUIDs the underlying
   ``LineageGraph`` model carries — see ``_build_lineage_graph``.
4. **404 for everything** — unknown token, disabled org, out-of-range
   vessel number, malformed input. Always the same status and body; never
   403, never a message that lets a caller distinguish *why* it failed.
   Anything that varies is an enumeration oracle against a token space that
   is otherwise only ~1.1e15 wide.
5. **Cache-Control: no-store** on every response this router returns,
   success or error — lineage changes, and a proxy holding a stale tree (or
   a stale "not found") is worse than a slow page.
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError

from src.middleware.rate_limit import rate_limiter
from src.models.organization import PublicInfoPageConfig
from src.services.organization_service import OrganizationService
from src.services.user_service import UserService

from ...models.accession import Accession
from ...models.lineage import AncestryStep, LineageGraph
from ...services.accession.accession_service import AccessionService
from ...services.accession.vessel_resolver import resolve_vessel
from ...services.common import doc_to_model
from ...services.database import ACCESSIONS, genetics_db
from ...services.line.line_service import LineService
from ...services.lineage.lineage_service import LineageService
from ...services.medium.medium_service import MediumService
from ...services.propagation.propagation_service import PropagationService

logger = logging.getLogger(__name__)

router = APIRouter()

_ACCESSION_ID_KEY = "accessionId"
_PROTOCOLS_COLLECTION = "protocols"

# The 404 every failure mode must return, byte-identical. A single shared
# constant rather than raising `HTTPException(404, "...")` at each call site
# guarantees that — a copy-paste divergence in wording at one of the several
# raise sites below would itself become the enumeration oracle rule 4 exists
# to prevent.
_NOT_FOUND_DETAIL = "No record found for this label."
_NO_STORE_HEADERS = {"Cache-Control": "no-store"}


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=_NOT_FOUND_DETAIL,
        headers=dict(_NO_STORE_HEADERS),
    )


# ---------------------------------------------------------------------------
# Rate limiting — 30 req/min per IP (spec §5.2 rule 2)
# ---------------------------------------------------------------------------

_PUBLIC_RATE_LIMIT_PER_MINUTE = 30


def _client_ip(request: Request) -> str:
    """Best-effort caller IP, honouring a proxy's X-Forwarded-For.

    Mirrors ``RateLimiter._get_client_id``'s IP-extraction logic exactly
    (this route has no authenticated user, so it is always the IP branch).
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def enforce_public_rate_limit(request: Request) -> None:
    """FastAPI dependency: 30 req/min per IP, independent of the guest tier.

    ``RateLimitMiddleware`` already wraps every request in the app and would
    apply *some* IP-based limit here via ``settings.RATE_LIMIT_GUEST`` — but
    that number is an operator-tunable platform default, not the number this
    security-sensitive public route is specified against. Coupling the two
    would mean an ops change to the guest tier silently changes the budget
    spec §5.2 mandates. This dependency instead calls the same Redis
    sliding-window primitives (`_check_rate_limit_redis` /
    `_check_rate_limit_memory`, same in-memory fallback behaviour) under a
    dedicated key namespace and a hardcoded limit, so the two stay
    independent by construction.

    Both underlying methods are async and MUST be awaited — see the
    LoginRateLimiter gotcha already on file for this codebase.
    """
    client_key = f"public_label:{_client_ip(request)}"

    redis_connected = await rate_limiter._ensure_redis_connection()
    try:
        if redis_connected:
            is_allowed, _count = await rate_limiter._check_rate_limit_redis(
                client_key, _PUBLIC_RATE_LIMIT_PER_MINUTE
            )
        else:
            is_allowed, _count = rate_limiter._check_rate_limit_memory(
                client_key, _PUBLIC_RATE_LIMIT_PER_MINUTE
            )
    except (RedisError, RedisConnectionError):
        is_allowed, _count = rate_limiter._check_rate_limit_memory(
            client_key, _PUBLIC_RATE_LIMIT_PER_MINUTE
        )

    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please retry shortly.",
            headers={**_NO_STORE_HEADERS, "Retry-After": "60"},
        )


# ---------------------------------------------------------------------------
# Response models — hand-built, field by field (spec §5.2 rule 1)
#
# Nothing here is `Accession` or any other internal model reused wholesale.
# Every field is named and typed explicitly so the leakage test in
# tests/unit/test_genetics/test_public_route.py can allowlist this exact
# shape and fail the moment a new field reaches it.
# ---------------------------------------------------------------------------


class PublicVesselInfo(BaseModel):
    number: int
    of: int = Field(..., description="labelledVesselCount at the time of the scan")
    splitOff: bool = Field(
        ..., description="True when this ordinal resolved to a different accession than the token addressed"
    )
    # T-805b (display half of T-805): sourced straight from the resolved
    # accession's `parents[0].vesselNo` — see `_primary_from_vessel_no`.
    # EXPOSURE NOTE: a vessel ordinal is a small integer, already printed on
    # the physical label, and meaningless without the token that addresses
    # this route in the first place — surfacing it here does not materially
    # widen what an unauthenticated scan of THIS label already reveals.
    fromVesselNo: Optional[int] = Field(
        None,
        description="Which vessel of the parent batch this material was taken from, e.g. plate #4. Null when not recorded.",
    )


class PublicLineInfo(BaseModel):
    code: str
    commonName: str
    scientificName: Optional[str] = None
    kind: str


class PublicIngredientInfo(BaseModel):
    """Only present when the tenant opts into showMediumIngredients."""
    name: str
    amount: Optional[float] = None
    unit: Optional[str] = None


class PublicMediumInfo(BaseModel):
    batchCode: Optional[str] = None
    recipeName: Optional[str] = None
    ingredients: Optional[List[PublicIngredientInfo]] = Field(
        None, description="null unless the tenant enabled showMediumIngredients"
    )


class PublicProtocolInfo(BaseModel):
    code: Optional[str] = None
    title: Optional[str] = None
    version: Optional[int] = None
    steps: Optional[List[str]] = Field(
        None, description="null unless the tenant enabled showProtocolSteps"
    )


class PublicLineageStep(BaseModel):
    """One hop in the ancestry breadcrumb, newest (depth 0) first.

    Deliberately carries only ``accessionCode`` — never ``accessionId`` —
    for every step including the root, per spec §5.2 rule 3 ("no internal
    UUIDs, including parents in the lineage array").
    """
    depth: int
    accessionCode: str
    generationLabel: str
    method: Optional[str] = None
    performedAt: Optional[datetime] = None
    provenance: Optional[str] = Field(
        None, description="Set instead of method/performedAt for founding material with no propagation event"
    )
    # T-805b: this step accession's own `parents[0].vesselNo` — same source
    # and same exposure judgement as `PublicVesselInfo.fromVesselNo` above,
    # just per hop, so the breadcrumb can read "G2-001 · #4" rather than
    # only naming the batch. Null at the root step (no parent to cite) and
    # whenever nobody recorded a vessel number.
    fromVesselNo: Optional[int] = Field(
        None,
        description="Which vessel of this step's own parent batch it was taken from, e.g. plate #4. Null when not recorded.",
    )


class PublicLineageGraphNode(BaseModel):
    """One accession in the public lineage graph (T-804 follow-up).

    Deliberately carries only ``accessionCode`` — never ``accessionId`` — as
    its identity, same rule as ``PublicLineageStep`` above. Nothing beyond
    these six fields; see ``_build_lineage_graph`` for the UUID -> code
    translation that makes this safe to build from ``LineageNode``.
    """
    code: str
    generationLabel: str
    form: str
    status: str
    isScanned: bool = Field(
        ..., description="True for the accession the scanned label/vessel ordinal resolved to"
    )
    depth: int


class PublicLineageGraphEdge(BaseModel):
    """One edge in the public lineage graph, keyed by ``accessionCode`` on
    both ends — never an internal accession UUID.

    ``from`` is a Python keyword, so the field is declared ``from_`` with an
    alias. FastAPI serializes response models with ``response_model_by_alias``
    defaulting to True, so the wire shape is exactly ``{"from": ..., "to": ...}``
    — ``populate_by_name`` only affects construction (this module builds
    instances with the ``from_=`` keyword), not serialization.
    """
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(..., alias="from")
    to: str
    # T-805b (graph half): which vessel of the `from` node the `to` node's
    # material was actually taken from — same meaning and same exposure
    # judgement as `PublicVesselInfo.fromVesselNo` / `PublicLineageStep.
    # fromVesselNo`, just per graph edge rather than per breadcrumb hop or
    # per scanned vessel. See `_build_lineage_graph` for why this is read off
    # the `to` accession's `ParentRef` entry that cites the `from` accession
    # specifically, never `parents[0]` — a cross has two parents, and two
    # edges into the same child must not collapse to one vessel number.
    fromVesselNo: Optional[int] = Field(
        None,
        description="Which vessel of the source node this edge's material was taken from, e.g. plate #4. Null when not recorded.",
    )


class PublicLineageGraph(BaseModel):
    """Bounded lineage DAG centred on the scanned vessel — ancestors and
    descendants, not just the linear ancestry ``lineage`` already carries.

    Built from ``LineageService.build_graph()`` (no new traversal code) and
    node-capped tighter than the authenticated route's own caps — see
    ``PUBLIC_LINEAGE_DEPTH`` / ``PUBLIC_LINEAGE_NODES`` below for why.
    """
    nodes: List[PublicLineageGraphNode] = Field(default_factory=list)
    edges: List[PublicLineageGraphEdge] = Field(default_factory=list)
    truncated: bool = Field(
        False,
        description="True when the underlying tree extends beyond what is shown here",
    )


class PublicAccessionInfo(BaseModel):
    """The complete public label-info response — spec §5.2."""

    accessionCode: str
    vessel: Optional[PublicVesselInfo] = Field(
        None, description="null when the request omitted a vessel ordinal (batch-level info)"
    )
    generationLabel: str
    line: PublicLineInfo
    form: str
    status: str
    acquiredAt: Optional[datetime] = None
    medium: Optional[PublicMediumInfo] = None
    protocol: Optional[PublicProtocolInfo] = None
    operator: Optional[str] = Field(None, description="Initials unless the tenant enabled showOperatorName")
    facility: Optional[str] = Field(None, description="null unless the tenant enabled showFacilityName")
    lineage: List[PublicLineageStep] = Field(default_factory=list)
    lineageGraph: PublicLineageGraph = Field(
        default_factory=PublicLineageGraph,
        description=(
            "Bounded lineage graph (ancestors + descendants) for drawing a real "
            "tree with the scanned vessel highlighted. Supplements `lineage`, "
            "does not replace it — see genetics-label-qr-spec.md §5.2."
        ),
    )


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------


async def _load_accession_by_token(token: str) -> Optional[Accession]:
    """Case-insensitive token lookup (spec §5.2 rule 6).

    Normalises to uppercase and matches with plain equality — NOT a regex —
    so the unique index on ``publicToken`` is used rather than defeated.
    Crockford base32 tokens are minted uppercase already; normalising the
    incoming value covers the 17mm-tape QR payload, which is printed
    uppercase to fit alphanumeric QR mode (spec §6.2).
    """
    normalized = token.strip().upper()
    if not normalized:
        return None
    db = genetics_db.get_database()
    doc = await db[ACCESSIONS].find_one({"publicToken": normalized})
    if not doc:
        return None
    return doc_to_model(doc, Accession, _ACCESSION_ID_KEY)


async def _get_public_config(organization_id: Optional[str]) -> PublicInfoPageConfig:
    """Resolve the tenant's PublicInfoPageConfig.

    No organization on the accession (legacy/dev data created without a
    tenant scope) defaults to ``PublicInfoPageConfig()`` — i.e. enabled,
    matching the field's own default. A dangling ``organizationId`` that no
    longer resolves to a real organization defaults CLOSED
    (``enabled=False``) instead: a data-integrity anomaly should never fail
    open on a public route.
    """
    if not organization_id:
        return PublicInfoPageConfig()
    org = await OrganizationService.get_organization(organization_id)
    if org is None:
        logger.warning(
            "[public.genetics] accession references organizationId=%s which does not exist",
            organization_id,
        )
        return PublicInfoPageConfig(enabled=False)
    return org.modules.publicInfoPage


# ---------------------------------------------------------------------------
# Response assembly — every lookup below is best-effort. This page is
# reachable by anyone with a camera and must degrade (a blank field) rather
# than 500 when a denormalised reference (line, medium batch, propagation
# event, protocol, operator) is missing or stale, matching the "never raise
# on malformed data" philosophy vessel_resolver.py documents for the same
# reason. The token/org/range gate above is the only place this route is
# allowed to 404.
# ---------------------------------------------------------------------------


async def _build_line_info(line_id: str) -> PublicLineInfo:
    try:
        line = await LineService.get_line(line_id)
    except HTTPException:
        logger.warning("[public.genetics] line %s not found for public info page", line_id)
        return PublicLineInfo(code="", commonName="", scientificName=None, kind="other")
    return PublicLineInfo(
        code=line.code,
        commonName=line.commonName,
        scientificName=line.scientificName,
        kind=line.kind.value,
    )


async def _build_medium_info(medium_batch_id: Optional[str], show_ingredients: bool) -> Optional[PublicMediumInfo]:
    if not medium_batch_id:
        return None
    try:
        batch = await MediumService.get_batch(medium_batch_id)
    except HTTPException:
        return None

    ingredients = None
    if show_ingredients:
        ingredients = [
            PublicIngredientInfo(
                name=ingredient.name,
                amount=ingredient.amount,
                unit=ingredient.unit.value if ingredient.unit else None,
            )
            for ingredient in batch.ingredientsSnapshot
        ]

    return PublicMediumInfo(
        batchCode=batch.batchCode,
        recipeName=batch.recipeName,
        ingredients=ingredients,
    )


async def _fetch_protocol_steps(protocol_id: str) -> Optional[List[str]]:
    """Best-effort step text for the pinned protocol.

    Reads the live ``protocols`` collection directly (matching
    ``protocol_link.build_protocol_ref``'s own precedent for reading this
    collection without importing the protocols module's service layer).
    Note this reads the *current* document, not the version pinned on the
    event — same limitation ``protocolRef`` already carries by only pinning
    code/title/version rather than a content snapshot; not something this
    route can fix.
    """
    db = genetics_db.get_database()
    try:
        doc = await db[_PROTOCOLS_COLLECTION].find_one({"protocolId": protocol_id})
    except Exception:
        logger.warning("[public.genetics] protocol steps lookup failed for %s", protocol_id)
        return None
    if not doc:
        return None
    raw_steps = doc.get("steps") or []
    ordered = sorted(raw_steps, key=lambda s: s.get("order", 0))
    texts = [s.get("text", "") for s in ordered if s.get("text")]
    return texts or None


async def _build_protocol_info(source_event_id: Optional[str], show_steps: bool) -> Optional[PublicProtocolInfo]:
    if not source_event_id:
        return None
    try:
        event = await PropagationService.get_event(source_event_id)
    except HTTPException:
        return None

    ref = event.protocolRef
    if not ref:
        return None

    steps = None
    if show_steps and ref.get("protocolId"):
        steps = await _fetch_protocol_steps(ref["protocolId"])

    return PublicProtocolInfo(
        code=ref.get("code"),
        title=ref.get("title"),
        version=ref.get("version"),
        steps=steps,
    )


async def _build_operator(created_by: Optional[str], show_full_name: bool) -> Optional[str]:
    if not created_by:
        return None
    try:
        user = await UserService.get_user_by_id(created_by)
    except Exception:
        logger.warning("[public.genetics] operator lookup failed for %s", created_by)
        return None
    if not user or not user.firstName or not user.lastName:
        return None
    if show_full_name:
        return f"{user.firstName} {user.lastName}"
    return f"{user.firstName[0]}.{user.lastName[0]}."


def _primary_from_vessel_no(accession: Accession) -> Optional[int]:
    """The vessel of its parent batch `accession`'s primary parent slot
    cites, if recorded (T-805a: ``ParentRef.vesselNo``) — T-805b's whole
    contribution is surfacing this on the public route. Reads
    ``parents[0]`` directly rather than picking a "primary" parent the way
    ``LineageService._pick_primary`` does for a cross's linear breadcrumb —
    T-805a only ever records a vessel number on the parent slot a transfer
    was actually taken from, and a founding/no-parent accession has nothing
    to report here regardless.
    """
    if not accession.parents:
        return None
    return accession.parents[0].vesselNo


def _vessel_no_cited_by_child(child: Optional[Accession], from_accession_id: Optional[str]) -> Optional[int]:
    """The vessel number on `child`'s specific `ParentRef` entry that cites
    `from_accession_id` — used for `PublicLineageGraphEdge.fromVesselNo`.

    Deliberately NOT `child.parents[0].vesselNo`. A cross's `parents` list
    has two entries, one per parent; an edge runs parent -> child, and the
    vessel number that belongs to *this* edge is the one recorded on the
    entry whose `accessionId` matches this edge's source node, not
    whichever entry happens to sit first. Taking index 0 unconditionally
    would silently attribute one parent's vessel number to both incoming
    edges — wrong data on a public page. No match (child missing from the
    batched fetch, or no `ParentRef` citing this parent) yields None rather
    than a guess.
    """
    if child is None or from_accession_id is None:
        return None
    for parent in child.parents:
        if parent.accessionId == from_accession_id:
            return parent.vesselNo
    return None


async def _build_lineage(accession: Accession) -> List[PublicLineageStep]:
    """Ancestry breadcrumb, newest first, built from LineageService's
    existing capped BFS walk — spec §5.2: "reuses LineageService's existing
    BFS walk and its MAX_LINEAGE_DEPTH / MAX_LINEAGE_NODES caps, no new
    traversal code, no unbounded query reachable without authentication."

    ``LineageService.get_ancestry`` returns root-first (oldest first); the
    public shape wants newest (the scanned accession itself) at depth 0, so
    the list is reversed here rather than by touching the shared service.
    """
    try:
        chain = await LineageService.get_ancestry(accession.id)
    except Exception:
        logger.warning("[public.genetics] ancestry lookup failed for %s", accession.id)
        return []

    ordered: List[AncestryStep] = list(reversed(chain.steps))

    # Founding material (no propagation event -> step.method is None) shows
    # its provenance note instead of a method/date, and every step (T-805b)
    # needs its own `parents[0].vesselNo` for `fromVesselNo` — neither is
    # carried by AncestryStep itself, so both are read off one batched fetch
    # of the full Accession record for every step that has an id, via the
    # same batched accession lookup LineageService itself uses internally —
    # not a new traversal, just reading fields AncestryStep doesn't carry.
    step_ids = [step.accessionId for step in ordered if step.accessionId]
    accessions_by_id: Dict[str, Accession] = {}
    if step_ids:
        try:
            accessions_by_id = await AccessionService.get_many(step_ids)
        except Exception:
            accessions_by_id = {}

    provenance_map: Dict[str, str] = {}
    for accession_id, related in accessions_by_id.items():
        if related.provenance and related.provenance.sourceNote:
            provenance_map[accession_id] = related.provenance.sourceNote
        elif related.provenance:
            provenance_map[accession_id] = related.provenance.type.value

    steps: List[PublicLineageStep] = []
    for depth, step in enumerate(ordered):
        related = accessions_by_id.get(step.accessionId) if step.accessionId else None
        steps.append(
            PublicLineageStep(
                depth=depth,
                accessionCode=step.accessionCode or "",
                generationLabel=step.generationLabel or "",
                method=step.method.value if step.method else None,
                performedAt=step.performedAt,
                provenance=provenance_map.get(step.accessionId) if step.method is None else None,
                fromVesselNo=_primary_from_vessel_no(related) if related else None,
            )
        )
    return steps


# ---------------------------------------------------------------------------
# Lineage graph caps — deliberately tighter than the authenticated route's
# settings.MAX_LINEAGE_DEPTH=25 / MAX_LINEAGE_NODES=500 (module settings.py).
#
# EXPOSURE NOTE: returning a bounded graph instead of only the linear
# `lineage` breadcrumb is a deliberate widening of what one scanned label
# reveals — previously a straight ancestry chain (~4 nodes typical), now
# siblings and descendants too. That widening is the point of this change
# (spec follow-up: "draw a real tree with the scanned vessel highlighted").
# The two caps below are what keep it bounded on an unauthenticated,
# rate-limited endpoint — do not raise them, and do not "tidy" them away to
# match the authenticated route's caps, without re-deriving this tradeoff.
PUBLIC_LINEAGE_DEPTH = 8
PUBLIC_LINEAGE_NODES = 60


async def _build_lineage_graph(accession: Accession) -> PublicLineageGraph:
    """Bounded lineage DAG centred on the resolved (scanned) accession.

    Reuses ``LineageService.build_graph`` verbatim — no new traversal code —
    with the public-only caps above. ``accession`` here is always the
    already-resolved accession (post ``resolve_vessel``), so the graph is
    centred on whichever record actually holds the scanned physical vessel,
    not the one the token originally addressed.

    UUID -> code translation (the part that matters): ``LineageNode`` /
    ``LineageEdge`` carry internal accession UUIDs so a cross's second parent
    can be referenced by graph identity. Those UUIDs must never reach this
    public route (spec §5.2 rule 3). ``accessionCode`` is already public — it
    is printed on the label — so it becomes the public node key instead, and
    every edge endpoint is rewritten through a ``{uuid: code}`` map built
    from the (possibly truncated) node set. An edge whose endpoint fails to
    translate — dropped by the node cap, or a null "unknown parent" stub — is
    dropped rather than emitted with a dangling id.
    """
    try:
        graph: LineageGraph = await LineageService.build_graph(
            root_accession_id=accession.id,
            include_ancestors=True,
            include_descendants=True,
            max_depth=PUBLIC_LINEAGE_DEPTH,
        )
    except Exception:
        logger.warning("[public.genetics] lineage graph build failed for %s", accession.id)
        return PublicLineageGraph()

    nodes = graph.nodes
    truncated = graph.truncated

    if len(nodes) > PUBLIC_LINEAGE_NODES:
        truncated = True
        # Keep the scanned node and whichever nodes sit nearest it by depth
        # (depths are already normalised by LineageService so the scanned
        # root is not necessarily depth 0 — ancestors can sit at 0 instead).
        root_depth = next((n.depth for n in nodes if n.isRoot), 0)
        nodes = sorted(
            nodes, key=lambda n: (abs(n.depth - root_depth), n.depth, n.accessionCode)
        )[:PUBLIC_LINEAGE_NODES]

    code_by_id: Dict[str, str] = {n.accessionId: n.accessionCode for n in nodes}

    public_nodes = [
        PublicLineageGraphNode(
            code=n.accessionCode,
            generationLabel=n.generationLabel,
            form=n.form.value,
            status=n.status.value,
            isScanned=n.isRoot,
            depth=n.depth,
        )
        for n in nodes
    ]

    # T-805b (graph half): `LineageNode` is deliberately trimmed and carries
    # no `parents` — `build_graph` reads full `Accession` objects internally
    # to assemble the graph but does not return them. A second batched fetch
    # (same `AccessionService.get_many` the ancestry breadcrumb above already
    # uses, not new traversal code) pulls back each edge's `to` accession so
    # its `parents` list is available to read `ParentRef.vesselNo` off.
    # Scoped to edges that will actually survive translation below — no point
    # fetching a child whose edge is about to be dropped for a UUID that
    # never became a node.
    child_ids = {
        edge.toAccessionId
        for edge in graph.edges
        if edge.fromAccessionId in code_by_id and edge.toAccessionId in code_by_id
    }
    children_by_id: Dict[str, Accession] = {}
    if child_ids:
        try:
            children_by_id = await AccessionService.get_many(list(child_ids))
        except Exception:
            logger.warning(
                "[public.genetics] batched child fetch for lineage-graph vessel numbers failed for %s",
                accession.id,
            )
            children_by_id = {}

    public_edges: List[PublicLineageGraphEdge] = []
    for edge in graph.edges:
        from_code = code_by_id.get(edge.fromAccessionId) if edge.fromAccessionId else None
        to_code = code_by_id.get(edge.toAccessionId)
        if from_code is None or to_code is None:
            continue
        public_edges.append(
            PublicLineageGraphEdge(
                from_=from_code,
                to=to_code,
                fromVesselNo=_vessel_no_cited_by_child(
                    children_by_id.get(edge.toAccessionId), edge.fromAccessionId
                ),
            )
        )

    return PublicLineageGraph(nodes=public_nodes, edges=public_edges, truncated=truncated)


async def _assemble_info(
    accession: Accession,
    vessel_no: Optional[int],
    labelled_vessel_count: int,
    split_off: bool,
    config: PublicInfoPageConfig,
) -> PublicAccessionInfo:
    line_info = await _build_line_info(accession.lineId)
    medium_info = await _build_medium_info(accession.mediumBatchId, config.showMediumIngredients)
    protocol_info = await _build_protocol_info(accession.sourceEventId, config.showProtocolSteps)
    operator = await _build_operator(accession.createdBy, config.showOperatorName)
    facility = accession.location.facility if config.showFacilityName else None
    lineage = await _build_lineage(accession)
    lineage_graph = await _build_lineage_graph(accession)

    vessel = None
    if vessel_no is not None:
        vessel = PublicVesselInfo(
            number=vessel_no,
            of=labelled_vessel_count,
            splitOff=split_off,
            fromVesselNo=_primary_from_vessel_no(accession),
        )

    return PublicAccessionInfo(
        accessionCode=accession.accessionCode,
        vessel=vessel,
        generationLabel=accession.generationLabel,
        line=line_info,
        form=accession.form.value,
        status=accession.status.value,
        acquiredAt=accession.acquiredAt,
        medium=medium_info,
        protocol=protocol_info,
        operator=operator,
        facility=facility,
        lineage=lineage,
        lineageGraph=lineage_graph,
    )


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------


async def _handle_public_info(token: str, vessel_no_raw: Optional[str], response: Response) -> PublicAccessionInfo:
    response.headers["Cache-Control"] = "no-store"

    accession = await _load_accession_by_token(token)
    if accession is None:
        raise _not_found()

    config = await _get_public_config(accession.organizationId)
    if not config.enabled:
        raise _not_found()

    vessel_no: Optional[int] = None
    if vessel_no_raw is not None:
        try:
            vessel_no = int(vessel_no_raw)
        except ValueError:
            raise _not_found()
        if vessel_no < 1 or vessel_no > accession.labelledVesselCount:
            raise _not_found()

    try:
        resolved = accession
        split_off = False
        if vessel_no is not None:
            resolved = await resolve_vessel(accession, vessel_no)
            split_off = resolved.id != accession.id

        return await _assemble_info(
            resolved,
            vessel_no,
            accession.labelledVesselCount,
            split_off,
            config,
        )
    except HTTPException:
        raise
    except Exception:
        # Anything unexpected while assembling the response degrades to the
        # same 404 the client sees for an unknown token — the full detail is
        # logged server-side only (see api-developer error-handling rule:
        # generic message to the client, specifics in the log). This is a
        # public, unauthenticated route; nothing beyond "not found" should
        # ever reach an anonymous caller.
        logger.exception("[public.genetics] failed to assemble public info for a valid token")
        raise _not_found()


@router.get(
    "/i/{token}",
    response_model=PublicAccessionInfo,
    summary="Public batch-level label info (unauthenticated)",
    description=(
        "Resolves a scanned label's opaque token to batch-level accession "
        "info. No vessel ordinal -> `vessel` is null. See "
        "genetics-label-qr-spec.md §5.2. No auth dependency by design — see "
        "the module docstring for why this router is mounted separately."
    ),
    dependencies=[Depends(enforce_public_rate_limit)],
)
async def get_public_batch_info(
    token: str,
    response: Response,
) -> PublicAccessionInfo:
    return await _handle_public_info(token, None, response)


@router.get(
    "/i/{token}/{vessel_no}",
    response_model=PublicAccessionInfo,
    summary="Public per-vessel label info (unauthenticated)",
    description=(
        "Resolves a scanned label's opaque token + printed vessel ordinal, "
        "following any batch splits forward to the accession that currently "
        "holds that physical vessel. See genetics-label-qr-spec.md §5.2 and §3. "
        "No auth dependency by design — see the module docstring for why this "
        "router is mounted separately."
    ),
    dependencies=[Depends(enforce_public_rate_limit)],
)
async def get_public_vessel_info(
    token: str,
    vessel_no: str,
    response: Response,
) -> PublicAccessionInfo:
    return await _handle_public_info(token, vessel_no, response)


__all__ = ["router", "PublicAccessionInfo"]
