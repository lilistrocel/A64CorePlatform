"""
Unit tests for T-800 — genetics generation numbering.

``PropagationService.derive_generations`` encodes the rule the whole Genetics
Repo depends on. A silent regression here does not raise; it writes wrong
lineage data that looks plausible and is expensive to unpick months later, so
this is the highest-value surface in the module to pin down.

The rule:
  - **asexual** method -> clone generation (G) + 1, filial generation (F) inherited
  - **sexual**  method -> filial generation (F) + 1, clone generation **reset to 0**

The reset is the substantive part. A spore print taken off a G5 fruit produces a
fresh genetic individual with no accumulated senescence, so it is F1-G0 rather
than G6. Tissue-cloning that same fruit *is* G6. The two counters are orthogonal:
a cross that is then cloned four times reads F1 · G4.

Test cases:
  Asexual
    1.  G0 clone -> G1, F untouched
    2.  G5 clone -> G6 (senescence keeps climbing)
    3.  F inherited unchanged across an asexual step
    4.  Repeated clones climb monotonically
  Sexual
    5.  Spore print off G5 -> F1-G0 (the reset — the headline case)
    6.  Sexual step from an F2 parent -> F3, G0
    7.  Every sexual method resets G, whatever the parent depth
  Two parents
    8.  Asexual-with-two-parents takes max(G) + 1
    9.  Cross takes max(F) + 1 and resets G
   10.  Cross between mismatched depths uses the deeper F
  No parents
   11.  Clone with no identified parent still advances G
   12.  Sexual with no identified parent still advances F
  Composition
   13.  Cross then clone reads F1-G1
   14.  Clone chain then spore print discards accumulated G
  Enum contract
   15.  reproduction_mode partitions every method (none unclassified)
   16.  max_parents is 2 only for true two-parent methods
   17.  Spore print is sexual but single-parent
  Label / code formatting
   18.  generation_label omits F until a cross enters the ancestry
   19.  build_accession_code formats both shapes
   20.  slugify_code normalises user input
  Parent validation
   21.  Too many parents for the method is rejected
   22.  The same parent supplied twice is rejected
   23.  Unidentified parents are allowed, including two of them
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from src.modules.genetics.models.accession import Accession, ParentRef
from src.modules.genetics.models.enums import (
    ParentRole,
    PropagationMethod,
    ReproductionMode,
    VesselForm,
)
from src.modules.genetics.services.common import (
    build_accession_code,
    generation_label,
    slugify_code,
)
from src.modules.genetics.services.propagation.propagation_service import (
    PropagationService,
)

derive = PropagationService.derive_generations


# Methods that recombine the genome. Duplicated here deliberately rather than
# imported from the private _SEXUAL_METHODS set — if someone edits that set,
# these tests should disagree with it rather than silently agree.
SEXUAL_METHODS = {
    PropagationMethod.SPORE_PRINT,
    PropagationMethod.MULTISPORE,
    PropagationMethod.SINGLE_SPORE,
    PropagationMethod.SEED_FROM_CROSS,
    PropagationMethod.SELF_POLLINATION,
    PropagationMethod.BREEDING,
    PropagationMethod.ARTIFICIAL_INSEMINATION,
    PropagationMethod.EMBRYO_TRANSFER,
}

TWO_PARENT_METHODS = {
    PropagationMethod.SEED_FROM_CROSS,
    PropagationMethod.BREEDING,
    PropagationMethod.ARTIFICIAL_INSEMINATION,
    PropagationMethod.EMBRYO_TRANSFER,
}


def accession(clone: int = 0, filial: int = 0, line_id: str = "line-1") -> Accession:
    """Build a minimal accession carrying the generation pair under test."""
    return Accession(
        lineId=line_id,
        accessionCode=f"TEST-{generation_label(clone, filial)}-001",
        form=VesselForm.PETRI_DISH,
        cloneGeneration=clone,
        filialGeneration=filial,
    )


# ---------------------------------------------------------------------------
# Asexual — clone generation advances, filial inherited
# ---------------------------------------------------------------------------

def test_clone_from_g0_advances_to_g1():
    assert derive(PropagationMethod.AGAR_TO_AGAR, [accession(0, 0)]) == (1, 0)


def test_clone_from_g5_advances_to_g6():
    """Senescence signal keeps climbing — this is what makes deep chains visible."""
    assert derive(PropagationMethod.TISSUE_CLONE, [accession(5, 0)]) == (6, 0)


def test_clone_inherits_filial_generation_unchanged():
    """An asexual step must not touch F — it is not a new genetic individual."""
    clone_gen, filial_gen = derive(PropagationMethod.AGAR_TO_AGAR, [accession(1, 2)])
    assert (clone_gen, filial_gen) == (2, 2)


def test_repeated_clones_climb_monotonically():
    current = accession(0, 0)
    for expected_g in range(1, 6):
        clone_gen, filial_gen = derive(PropagationMethod.AGAR_TO_AGAR, [current])
        assert (clone_gen, filial_gen) == (expected_g, 0)
        current = accession(clone_gen, filial_gen)


@pytest.mark.parametrize(
    "method",
    [m for m in PropagationMethod if m not in SEXUAL_METHODS],
)
def test_every_asexual_method_advances_clone_generation(method: PropagationMethod):
    clone_gen, filial_gen = derive(method, [accession(3, 1)])
    assert clone_gen == 4, f"{method.value} should advance G"
    assert filial_gen == 1, f"{method.value} should inherit F"


# ---------------------------------------------------------------------------
# Sexual — filial advances, clone resets
# ---------------------------------------------------------------------------

def test_spore_print_off_g5_resets_clone_generation():
    """The headline case.

    A print taken from a G5 fruit is sexual recombination, so the resulting
    culture is a brand-new individual: F1-G0, not G6.
    """
    assert derive(PropagationMethod.SPORE_PRINT, [accession(5, 0)]) == (0, 1)


def test_sexual_step_from_f2_parent_advances_to_f3():
    assert derive(PropagationMethod.SEED_FROM_CROSS, [accession(4, 2)]) == (0, 3)


@pytest.mark.parametrize("method", sorted(SEXUAL_METHODS, key=lambda m: m.value))
def test_every_sexual_method_resets_clone_generation(method: PropagationMethod):
    clone_gen, filial_gen = derive(method, [accession(7, 1)])
    assert clone_gen == 0, f"{method.value} should reset G to 0"
    assert filial_gen == 2, f"{method.value} should advance F"


# ---------------------------------------------------------------------------
# Two parents
# ---------------------------------------------------------------------------

def test_asexual_with_two_parents_takes_max_clone_generation():
    clone_gen, _ = derive(
        PropagationMethod.AGAR_TO_AGAR, [accession(2, 0), accession(6, 0)]
    )
    assert clone_gen == 7


def test_cross_takes_max_filial_and_resets_clone():
    assert derive(
        PropagationMethod.BREEDING, [accession(3, 0), accession(1, 2)]
    ) == (0, 3)


def test_cross_between_mismatched_depths_uses_deeper_filial():
    """The more-advanced side sets the filial generation of the offspring."""
    _, filial_gen = derive(
        PropagationMethod.SEED_FROM_CROSS, [accession(0, 1), accession(0, 4)]
    )
    assert filial_gen == 5


# ---------------------------------------------------------------------------
# No identified parents
# ---------------------------------------------------------------------------

def test_clone_with_no_parents_still_advances_clone_generation():
    """Recording a transfer whose source is not on file still yields a G1 child."""
    assert derive(PropagationMethod.AGAR_TO_AGAR, []) == (1, 0)


def test_sexual_with_no_parents_still_advances_filial():
    assert derive(PropagationMethod.MULTISPORE, []) == (0, 1)


# ---------------------------------------------------------------------------
# Composition — the two counters are orthogonal
# ---------------------------------------------------------------------------

def test_cross_then_clone_reads_f1_g1():
    cross_g, cross_f = derive(PropagationMethod.BREEDING, [accession(0, 0)])
    assert (cross_g, cross_f) == (0, 1)

    clone_g, clone_f = derive(
        PropagationMethod.AGAR_TO_AGAR, [accession(cross_g, cross_f)]
    )
    assert (clone_g, clone_f) == (1, 1)
    assert generation_label(clone_g, clone_f) == "F1-G1"


def test_clone_chain_then_spore_print_discards_accumulated_clone_depth():
    """Re-isolating from spores is the documented escape from a senescent line."""
    current = accession(0, 0)
    for _ in range(6):
        current = accession(*derive(PropagationMethod.AGAR_TO_AGAR, [current]))
    assert current.cloneGeneration == 6

    clone_gen, filial_gen = derive(PropagationMethod.SPORE_PRINT, [current])
    assert (clone_gen, filial_gen) == (0, 1)


# ---------------------------------------------------------------------------
# Enum contract
# ---------------------------------------------------------------------------

def test_reproduction_mode_partitions_every_method():
    """No method may be left unclassified — the rule branches on this."""
    for method in PropagationMethod:
        expected = (
            ReproductionMode.SEXUAL
            if method in SEXUAL_METHODS
            else ReproductionMode.ASEXUAL
        )
        assert method.reproduction_mode is expected, method.value


def test_max_parents_is_two_only_for_true_cross_methods():
    for method in PropagationMethod:
        expected = 2 if method in TWO_PARENT_METHODS else 1
        assert method.max_parents == expected, method.value


def test_spore_print_is_sexual_but_single_parent():
    """Sexual does not imply two parents — a print has one fruit body behind it."""
    assert PropagationMethod.SPORE_PRINT.reproduction_mode is ReproductionMode.SEXUAL
    assert PropagationMethod.SPORE_PRINT.max_parents == 1


# ---------------------------------------------------------------------------
# Label / code formatting — the display side of the same rule
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "clone,filial,expected",
    [
        (0, 0, "G0"),
        (2, 0, "G2"),
        (0, 1, "F1-G0"),
        (2, 1, "F1-G2"),
        (12, 3, "F3-G12"),
    ],
)
def test_generation_label_omits_filial_until_a_cross_enters(clone, filial, expected):
    assert generation_label(clone, filial) == expected


def test_build_accession_code_formats_both_shapes():
    assert build_accession_code("PO-BLU", 2, 0, 14) == "PO-BLU-G2-014"
    assert build_accession_code("PO-BLU", 2, 1, 3) == "PO-BLU-F1-G2-003"


def test_slugify_code_normalises_user_input():
    assert slugify_code("po blu") == "PO-BLU"
    assert slugify_code("  Blue/Oyster  ") == "BLUE-OYSTER"
    assert slugify_code("PO--BLU") == "PO-BLU"


def test_accession_generation_label_matches_helper():
    """The computed model field and the service helper must not drift apart."""
    assert accession(2, 0).generationLabel == generation_label(2, 0)
    assert accession(2, 1).generationLabel == generation_label(2, 1)


# ---------------------------------------------------------------------------
# Parent validation
# ---------------------------------------------------------------------------

def test_too_many_parents_for_method_is_rejected():
    with pytest.raises(HTTPException) as exc:
        PropagationService._validate_parents(
            PropagationMethod.AGAR_TO_AGAR,
            [
                ParentRef(accessionId="a", role=ParentRole.CLONE_SOURCE),
                ParentRef(accessionId="b", role=ParentRole.CLONE_SOURCE),
            ],
        )
    assert exc.value.status_code == 400
    assert "at most" in exc.value.detail


def test_duplicate_parent_is_rejected():
    with pytest.raises(HTTPException) as exc:
        PropagationService._validate_parents(
            PropagationMethod.BREEDING,
            [
                ParentRef(accessionId="same", role=ParentRole.DAM),
                ParentRef(accessionId="same", role=ParentRole.SIRE),
            ],
        )
    assert exc.value.status_code == 400
    assert "twice" in exc.value.detail


def test_unidentified_parents_are_allowed():
    """Half-known ancestry must survive — a known dam with an unrecorded sire."""
    PropagationService._validate_parents(
        PropagationMethod.BREEDING,
        [
            ParentRef(accessionId="dam-1", role=ParentRole.DAM),
            ParentRef(accessionId=None, role=ParentRole.SIRE),
        ],
    )


def test_two_unidentified_parents_are_not_treated_as_duplicates():
    """Two null accessionIds are two unknown parents, not the same one twice."""
    PropagationService._validate_parents(
        PropagationMethod.BREEDING,
        [
            ParentRef(accessionId=None, role=ParentRole.DAM),
            ParentRef(accessionId=None, role=ParentRole.SIRE),
        ],
    )
