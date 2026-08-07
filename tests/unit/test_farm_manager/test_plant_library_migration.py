"""
Unit tests for the Plant Library Phase 1 tag -> plantType inference helper
(scripts/migrations/plant_library_mother_variety_migration.py).

Background
----------
Phase 1 introduces a two-level Plant Library hierarchy: a "mother" plant
(product/SKU, new `plant_mothers` collection) grouping one or more
"varieties" (cultivation recipes — the existing `plant_data_enhanced`
collection). The migration backfills a `plant_mothers` document for every
active variety, inferring the mother's `plantType` from the variety's
existing `tags` array via `infer_plant_type_from_tags()`.

These tests pin that inference function directly (no DB, no mocks needed —
it's a pure function) so a future change to the mapping or precedence rules
is a deliberate, visible diff here rather than a silent behavior change.
"""

import pytest

from scripts.migrations.plant_library_mother_variety_migration import (
    DEFAULT_PLANT_TYPE,
    TAG_PLANT_TYPE_PRECEDENCE,
    infer_plant_type_from_tags,
)


class TestSingleTagMapping:
    """Each individually-mapped tag resolves to its matching plantType."""

    @pytest.mark.parametrize(
        "tag,expected",
        [
            ("tree", "tree"),
            ("herb", "herb"),
            ("ornamental", "ornamental"),
            ("medicinal", "medicinal"),
            ("vegetable", "vegetable"),
            ("fruit", "fruit"),
        ],
    )
    def test_mapped_tag_resolves_directly(self, tag, expected):
        assert infer_plant_type_from_tags([tag]) == expected

    def test_mapped_tag_is_case_insensitive(self):
        assert infer_plant_type_from_tags(["Vegetable"]) == "vegetable"
        assert infer_plant_type_from_tags(["FRUIT"]) == "fruit"

    def test_mapped_tag_among_unrelated_tags(self):
        assert infer_plant_type_from_tags(["summer", "vegetable", "fast-growing"]) == (
            "vegetable"
        )


class TestMultiTagPrecedence:
    """
    Conflict-precedence decision (documented in the migration script):
    growth-habit tags (tree, herb) > use-category tags (ornamental,
    medicinal) > produce-category tags (vegetable, fruit), with vegetable
    beating fruit as the final, fixed tie-break. TAG_PLANT_TYPE_PRECEDENCE
    is exercised directly here rather than duplicated, so the test fails if
    the module's precedence list is ever reordered without an accompanying
    review of these expectations.
    """

    def test_tree_beats_fruit(self):
        # A "fruit tree" — growth habit (tree) wins over produce category (fruit).
        assert infer_plant_type_from_tags(["fruit", "tree"]) == "tree"

    def test_tree_beats_vegetable(self):
        assert infer_plant_type_from_tags(["vegetable", "tree"]) == "tree"

    def test_herb_beats_medicinal(self):
        assert infer_plant_type_from_tags(["medicinal", "herb"]) == "herb"

    def test_ornamental_beats_vegetable(self):
        assert infer_plant_type_from_tags(["vegetable", "ornamental"]) == "ornamental"

    def test_medicinal_beats_fruit(self):
        assert infer_plant_type_from_tags(["fruit", "medicinal"]) == "medicinal"

    def test_vegetable_beats_fruit_as_final_tiebreak(self):
        assert infer_plant_type_from_tags(["fruit", "vegetable"]) == "vegetable"

    def test_precedence_order_is_input_order_independent(self):
        # Order of tags in the input list must not matter — only
        # TAG_PLANT_TYPE_PRECEDENCE decides the winner.
        assert infer_plant_type_from_tags(["tree", "fruit"]) == infer_plant_type_from_tags(
            ["fruit", "tree"]
        )

    def test_precedence_list_matches_documented_order(self):
        assert TAG_PLANT_TYPE_PRECEDENCE == [
            "tree",
            "herb",
            "ornamental",
            "medicinal",
            "vegetable",
            "fruit",
        ]


class TestCropFallback:
    """Unmapped/absent tags fall back to the 'crop' default."""

    def test_none_tags_falls_back_to_crop(self):
        assert infer_plant_type_from_tags(None) == DEFAULT_PLANT_TYPE
        assert DEFAULT_PLANT_TYPE == "crop"

    def test_empty_list_falls_back_to_crop(self):
        assert infer_plant_type_from_tags([]) == "crop"

    def test_unmapped_tags_fall_back_to_crop(self):
        assert infer_plant_type_from_tags(["summer", "fast-growing", "greenhouse"]) == (
            "crop"
        )

    def test_blank_and_whitespace_tags_are_ignored(self):
        assert infer_plant_type_from_tags(["", "   "]) == "crop"
