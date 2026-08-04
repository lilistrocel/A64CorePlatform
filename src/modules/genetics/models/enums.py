"""
Genetics Repo Module - Shared Enumerations

Central vocabulary for the genetics repository. Kept in one file because the
generation-numbering rules (see ``PropagationMethod.reproduction_mode``) are
derived from these values and must stay in lockstep across models, services
and the frontend contract.
"""

from enum import Enum


class OrganismKind(str, Enum):
    """Biological domain a genetic line belongs to.

    The repo is shared across every department, so a single line collection
    holds plants, fungi and animals side by side.
    """

    PLANT = "plant"
    FUNGUS = "fungus"
    ANIMAL = "animal"
    OTHER = "other"


class ProvenanceType(str, Enum):
    """How material entered the lab when there is no parent accession on file."""

    WILD_COLLECTED = "wild_collected"
    PURCHASED = "purchased"
    GIFTED = "gifted"
    IN_HOUSE = "in_house"
    UNKNOWN = "unknown"


class DerivationType(str, Enum):
    """How a genetic line came to exist relative to its parent line."""

    ORIGINAL = "original"  # No parent line — first entry for this genetics
    MUTATION = "mutation"  # Spontaneous/induced mutant
    SECTOR = "sector"  # Sectoring isolate off a plate
    SELECTION = "selection"  # Phenotype-selected sub-line
    CROSS = "cross"  # Product of a deliberate cross
    ISOLATE = "isolate"  # Single-spore / single-colony isolate


class VesselForm(str, Enum):
    """Physical form the accession is held in.

    Spans all three domains — an animal accession uses ``ANIMAL`` and carries
    a head count in ``quantity``.
    """

    PETRI_DISH = "petri_dish"
    SLANT = "slant"
    LIQUID_CULTURE = "liquid_culture"
    GRAIN_SPAWN = "grain_spawn"
    BULK_SPAWN = "bulk_spawn"
    FRUITING_BLOCK = "fruiting_block"
    AGAR_PLUG = "agar_plug"
    TISSUE_JAR = "tissue_jar"
    SAMPLE = "sample"
    SPORE_PRINT = "spore_print"
    SPORE_SYRINGE = "spore_syringe"
    SEED_LOT = "seed_lot"
    CUTTING = "cutting"
    ROOTED_PLANT = "rooted_plant"
    CRYO_VIAL = "cryo_vial"
    SEMEN_STRAW = "semen_straw"
    EMBRYO = "embryo"
    ANIMAL = "animal"
    OTHER = "other"


class AccessionStatus(str, Enum):
    """Lifecycle state of a physical accession."""

    ACTIVE = "active"
    CONTAMINATED = "contaminated"
    SENESCENT = "senescent"
    CONSUMED = "consumed"
    ARCHIVED = "archived"
    DISCARDED = "discarded"


class ParentRole(str, Enum):
    """Role a parent accession played in producing a child accession."""

    CLONE_SOURCE = "clone_source"  # Asexual — the single donor
    SEED_PARENT = "seed_parent"  # Plant cross — ovule donor (mother)
    POLLEN_PARENT = "pollen_parent"  # Plant cross — pollen donor (father)
    DAM = "dam"  # Animal — mother
    SIRE = "sire"  # Animal — father
    SPORE_SOURCE = "spore_source"  # Fungal — fruit body the print came from
    UNKNOWN = "unknown"  # Known to exist, identity not recorded


class ReproductionMode(str, Enum):
    """Whether a propagation preserves the genome or recombines it.

    This is the axis that decides which generation counter moves.
    """

    ASEXUAL = "asexual"  # Genome preserved  -> clone generation (G) increments
    SEXUAL = "sexual"  # Genome recombined -> filial generation (F) increments, G resets


class PropagationMethod(str, Enum):
    """Technique used to create the child accession(s)."""

    # --- Asexual, generation-advancing: a new clonal generation -------------
    AGAR_TO_AGAR = "agar_to_agar"
    TISSUE_CLONE = "tissue_clone"
    CUTTING = "cutting"
    NODE_CULTURE = "node_culture"
    DIVISION = "division"

    # --- Asexual, expansion: more of the SAME generation --------------------
    # The production chain (culture -> LC -> grain spawn -> bulk block) is
    # multiplication, not drift. See _EXPANSION_METHODS.
    LC_INOCULATION = "lc_inoculation"
    GRAIN_TRANSFER = "grain_transfer"
    BULK_INOCULATION = "bulk_inoculation"
    CRYO_REVIVAL = "cryo_revival"

    # --- Sexual: the child is a new genetic individual ----------------------
    SPORE_PRINT = "spore_print"
    MULTISPORE = "multispore"
    SINGLE_SPORE = "single_spore"
    SEED_FROM_CROSS = "seed_from_cross"
    SELF_POLLINATION = "self_pollination"
    BREEDING = "breeding"
    ARTIFICIAL_INSEMINATION = "artificial_insemination"
    EMBRYO_TRANSFER = "embryo_transfer"

    @property
    def advances_generation(self) -> bool:
        """Whether this method produces a NEW clonal generation.

        The production chain — culture -> liquid culture -> grain spawn -> bulk
        block — multiplies a culture rather than advancing it. Counting each
        expansion step as a generation would take a G2 culture to G5 in a
        single production run and fire the senescence warning on material that
        has not drifted at all.

        Mycological convention counts agar transfers: "a G3 culture" means
        three agar-to-agar steps deep. Expansion steps carry G through
        unchanged. Sexual methods are excluded here — they reset G entirely.
        """
        if self.reproduction_mode == ReproductionMode.SEXUAL:
            return False
        return self not in _EXPANSION_METHODS

    @property
    def reproduction_mode(self) -> ReproductionMode:
        """Return whether this method preserves or recombines the genome.

        Drives generation numbering: asexual methods advance G and inherit F,
        sexual methods advance F and reset G to 0. A spore print taken from a
        G5 fruit therefore yields F+1 / G0, not G6 — the resulting culture is
        a fresh genetic individual with no accumulated senescence.
        """
        return (
            ReproductionMode.SEXUAL
            if self in _SEXUAL_METHODS
            else ReproductionMode.ASEXUAL
        )

    @property
    def max_parents(self) -> int:
        """Maximum number of parent accessions this method accepts."""
        return 2 if self in _TWO_PARENT_METHODS else 1


