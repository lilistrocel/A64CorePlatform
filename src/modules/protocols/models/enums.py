"""
Protocols Module - Enumerations
"""

from enum import Enum


class ProtocolCategory(str, Enum):
    """Broad grouping for the protocol library."""
    LAB = "lab"                      # Agar, liquid culture, sterile technique
    CULTIVATION = "cultivation"      # Growing, climate, substrate
    HARVEST = "harvest"              # Picking, grading, post-harvest
    SANITATION = "sanitation"        # Cleaning, sterilisation, contamination control
    SAFETY = "safety"                # PPE, chemical handling, incidents
    EQUIPMENT = "equipment"          # Autoclave, flow hood, maintenance
    QUALITY = "quality"              # QC checks, sampling, testing
    ADMIN = "admin"                  # Record-keeping, intake, dispatch


class ProtocolStatus(str, Enum):
    """Lifecycle of a written procedure.

    Only ACTIVE protocols are offered when recording work — following a draft
    or a retired procedure is exactly what an SOP system exists to prevent.
    """
    DRAFT = "draft"
    ACTIVE = "active"
    RETIRED = "retired"
