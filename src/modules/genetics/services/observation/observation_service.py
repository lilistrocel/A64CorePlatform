"""
Genetics Repo Module - Observation Service

Records dated observations against accessions and handles trait promotion —
turning a flagged observation into its own genetic line.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from ...models.accession import Accession, ParentRef
from ...models.enums import ObservationType, ParentRole
from ...models.line import Line, LineCreate, Provenance
from ...models.enums import ProvenanceType
from ...models.observation import (
    Observation,
    ObservationCreate,
    ObservationUpdate,
    PromoteTraitRequest,
)
from ..accession.accession_service import AccessionService
from ..common import doc_to_model, model_to_doc, scope_fields
from ..database import OBSERVATIONS, genetics_db
from ..line.line_service import LineService

logger = logging.getLogger(__name__)

_ID_KEY = "observationId"
_ACCESSION_ID_KEY = "accessionId"


class ObservationService:
    """Service for accession observations and trait promotion."""

    # -----------------------------------------------------------------------
    # Create
    # -----------------------------------------------------------------------

    @staticmethod
    async def create_observation(
        data: ObservationCreate,
        current_user: Any,
    ) -> Observation:
        accession = await AccessionService.get_accession(data.accessionId)
        ObservationService._validate_vessel_no(data.vesselNo, accession)
        db = genetics_db.get_database()

        payload = data.model_dump()
        payload["observedAt"] = data.observedAt or datetime.utcnow()

        scope = scope_fields(current_user)
        observation = Observation(
            **payload,
            lineId=accession.lineId,
            observedBy=scope.get("createdBy"),
            divisionId=scope.get("divisionId"),
            organizationId=scope.get("organizationId"),
        )

        await db[OBSERVATIONS].insert_one(model_to_doc(observation, _ID_KEY))
        logger.info(
            f"[ObservationService] Recorded {observation.type} observation on "
            f"{accession.accessionCode}"
            + (" (novel trait)" if observation.isNovelTrait else "")
        )
        return observation

    # -----------------------------------------------------------------------
    # Validation
    # -----------------------------------------------------------------------

    @staticmethod
    def _validate_vessel_no(vessel_no: Optional[int], accession: Accession) -> None:
        """Reject a ``vesselNo`` that cannot point at a real physical vessel.

        T-805b. Mirrors ``PropagationService._validate_vessel_numbers`` —
        same field, same shape, same reasoning. ``vesselNo`` is optional; an
        observation without it runs none of these checks, matching every
        observation recorded before this field existed. A lab that
        hand-numbers its plates without ever printing labels still has a
        meaningful "vessel 4 of 6", so the ceiling is deliberately the larger
        of the two counters rather than ``labelledVesselCount`` alone.
        """
        if vessel_no is None:
            return

        ceiling = max(accession.labelledVesselCount, accession.quantity)

        if ceiling < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Accession '{accession.accessionCode}' has neither a "
                    f"labelledVesselCount nor a quantity that could contain "
                    f"vessel {vessel_no}"
                ),
            )

        if not (1 <= vessel_no <= ceiling):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"vesselNo {vessel_no} is outside the valid range "
                    f"1..{ceiling} for accession '{accession.accessionCode}'"
                ),
            )

    # -----------------------------------------------------------------------
    # Read
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_observation(observation_id: str) -> Observation:
        db = genetics_db.get_database()
        doc = await db[OBSERVATIONS].find_one({_ID_KEY: observation_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Observation '{observation_id}' not found",
            )
        return doc_to_model(doc, Observation, _ID_KEY)

    @staticmethod
    async def list_observations(
        skip: int = 0,
        limit: int = 50,
        accession_id: Optional[str] = None,
        line_id: Optional[str] = None,
        obs_type: Optional[str] = None,
        novel_only: bool = False,
    ) -> Tuple[List[Observation], int]:
        db = genetics_db.get_database()

        query: Dict[str, Any] = {}
        if accession_id:
            query["accessionId"] = accession_id
        if line_id:
            query["lineId"] = line_id
        if obs_type:
            query["type"] = obs_type
        if novel_only:
            query["isNovelTrait"] = True

        total = await db[OBSERVATIONS].count_documents(query)
        cursor = (
            db[OBSERVATIONS]
            .find(query)
            .sort("observedAt", -1)
            .skip(skip)
            .limit(limit)
        )

        observations: List[Observation] = []
        async for doc in cursor:
            observations.append(doc_to_model(doc, Observation, _ID_KEY))
        return observations, total

    # -----------------------------------------------------------------------
    # Update
    # -----------------------------------------------------------------------

    @staticmethod
    async def update_observation(
        observation_id: str,
        data: ObservationUpdate,
    ) -> Observation:
        await ObservationService.get_observation(observation_id)

        update_fields = data.model_dump(exclude_unset=True, exclude_none=True)
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )

        update_fields["updatedAt"] = datetime.utcnow()
        db = genetics_db.get_database()
        await db[OBSERVATIONS].update_one({_ID_KEY: observation_id}, {"$set": update_fields})
        return await ObservationService.get_observation(observation_id)

    # -----------------------------------------------------------------------
    # Trait promotion
    # -----------------------------------------------------------------------

    @staticmethod
    async def promote_trait(
        observation_id: str,
        data: PromoteTraitRequest,
        current_user: Any,
    ) -> Tuple[Line, Optional[Accession]]:
        """Promote a flagged observation into a new genetic line.

        The new line is parented to the observed accession's line, and — unless
        suppressed — a founding accession is minted from the observed material.
        That founding accession keeps the observed accession as its parent, so
        the physical chain back to the original dish is unbroken even though
        the genetics are now tracked separately.
        """
        observation = await ObservationService.get_observation(observation_id)

        if observation.promotedToLineId:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Observation already promoted to line "
                    f"'{observation.promotedToLineId}'"
                ),
            )

        source = await AccessionService.get_accession(observation.accessionId)
        parent_line = await LineService.get_line(source.lineId)

        new_line = await LineService.create_line(
            LineCreate(
                code=data.code,
                commonName=data.commonName,
                kind=parent_line.kind,
                scientificName=parent_line.scientificName,
                species=parent_line.species,
                description=data.description,
                notes=data.notes,
                parentLineId=parent_line.id,
                derivation=data.derivation,
                provenance=Provenance(
                    type=ProvenanceType.IN_HOUSE,
                    sourceNote=(
                        f"Promoted from observation on {source.accessionCode}"
                        + (f" — {observation.traitName}" if observation.traitName else "")
                    ),
                    acquiredAt=observation.observedAt,
                ),
                tags=list(parent_line.tags),
                linkedStrainId=parent_line.linkedStrainId,
                linkedPlantDataId=parent_line.linkedPlantDataId,
            ),
            current_user,
        )

        founding: Optional[Accession] = None
        if data.createFoundingAccession:
            from ...models.accession import AccessionCreate

            founding = await AccessionService.create_accession(
                AccessionCreate(
                    lineId=new_line.id,
                    form=source.form,
                    quantity=1,
                    unit=source.unit,
                    mediumBatchId=source.mediumBatchId,
                    location=source.location,
                    acquiredAt=observation.observedAt,
                    label=data.commonName,
                    notes=(
                        f"Founding material isolated from {source.accessionCode}"
                    ),
                    # The isolate is the same physical material, so generations
                    # restart: it is a new genetic identity from this point on.
                    cloneGeneration=0,
                    filialGeneration=0,
                    parents=[
                        ParentRef(
                            accessionId=source.id,
                            role=ParentRole.CLONE_SOURCE,
                            lineId=source.lineId,
                            note="Isolated as a novel trait",
                        )
                    ],
                ),
                current_user,
            )

        db = genetics_db.get_database()
        await db[OBSERVATIONS].update_one(
            {_ID_KEY: observation_id},
            {
                "$set": {
                    "promotedToLineId": new_line.id,
                    "updatedAt": datetime.utcnow(),
                }
            },
        )

        logger.info(
            f"[ObservationService] Promoted observation {observation_id} on "
            f"{source.accessionCode} into line {new_line.code}"
        )
        return new_line, founding

    # -----------------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------------

    @staticmethod
    async def latest_for_accessions(
        accession_ids: List[str],
    ) -> Dict[str, Observation]:
        """Most recent observation per accession, for list badges."""
        if not accession_ids:
            return {}

        db = genetics_db.get_database()
        pipeline = [
            {"$match": {"accessionId": {"$in": list(set(accession_ids))}}},
            {"$sort": {"observedAt": -1}},
            {"$group": {"_id": "$accessionId", "doc": {"$first": "$$ROOT"}}},
        ]

        result: Dict[str, Observation] = {}
        async for row in db[OBSERVATIONS].aggregate(pipeline):
            result[row["_id"]] = doc_to_model(row["doc"], Observation, _ID_KEY)
        return result
