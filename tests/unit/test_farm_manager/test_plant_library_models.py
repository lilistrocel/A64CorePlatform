"""
Light model-validation tests for the Plant Library Phase 1 data model
(mother/variety hierarchy).

Phase 1 is additive-only and must not break any existing document that
predates the migration. These tests are the backward-compatibility proof:

  - PlantMother (new model) constructs with and without scientificName.
  - PlantDataEnhanced (existing "variety" model) constructs identically
    whether or not the two new fields (motherPlantId, varietyName) are
    present — proving a pre-migration document (which has neither field)
    still validates.
  - Block (existing model) constructs identically whether or not the two
    new fields (productMotherId, productName) are present — same proof for
    blocks.

No database access; pure Pydantic construction.
"""

import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from src.modules.farm_manager.models.plant_mother import (
    PlantMother,
    PlantMotherCreate,
)
from src.modules.farm_manager.models.plant_data_enhanced import (
    PlantDataEnhanced,
    FarmTypeEnum,
    GrowthCycleDuration,
    YieldInfo,
)
from src.modules.farm_manager.models.block import Block


# ---------------------------------------------------------------------------
# PlantMother
# ---------------------------------------------------------------------------


class TestPlantMotherModel:
    def test_constructs_with_scientific_name(self):
        mother = PlantMother(
            plantName="Cabbage",
            scientificName="Brassica oleracea",
            plantType="vegetable",
            createdBy=uuid.uuid4(),
            createdByEmail="agronomist@example.com",
        )
        assert mother.plantName == "Cabbage"
        assert mother.scientificName == "Brassica oleracea"
        assert mother.plantType == "vegetable"
        assert isinstance(mother.plantMotherId, uuid.UUID)
        assert mother.isActive is True
        assert mother.deletedAt is None

    def test_constructs_without_scientific_name(self):
        mother = PlantMother(plantName="Cabbage")
        assert mother.scientificName is None
        # plantType defaults to 'crop' when not specified
        assert mother.plantType == "crop"

    def test_constructs_without_created_by(self):
        # Migration-created records have no acting user — createdBy/
        # createdByEmail must be Optional (unlike PlantDataEnhanced, where
        # they are required).
        mother = PlantMother(plantName="Tomato")
        assert mother.createdBy is None
        assert mother.createdByEmail is None

    def test_invalid_plant_type_rejected(self):
        with pytest.raises(ValidationError):
            PlantMother(plantName="Cabbage", plantType="not-a-real-type")

    def test_create_schema_minimal(self):
        create = PlantMotherCreate(plantName="Lettuce")
        assert create.plantName == "Lettuce"
        assert create.plantType == "crop"


# ---------------------------------------------------------------------------
# PlantDataEnhanced ("variety") — backward compatibility with pre-migration
# documents that have neither motherPlantId nor varietyName.
# ---------------------------------------------------------------------------


def _minimal_variety_kwargs(**overrides):
    kwargs = dict(
        plantName="Tomato",
        farmTypeCompatibility=[FarmTypeEnum.GREENHOUSE],
        growthCycle=GrowthCycleDuration(totalCycleDays=90),
        yieldInfo=YieldInfo(yieldPerPlant=5.0, yieldUnit="kg"),
        createdBy=uuid.uuid4(),
        createdByEmail="agronomist@example.com",
    )
    kwargs.update(overrides)
    return kwargs


class TestPlantDataEnhancedBackwardCompatibility:
    def test_constructs_without_mother_fields(self):
        # Simulates a pre-migration document loaded straight from Mongo.
        variety = PlantDataEnhanced(**_minimal_variety_kwargs())
        assert variety.motherPlantId is None
        assert variety.varietyName is None
        # Untouched fields still behave exactly as before.
        assert variety.plantName == "Tomato"
        assert variety.dataVersion == 1
        assert variety.isActive is True

    def test_constructs_with_mother_fields(self):
        mother_id = uuid.uuid4()
        variety = PlantDataEnhanced(
            **_minimal_variety_kwargs(
                motherPlantId=mother_id,
                varietyName="Standard",
            )
        )
        assert variety.motherPlantId == mother_id
        assert variety.varietyName == "Standard"
        # plantName/scientificName are unchanged in meaning — not replaced
        # by varietyName.
        assert variety.plantName == "Tomato"

    def test_plant_data_id_is_never_implicitly_reissued(self):
        # plantDataId defaults via uuid4() only when not supplied; supplying
        # one must be respected exactly (the migration must never overwrite
        # this field — this test guards the model side of that contract).
        fixed_id = uuid.uuid4()
        variety = PlantDataEnhanced(
            **_minimal_variety_kwargs(plantDataId=fixed_id)
        )
        assert variety.plantDataId == fixed_id


# ---------------------------------------------------------------------------
# Block — backward compatibility with pre-migration documents that have
# neither productMotherId nor productName.
# ---------------------------------------------------------------------------


class TestBlockBackwardCompatibility:
    def test_constructs_without_product_fields(self):
        block = Block(farmId=uuid.uuid4())
        assert block.productMotherId is None
        assert block.productName is None
        # targetCrop/targetCropName unaffected by the new fields.
        assert block.targetCrop is None
        assert block.targetCropName is None

    def test_constructs_with_product_fields_alongside_target_crop(self):
        variety_id = uuid.uuid4()
        mother_id = uuid.uuid4()
        block = Block(
            farmId=uuid.uuid4(),
            targetCrop=variety_id,
            targetCropName="Tomato (Heirloom)",
            productMotherId=mother_id,
            productName="Tomato",
        )
        # targetCrop = variety (unchanged meaning), productMotherId = mother
        # (new) — both present and distinct.
        assert block.targetCrop == variety_id
        assert block.productMotherId == mother_id
        assert block.targetCrop != block.productMotherId
        assert block.targetCropName == "Tomato (Heirloom)"
        assert block.productName == "Tomato"
