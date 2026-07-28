"""
Genetics Repo Module - Lineage Graph Models

Response shapes for the lineage views. The graph is a DAG, not a tree — a
cross gives a node two parents — so it is returned as flat nodes + edges and
laid out client-side rather than as a nested structure.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .enums import (
    AccessionStatus,
    ParentRole,
    PropagationMethod,
    ReproductionMode,
    VesselForm,
)


class LineageNode(BaseModel):
    """One accession in the lineage graph."""

    accessionId: str
    accessionCode: str
    lineId: str
    lineCode: Optional[str] = None
    lineName: Optional[str] = None

    cloneGeneration: int = 0
    filialGeneration: int = 0
    generationLabel: str = "G0"

    form: VesselForm
    quantity: int = 0
    unit: str = "vessels"
    status: AccessionStatus = AccessionStatus.ACTIVE

    mediumBatchId: Optional[str] = None
    mediumBatchCode: Optional[str] = None

    acquiredAt: Optional[datetime] = None
    createdAt: Optional[datetime] = None

    depth: int = Field(0, description="Distance from the queried root, 0 = root")
    isRoot: bool = False
    hasUnknownParent: bool = Field(
        False,
        description="True when a parent slot is recorded but unidentified",
    )


class LineageEdge(BaseModel):
    """A propagation link between two accessions."""

    fromAccessionId: Optional[str] = Field(
        None,
        description="Null when the parent is recorded but unidentified",
    )
    toAccessionId: str
    role: ParentRole = ParentRole.CLONE_SOURCE
    eventId: Optional[str] = None
    method: Optional[PropagationMethod] = None
    reproductionMode: Optional[ReproductionMode] = None
    performedAt: Optional[datetime] = None
    mediumBatchId: Optional[str] = None
    mediumBatchCode: Optional[str] = None


class LineageGraph(BaseModel):
    """Flat DAG returned by the lineage endpoints."""

    rootAccessionId: Optional[str] = None
    rootLineId: Optional[str] = None
    nodes: List[LineageNode] = Field(default_factory=list)
    edges: List[LineageEdge] = Field(default_factory=list)
    maxDepth: int = 0
    truncated: bool = Field(
        False,
        description="True when the traversal hit the depth or node cap",
    )


class AncestryStep(BaseModel):
    """One hop in the flattened ancestry breadcrumb of a single accession."""

    accessionId: Optional[str] = None
    accessionCode: Optional[str] = None
    lineId: Optional[str] = None
    lineCode: Optional[str] = None
    generationLabel: Optional[str] = None
    role: ParentRole = ParentRole.CLONE_SOURCE
    method: Optional[PropagationMethod] = None
    performedAt: Optional[datetime] = None
    mediumBatchCode: Optional[str] = None
    isUnknown: bool = Field(False, description="Parent slot exists but was never identified")


class AncestryChain(BaseModel):
    """Root-first ancestry path for one accession.

    Where a cross introduces two parents the chain follows the primary parent
    (clone source, then seed parent/dam) and flags the branch point, keeping
    the breadcrumb linear for display. The full DAG is available from the
    lineage graph endpoint.
    """

    accessionId: str
    steps: List[AncestryStep] = Field(default_factory=list)
    hasBranching: bool = Field(
        False,
        description="True when some step had a second parent not shown in this chain",
    )
    reachedUnknownOrigin: bool = Field(
        False,
        description="True when the chain terminates in unrecorded ancestry",
    )
