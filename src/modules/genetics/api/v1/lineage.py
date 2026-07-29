"""
Genetics Repo Module - Lineage API Routes

The lineage DAG and the flattened ancestry breadcrumb.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ...models.lineage import AncestryChain, LineageGraph
from ...services.lineage.lineage_service import LineageService
from ...utils.responses import SuccessResponse

from ...middleware.auth import (
    CurrentUser,
    require_permission,
    require_view,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/graph",
    response_model=SuccessResponse[LineageGraph],
    summary="Build a lineage graph",
    description=(
        "Returns flat nodes + edges rather than a nested tree, because a cross "
        "gives a node two parents. Supply accessionId to walk out from one "
        "accession, or lineId for every accession on a line. Traversal is "
        "capped by depth and node count; check `truncated` on the response."
    ),
)
async def get_lineage_graph(
    accessionId: Optional[str] = Query(None, description="Root accession to walk out from"),
    lineId: Optional[str] = Query(None, description="Graph every accession on this line"),
    includeAncestors: bool = Query(True),
    includeDescendants: bool = Query(True),
    maxDepth: Optional[int] = Query(None, ge=1, le=25),
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[LineageGraph]:
    graph = await LineageService.build_graph(
        root_accession_id=accessionId,
        line_id=lineId,
        include_ancestors=includeAncestors,
        include_descendants=includeDescendants,
        max_depth=maxDepth,
    )
    return SuccessResponse(data=graph)


@router.get(
    "/ancestry/{accession_id}",
    response_model=SuccessResponse[AncestryChain],
    summary="Get the ancestry breadcrumb for an accession",
    description=(
        "Root-first path back through the primary parent at each hop. "
        "`hasBranching` flags that a cross was passed through and the full "
        "graph is worth opening; `reachedUnknownOrigin` flags ancestry that "
        "was never recorded."
    ),
)
async def get_ancestry(
    accession_id: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[AncestryChain]:
    chain = await LineageService.get_ancestry(accession_id)
    return SuccessResponse(data=chain)