# Asexual methods that multiply a culture without advancing its generation.
# Membership here is the single source of truth for the G rule — an asexual
# method NOT in this set advances G.
#
# CRYO_REVIVAL is included deliberately: the whole point of cryogenic storage
# is to preserve a generation, so reviving material restores it at the depth it
# went in rather than adding one.
_EXPANSION_METHODS = frozenset(
    {
        PropagationMethod.LC_INOCULATION,
        PropagationMethod.GRAIN_TRANSFER,
        PropagationMethod.BULK_INOCULATION,
        PropagationMethod.CRYO_REVIVAL,
    }
)

# Methods that recombine the genome. Membership here is the single source of
# truth for sexual/asexual classification — add new sexual methods to this set.
_SEXUAL_METHODS = frozenset(
    {
        PropagationMethod.SPORE_PRINT,
        PropagationMethod.MULTISPORE,
        PropagationMethod.SINGLE_SPORE,
        PropagationMethod.SEED_FROM_CROSS,
        PropagationMethod.SELF_POLLINATION,
        PropagationMethod.BREEDING,
        PropagationMethod.ARTIFICIAL_INSEMINATION,
        PropagationMethod.EMBRYO_TRANSFER,
    }
)

# Methods that may name two distinct parents. Self-pollination and spore
# prints are sexual but single-parent; breeding and crosses take two.
_TWO_PARENT_METHODS = frozenset(
    {
        PropagationMethod.SEED_FROM_CROSS,
        PropagationMethod.BREEDING,
        PropagationMethod.ARTIFICIAL_INSEMINATION,
        PropagationMethod.EMBRYO_TRANSFER,
    }
)


class IngredientUnit(str, Enum):
    """Controlled vocabulary for recipe quantities.

    Deliberately an enum rather than free text. Typed units drift immediately —
    ``g/L``, ``G/L``, ``g/l``, ``gm/L`` all mean the same thing to a person and
    are four distinct strings to a database. Any later attempt to compute a
    ratio, scale a recipe, or group "everything containing 20 g/L malt" would
    silently split across those spellings and quietly under-report.

    ``%`` is split by basis for the same reason wet and dry substrate are: a
    bare percentage is ambiguous between weight-in-volume and volume-in-volume,
    and the two differ by the density of whatever is being added.

    Add to this list rather than reintroducing free text — a controlled
    vocabulary is only worth having if it stays controlled.
    """

    # Concentration — the common case for a per-litre medium recipe
    G_PER_L = "g/L"
    MG_PER_L = "mg/L"
    UG_PER_L = "ug/L"
    ML_PER_L = "mL/L"
    PERCENT_W_V = "%w/v"
    PERCENT_V_V = "%v/v"
    PPM = "ppm"

    # Absolute amounts — for a recipe written per batch rather than per litre
    G = "g"
    KG = "kg"
    MG = "mg"
    ML = "mL"
    L = "L"

    # Relative and countable
    PARTS = "parts"
    UNITS = "units"


class MediumType(str, Enum):
    """Category of growth medium / substrate."""

    AGAR = "agar"
    LIQUID_CULTURE = "liquid_culture"
    GRAIN = "grain"
    BULK_SUBSTRATE = "bulk_substrate"
    ROOTING_MEDIUM = "rooting_medium"
    HYDROPONIC_SOLUTION = "hydroponic_solution"
    FEED = "feed"
    OTHER = "other"


class SterilizationMethod(str, Enum):
    """How a medium batch was sterilised or pasteurised."""

    AUTOCLAVE = "autoclave"
    PRESSURE_COOKER = "pressure_cooker"
    PASTEURIZATION = "pasteurization"
    STEAM = "steam"
    CHEMICAL = "chemical"
    NONE = "none"


class MediumBatchStatus(str, Enum):
    """Lifecycle state of a prepared medium batch."""

    PREPARED = "prepared"
    IN_USE = "in_use"
    CONSUMED = "consumed"
    CONTAMINATED = "contaminated"
    DISCARDED = "discarded"


class ObservationType(str, Enum):
    """Kind of observation recorded against an accession."""

    GROWTH = "growth"
    MORPHOLOGY = "morphology"
    CONTAMINATION = "contamination"
    SECTOR = "sector"
    TRAIT = "trait"
    PHOTO = "photo"
    NOTE = "note"
    HEALTH = "health"
