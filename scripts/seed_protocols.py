#!/usr/bin/env python3
"""
Seed the protocol library with literature-backed mushroom cultivation SOPs.

Run inside the api container:
    docker cp scripts/seed_protocols.py a64coreplatform-api-1:/app/
    docker exec -w /app a64coreplatform-api-1 python seed_protocols.py [--approve]

Idempotent: a protocol whose code already exists is skipped, so re-running
after adding new entries only inserts the new ones. Nothing is overwritten —
your edits to an existing SOP survive a re-run.

--approve marks each seeded protocol ACTIVE. Without it they land as drafts,
which is the honest default: these are drafts of *someone else's* practice
until a person in this lab has read them and signed them off. Only ACTIVE
protocols are offered at the point of work.

ON REFERENCE IMAGES
-------------------
No third-party photographs are embedded. Three reasons:

1. Contamination photos on cultivation sites are copyrighted; redistributing
   them inside this app is not ours to do.
2. They cannot be verified from here. Attaching an image that is captioned
   "Trichoderma" but actually shows cobweb would actively teach
   misidentification — worse than having no image at all.
3. A photo of YOUR contamination, on YOUR substrate, under YOUR lighting is
   more diagnostic than any stock image.

So each protocol carries its published sources in ``references`` (pages to go
and read), the contamination SOP identifies by colour + texture + growth
pattern in text — which is what actually drives triage — and SOP-SAN-001
instructs the operator to photograph and attach before disposing, so the lab
builds its own verified gallery over time.
"""

import argparse
import asyncio
import sys
from datetime import datetime

sys.path.insert(0, "/app")

from src.modules.protocols.models.enums import ProtocolCategory, ProtocolStatus  # noqa: E402
from src.modules.protocols.models.protocol import Protocol  # noqa: E402
from src.services.database import mongodb  # noqa: E402


def step(order, text, *, minutes=None, critical=False, notes=None):
    return {
        "order": order,
        "text": text,
        "durationMinutes": minutes,
        "isCritical": critical,
        "images": [],
        "notes": notes,
    }


def item(name, qty=None, notes=None):
    return {"name": name, "quantity": qty, "notes": notes}


PSU = (
    "Royse DJ & Wilkinson V, 'Care and handling of cultures of the cultivated "
    "mushroom', Penn State Dept. of Plant Pathology — "
    "https://plantpath.psu.edu/about/facilities/mushroom/cultures-spawn/care-handling.pdf"
)
EDIS = (
    "Hsu C-M, Hameed K, Cotter VT & Liao H-L (2018), 'Isolation of Mother Cultures "
    "and Preparation of Spawn for Oyster Mushroom Cultivation', UF/IFAS EDIS "
    "SL449/SS663 — https://edis.ifas.ufl.edu/ss663"
)
PSU_PROD = (
    "Penn State Extension, 'Mushrooms: Production and Harvesting' — "
    "https://extension.psu.edu/forage-and-food-crops/mushrooms/production-and-harvesting"
)


PROTOCOLS = [
    # ---------------------------------------------------------------- lab ---
    {
        "code": "SOP-LAB-001",
        "title": "Preparing and pouring agar plates (MEA)",
        "category": ProtocolCategory.LAB,
        "purpose": (
            "Produce sterile malt extract agar plates for isolation, cloning and "
            "culture maintenance."
        ),
        "ppe": ["heat-resistant gloves", "lab coat", "eye protection"],
        "safetyNotes": (
            "Molten agar is near boiling and clings to skin. Never open a pressure "
            "vessel until it has fully depressurised and the contents are below 80 C."
        ),
        "equipment": [
            item("Autoclave or pressure cooker", "15 psi capable"),
            item("Laminar flow hood or still air box"),
            item("Erlenmeyer flask or media bottle", "1 L"),
            item("90 mm petri dishes", "~40 per litre"),
        ],
        "materials": [
            item("Light malt extract", "20 g/L"),
            item("Agar", "20 g/L"),
            item("Distilled water", "1 L"),
            item("70% isopropyl alcohol", "as needed"),
        ],
        "appliesTo": ["media:pour", "media:sterilise"],
        "steps": [
            step(1, "Dissolve 20 g/L light malt extract and 20 g/L agar in distilled water. Swirl to wet the agar; it will not dissolve cold."),
            step(2, "Cover the flask loosely with foil so steam can escape. A sealed vessel is a bomb.", critical=True),
            step(3, "Sterilise at 121 C / 15 psi for 20 minutes.", minutes=20, critical=True),
            step(4, "Let the vessel depressurise on its own. Do not vent early — the medium will boil over.", critical=True),
            step(5, "Cool to roughly 50 C before pouring: hot enough to stay liquid, cool enough not to fog every lid with condensation. The flask should be uncomfortable but holdable.", minutes=30, critical=True),
            step(6, "Wipe the flask exterior with 70% IPA and move it into a hood that has been running at least 15 minutes."),
            step(7, "Pour 20-25 mL per 90 mm plate — enough to cover the base plus a few millimetres. Work with the lid lifted only as far as the pour needs."),
            step(8, "Leave plates undisturbed until fully set.", minutes=30),
            step(9, "Invert the plates once set, so condensation collects on the base rather than dripping onto the agar surface.", critical=True),
            step(10, "Bag and refrigerate at 4 C. Use within about a month; dehydrated or cracked plates colonise unevenly."),
        ],
        "references": [EDIS, PSU],
        "tags": ["agar", "media", "sterile"],
    },
    {
        "code": "SOP-LAB-002",
        "title": "Sterile technique at the flow hood or still air box",
        "category": ProtocolCategory.LAB,
        "purpose": (
            "The baseline discipline every other lab procedure depends on. Most "
            "contamination traced back to 'the agar was bad' is actually traced to "
            "technique at this bench."
        ),
        "ppe": ["nitrile gloves", "lab coat", "face mask"],
        "safetyNotes": "Alcohol and open flame together. Never flame near an open IPA bottle or a soaked wipe.",
        "equipment": [
            item("Laminar flow hood or still air box"),
            item("Scalpel or inoculation loop"),
            item("Alcohol lamp or butane torch"),
        ],
        "materials": [item("70% isopropyl alcohol"), item("Lint-free wipes"), item("Parafilm or micropore tape")],
        "appliesTo": ["propagation:agar_to_agar", "propagation:tissue_clone", "propagation:lc_inoculation"],
        "steps": [
            step(1, "Wipe all interior surfaces of the hood with 70% IPA, then run the blower for at least 15 minutes before working.", minutes=15, critical=True),
            step(2, "Wipe the exterior of every item before it enters the hood — plates, jars, tools, your gloved hands."),
            step(3, "Arrange items so nothing has to pass over an open vessel. Work with the airflow, never across it.", critical=True),
            step(4, "Keep all work in the still zone, well inside the hood face. Reaching in and out repeatedly drags room air with you."),
            step(5, "Flame the instrument until it glows, then cool it in sterile agar or still air before touching tissue. A glowing scalpel kills whatever it touches.", critical=True),
            step(6, "Open a vessel for the shortest time the task allows, lid lifted at an angle rather than removed."),
            step(7, "Re-flame between every transfer, not once per session.", critical=True),
            step(8, "Seal, label and date immediately. An unlabelled plate is a lost plate."),
        ],
        "references": [PSU, EDIS],
        "tags": ["sterile", "technique", "foundation"],
    },
    {
        "code": "SOP-LAB-003",
        "title": "Cloning a mother culture from a fruit body",
        "category": ProtocolCategory.LAB,
        "purpose": (
            "Capture the genetics of a fruit body worth keeping, by isolating "
            "interior tissue onto agar. Produces a clone — genetically the parent — "
            "not a new individual."
        ),
        "ppe": ["nitrile gloves", "lab coat", "face mask"],
        "equipment": [item("Flow hood or still air box"), item("Scalpel"), item("Alcohol lamp")],
        "materials": [item("MEA plates", "3-5 per attempt"), item("Healthy fruit body", "1"), item("70% IPA")],
        "appliesTo": ["propagation:tissue_clone", "accession:register"],
        "steps": [
            step(1, "Choose a young, vigorous, undamaged fruit body from a strong flush. Cloning a poor specimen preserves a poor culture.", critical=True),
            step(2, "Wipe the exterior with 70% IPA. Do not soak it."),
            step(3, "TEAR the fruit body open rather than cutting through the outside. The interior is effectively sterile; a blade dragged through the surface carries surface organisms inward.", critical=True),
            step(4, "Excise a 3-5 mm piece of interior stem or cap flesh, avoiding anything that was exposed to air."),
            step(5, "Place the tissue on MEA, seal, and label with the source and date."),
            step(6, "Incubate at the species' colonisation temperature in the dark.", notes="See the Strain Library entry for the species' range."),
            step(7, "Inspect daily for 3-7 days. Expect mycelium from the tissue edge; discard any plate showing a second organism.", minutes=None),
            step(8, "Once growth is clean and established, transfer the LEADING EDGE to a fresh plate. This first clean-up transfer is what turns an isolation into a usable mother culture.", critical=True),
            step(9, "Register the result as founding material and record the fruit body it came from."),
        ],
        "references": [EDIS, PSU],
        "tags": ["cloning", "isolation", "mother culture"],
    },
    {
        "code": "SOP-LAB-004",
        "title": "Agar-to-agar transfer (subculturing)",
        "category": ProtocolCategory.LAB,
        "purpose": (
            "Maintain and multiply a culture on agar. The standard culture "
            "maintenance method, and the step that advances clone generation."
        ),
        "ppe": ["nitrile gloves", "lab coat", "face mask"],
        "equipment": [item("Flow hood or still air box"), item("Scalpel"), item("Alcohol lamp")],
        "materials": [item("MEA plates"), item("Source culture", "1"), item("70% IPA"), item("Micropore tape")],
        "appliesTo": ["propagation:agar_to_agar"],
        "steps": [
            step(1, "Follow SOP-LAB-002 for hood preparation before starting."),
            step(2, "Flame the scalpel to glowing and cool it in a clear area of the source agar.", critical=True),
            step(3, "Cut a 5 mm plug from the LEADING EDGE of growth, not the centre. The centre is the oldest tissue on the plate and the most senescent.", critical=True),
            step(4, "Invert the plug mycelium-down onto the centre of a fresh plate."),
            step(5, "Seal with micropore tape and label with the new accession code and generation."),
            step(6, "Incubate at the species' colonisation temperature, dark, minimal air exchange."),
            step(7, "Record the transfer in the Genetics Repo as an agar-to-agar propagation, which advances the clone generation (G+1).", critical=True, notes="Expansion steps such as LC or grain do not advance G. Only genuine transfers like this one do."),
        ],
        "references": [PSU],
        "tags": ["transfer", "subculture", "maintenance"],
    },
    {
        "code": "SOP-LAB-005",
        "title": "Preparing liquid culture",
        "category": ProtocolCategory.LAB,
        "purpose": (
            "Produce a stirred nutrient broth colonised with mycelium, for rapid "
            "even inoculation of grain. Multiplies a culture without advancing its "
            "generation."
        ),
        "ppe": ["heat-resistant gloves", "lab coat", "eye protection"],
        "safetyNotes": "Never inoculate warm broth. Beyond killing the culture, a sealed warm jar can build pressure.",
        "equipment": [
            item("Autoclave or pressure cooker"),
            item("Wide-mouth jars with injection port lids", "500 mL"),
            item("Magnetic stir bar", "1 per jar"),
            item("Magnetic stir plate", "optional but recommended"),
        ],
        "materials": [
            item("Light malt extract", "20 g/L (2% w/v)", notes="Published recipes vary widely, from under 5 g/L to 40 g/L. 20 g/L is a defensible mid-range; refine against your own results."),
            item("Distilled water"),
            item("Source culture", "agar wedge or existing LC"),
        ],
        "appliesTo": ["propagation:lc_inoculation", "media:sterilise"],
        "steps": [
            step(1, "Dissolve 20 g/L light malt extract in distilled water. Fill jars to about half — headspace is needed for gas exchange and agitation."),
            step(2, "Drop in a magnetic stir bar BEFORE sterilising. Adding it afterwards means opening a sterile jar.", critical=True),
            step(3, "Fit the lid loosely, or with the port filter in place, so steam can escape."),
            step(4, "Sterilise at 121 C / 15 psi for 20-30 minutes.", minutes=25, critical=True),
            step(5, "Cool to room temperature COMPLETELY before inoculating. Warm broth kills the culture you are about to add, and the failure looks identical to contamination a week later.", minutes=240, critical=True),
            step(6, "Inoculate under the hood with an agar wedge, or through the port with a syringe of existing LC."),
            step(7, "Agitate daily, or leave on a stir plate at low speed for continuous gentle motion. Static broth colonises slowly and unevenly."),
            step(8, "Expect usable culture in 5-14 days: even cloudiness with suspended mycelial fragments."),
            step(9, "Before use, check against contamination: cloudy uniform turbidity without visible mycelium, any sour or yeasty smell, or a surface film means discard. Do not inoculate grain from a doubtful LC — one bad jar can lose a whole spawn run.", critical=True),
        ],
        "references": [
            EDIS,
            "GroCycle, 'How to Make Liquid Culture For Mushrooms' — https://grocycle.com/how-to-make-liquid-culture/",
        ],
        "tags": ["liquid culture", "expansion"],
    },
    {
        "code": "SOP-LAB-006",
        "title": "Grain preparation and sterilisation (jars and bags)",
        "category": ProtocolCategory.LAB,
        "purpose": (
            "Hydrate and sterilise grain to the point where it supports mycelium but "
            "not bacteria. Hydration is the single most common cause of failed spawn."
        ),
        "ppe": ["heat-resistant gloves", "lab coat", "eye protection"],
        "safetyNotes": "Large grain loads hold enormous heat. Allow full cool-down; a bag that feels warm through gloves is still lethal to mycelium.",
        "equipment": [
            item("Autoclave or pressure cooker"),
            item("Wide-mouth jars with filter lids, or filter-patch spawn bags"),
            item("Large sieve or colander"),
        ],
        "materials": [
            item("Grain (rye, wheat or millet)", "as required"),
            item("Water", "for soaking"),
            item("Gypsum", "~1% by dry weight", notes="Optional; reduces clumping."),
        ],
        "appliesTo": ["propagation:grain_transfer", "media:sterilise"],
        "steps": [
            step(1, "Rinse the grain until the water runs clear, discarding floaters and debris."),
            step(2, "Soak 12-24 hours at room temperature.", minutes=720, notes="EDIS SL449 specifies 12 hours or overnight."),
            step(3, "Drain thoroughly, then bring to FIELD CAPACITY: grain fully hydrated with no free water in the vessel. Squeeze a handful — it should not release water. Excess free water creates anaerobic pockets where bacterial endospores survive sterilisation and thrive afterwards.", critical=True),
            step(4, "Surface-dry the grain for 10-20 minutes so the outsides are not wet.", minutes=15),
            step(5, "Load jars or bags to about two-thirds. Do not compact — mycelium needs air between kernels."),
            step(6, "Sterilise at 121 C / 15 psi: 90 minutes for quart jars, up to 120 minutes for large bags. Bigger thermal mass needs longer to reach temperature throughout, not just at the surface.", minutes=90, critical=True),
            step(7, "Allow to cool fully to room temperature before inoculating — typically overnight.", minutes=720, critical=True),
            step(8, "Inspect before use. Sour smell, sliminess or discoloured patches mean under-sterilisation or over-hydration; discard rather than inoculate."),
        ],
        "references": [EDIS, PSU],
        "tags": ["grain", "spawn", "sterilisation"],
    },
    {
        "code": "SOP-LAB-007",
        "title": "Inoculating grain spawn",
        "category": ProtocolCategory.LAB,
        "purpose": "Introduce culture into sterilised grain and bring it to full colonisation.",
        "ppe": ["nitrile gloves", "lab coat", "face mask"],
        "equipment": [item("Flow hood or still air box"), item("Syringe and needle", "for LC"), item("Scalpel and alcohol lamp", "for agar")],
        "materials": [item("Sterilised, cooled grain"), item("Liquid culture or colonised agar plate"), item("70% IPA")],
        "appliesTo": ["propagation:grain_transfer", "propagation:lc_inoculation"],
        "steps": [
            step(1, "Confirm the grain is at room temperature and shows no sign of contamination.", critical=True),
            step(2, "Prepare the hood per SOP-LAB-002."),
            step(3, "For liquid culture: wipe the injection port with IPA and inject roughly 2 mL per 500 g of grain.", notes="Higher rates colonise faster but waste culture; lower rates leave a longer contamination window."),
            step(4, "For agar: transfer 2-3 plugs from the leading edge into the grain under the hood."),
            step(5, "Seal and label with the accession code, source and date."),
            step(6, "Incubate at the species' colonisation temperature, dark, minimal fresh air."),
            step(7, "When roughly 25-30% colonised, shake to distribute the mycelium through the grain. Too early damages fragile young mycelium; too late leaves dense clumps and slow uneven colonisation.", critical=True),
            step(8, "Expect full colonisation in 10-21 days depending on species and spawn rate."),
            step(9, "Record as a grain transfer, which does NOT advance the clone generation — this multiplies the culture rather than aging it."),
        ],
        "references": [EDIS, PSU],
        "tags": ["grain", "spawn", "inoculation", "expansion"],
    },
    # -------------------------------------------------------- cultivation ---
    {
        "code": "SOP-CUL-001",
        "title": "Spawning bulk substrate and fruiting blocks",
        "category": ProtocolCategory.CULTIVATION,
        "purpose": "Combine colonised grain spawn with prepared bulk substrate to produce fruiting blocks.",
        "ppe": ["nitrile gloves", "lab coat", "face mask"],
        "equipment": [item("Clean work surface or hood"), item("Mixing tub", "sanitised"), item("Filter-patch grow bags"), item("Impulse sealer")],
        "materials": [item("Fully colonised grain spawn"), item("Sterilised or pasteurised bulk substrate"), item("70% IPA")],
        "appliesTo": ["propagation:bulk_inoculation"],
        "steps": [
            step(1, "Use only fully colonised, contamination-free spawn. Spawning from a partly colonised bag spreads whatever else is in it.", critical=True),
            step(2, "Confirm the substrate has cooled to room temperature."),
            step(3, "Sanitise the work area, tub and your gloves with 70% IPA."),
            step(4, "Break up the spawn and combine at 5-10% by weight. Higher rates colonise faster and shorten the window in which contaminants can establish."),
            step(5, "Mix thoroughly and evenly. Patchy spawn distribution gives slow, uneven colonisation and leaves gaps for competitors.", critical=True),
            step(6, "Fill and seal bags, leaving the filter patch clear."),
            step(7, "Label with the block accession code and the spawn it came from."),
            step(8, "Incubate at the colonisation temperature until fully colonised, then allow the block to consolidate before initiating fruiting.", critical=True, notes="Shiitake and maitake in particular look finished well before they are ready."),
        ],
        "references": [EDIS, PSU_PROD],
        "tags": ["bulk", "spawning", "fruiting block"],
    },
    {
        "code": "SOP-CUL-002",
        "title": "Fruiting initiation and flush management",
        "category": ProtocolCategory.CULTIVATION,
        "purpose": "Move a colonised block into fruiting and manage successive flushes.",
        "ppe": ["nitrile gloves"],
        "equipment": [item("Fruiting room with humidity and FAE control"), item("CO2 meter"), item("Hygrometer and thermometer")],
        "materials": [item("Fully colonised, consolidated blocks")],
        "appliesTo": ["room:fruiting"],
        "steps": [
            step(1, "Confirm full colonisation and consolidation before introducing fruiting conditions. Initiating early costs yield you cannot recover."),
            step(2, "Move the block to the species' fruiting temperature — usually several degrees below its colonisation range.", critical=True, notes="Check the Strain Library entry; ranges differ sharply between species."),
            step(3, "Raise relative humidity to the species' range, typically 85-95%."),
            step(4, "Increase fresh air exchange to bring CO2 below the species' tolerance. Under-ventilation produces long stems and small caps; Lion's Mane produces coral-like growth instead of a head.", critical=True),
            step(5, "Provide light where the species needs it. Most cultivated species need only modest indirect light to trigger and orient fruiting."),
            step(6, "Harvest per SOP-HRV-001 before spore release."),
            step(7, "After harvest, rest the block. Rehydrate by soaking if the species and block type support it."),
            step(8, "Re-initiate for the next flush and record the flush number. Retire the block once past its expected maximum flushes — later flushes yield little and carry rising contamination risk."),
        ],
        "references": [PSU_PROD],
        "tags": ["fruiting", "flush", "climate"],
    },
    # --------------------------------------------------------- sanitation ---
    {
        "code": "SOP-SAN-001",
        "title": "Contamination identification and response",
        "category": ProtocolCategory.SANITATION,
        "purpose": (
            "Identify the common contaminants by sight and smell, and respond "
            "without spreading them. Identification here is by colour, texture and "
            "growth pattern, which is what actually drives the decision."
        ),
        "ppe": ["nitrile gloves", "face mask (P2/N95 for sporulating mould)"],
        "safetyNotes": (
            "Never open a visibly sporulating bag inside a grow or lab space. "
            "Sporulating Trichoderma can seed an entire room from one opened bag. "
            "Bag it sealed and remove it before opening anything."
        ),
        "equipment": [item("Sealable disposal bags"), item("Camera or phone", "for the record")],
        "materials": [item("70% IPA"), item("Hydrogen peroxide 3%", notes="Spot treatment for cobweb only.")],
        "appliesTo": ["contamination:response"],
        "steps": [
            step(1, "Do not open the vessel. Identify through the container first.", critical=True),
            step(2, "GREEN powder, usually after a white phase, spreading fast: Trichoderma. Discard. It outcompetes mycelium and sporulates heavily.", critical=True),
            step(3, "WISPY GREY-WHITE fluff, three-dimensional, appearing to hover above the substrate, spreading visibly day to day: cobweb mould (Cladobotryum / Hypomyces). Distinguishable from healthy mycelium by its speed and loft. Isolated cases can be spot-treated with 3% hydrogen peroxide; widespread cases go out."),
            step(4, "BLACK pinpoints on otherwise white growth: Rhizopus or other pin mould. Discard."),
            step(5, "SLIMY yellow or brown patches, often with a sour or foul smell: bacterial (Pseudomonas, Bacillus). Discard. Root cause is nearly always excess water at field capacity or insufficient sterilisation time."),
            step(6, "BRIGHT PINK or orange slime: bacterial blotch. Discard, and review humidity and surface wetness."),
            step(7, "SOUR or yeasty smell with no visible growth, especially in grain: bacterial endospores surviving sterilisation. Discard and review hydration and cycle length."),
            step(8, "PHOTOGRAPH it before disposal and attach the image to this protocol or to the accession's observation. Your own photographs, of your own substrate under your own lighting, become the reference gallery this SOP should eventually carry — and are more reliable than any stock image.", critical=True),
            step(9, "Record a contamination observation against the affected accession, then set its status to contaminated so it stops appearing as live material."),
            step(10, "Seal the vessel in a bag, remove it from the building unopened, and dispose off-site.", critical=True),
            step(11, "Wipe down the area with 70% IPA. If more than one vessel from the same session is affected, treat it as a technique or sterilisation failure rather than bad luck, and review the relevant SOP before the next run."),
        ],
        "references": [
            "North Spore, 'Common Contamination in Mushroom Cultivation' — https://northspore.com/blogs/the-black-trumpet/common-contamination-in-mushroom-cultivation",
            "Fungi Academy, 'Mushroom Contamination: How to Spot and What to Do' — https://fungiacademy.com/mushroom-contamination-how-to-spot-and-what-to-do/",
            PSU_PROD,
        ],
        "tags": ["contamination", "troubleshooting", "sanitation"],
        "notes": (
            "No stock photographs are embedded here deliberately. Published "
            "contamination images are copyrighted, and an image that cannot be "
            "verified risks teaching a misidentification — which is worse than "
            "no image. Step 8 builds a verified local gallery instead."
        ),
    },
    # ------------------------------------------------------------ quality ---
    {
        "code": "SOP-QC-001",
        "title": "Culture health and senescence check",
        "category": ProtocolCategory.QUALITY,
        "purpose": (
            "Decide whether a culture is still worth transferring, or whether it "
            "should be re-isolated. Serially transferred cultures lose vigour, and "
            "the decline is gradual enough to miss without a deliberate check."
        ),
        "ppe": ["nitrile gloves"],
        "equipment": [item("Ruler or callipers"), item("Reference records", "prior growth rates")],
        "materials": [],
        "appliesTo": ["propagation:agar_to_agar", "accession:register"],
        "steps": [
            step(1, "Measure radial growth over a fixed interval and compare with earlier generations of the same line."),
            step(2, "Assess morphology: rhizomorphic, strand-like growth generally indicates vigour; a flat, cottony, tomentose mat can indicate decline in species that normally run rhizomorphic."),
            step(3, "Note any sectoring — a wedge growing at a visibly different rate or texture is a genetic change, not a defect. Isolate it if the trait is desirable, discard if not."),
            step(4, "Check the clone generation. Past roughly G5, treat declining rate as senescence rather than a bad plate.", critical=True),
            step(5, "If vigour is down, re-isolate from a stored early generation, a fresh clone, or a spore print — a print resets the clone generation entirely."),
            step(6, "Record the check as an observation so the trend is visible rather than remembered."),
        ],
        "references": [PSU],
        "tags": ["quality", "senescence", "troubleshooting"],
    },
    # ------------------------------------------------------------ harvest ---
    {
        "code": "SOP-HRV-001",
        "title": "Harvesting, grading and recording",
        "category": ProtocolCategory.HARVEST,
        "purpose": "Harvest at the right moment and record the yield so it can be attributed to the genetics that produced it.",
        "ppe": ["nitrile gloves", "hair net"],
        "equipment": [item("Harvest knife", "sanitised"), item("Scales"), item("Shallow crates")],
        "materials": [],
        "appliesTo": ["harvest:record"],
        "steps": [
            step(1, "Harvest before spore release — typically as caps begin to flatten but before edges upturn. Spore drop costs shelf life and coats the room.", critical=True),
            step(2, "Harvest the whole cluster rather than picking individuals, for species that fruit in clusters."),
            step(3, "Twist or cut cleanly at the base, leaving no stump to rot back into the block."),
            step(4, "Grade as you pick rather than re-handling later. Handle by the stem; cap bruising shows within hours."),
            step(5, "Weigh per block, not per room.", critical=True),
            step(6, "Record the harvest against the specific fruiting block and enter the block's dry substrate weight, so biological efficiency is comparable between lineages rather than averaged across the room.", critical=True),
            step(7, "Cool promptly and store per species. Pink oyster in particular has a very short fresh life."),
            step(8, "Note the flush number and anything unusual about the block — the yield-by-generation trend is only as good as the records behind it."),
        ],
        "references": [PSU_PROD],
        "tags": ["harvest", "grading", "yield"],
    },
]


async def main(approve: bool) -> None:
    await mongodb.connect()
    db = mongodb.get_database()

    inserted, skipped = [], []
    for spec in PROTOCOLS:
        code = spec["code"]
        if await db.protocols.find_one({"code": code}, {"_id": 1}):
            skipped.append(code)
            continue

        protocol = Protocol(
            **spec,
            status=ProtocolStatus.ACTIVE if approve else ProtocolStatus.DRAFT,
            approvedByName="Seeded from literature" if approve else None,
            approvedAt=datetime.utcnow() if approve else None,
        )
        doc = protocol.model_dump()
        doc["protocolId"] = doc.pop("id")
        await db.protocols.insert_one(doc)
        inserted.append(f"{code} ({len(spec['steps'])} steps)")

    print(f"\ninserted {len(inserted)}:")
    for c in inserted:
        print("  +", c)
    if skipped:
        print(f"\nskipped {len(skipped)} already present: {', '.join(skipped)}")
    print(f"\nstatus: {'ACTIVE' if approve else 'DRAFT — approve before use at the bench'}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--approve",
        action="store_true",
        help="Mark seeded protocols ACTIVE. Without this they land as drafts, "
             "which is the honest default until someone here has read them.",
    )
    args = ap.parse_args()
    asyncio.run(main(args.approve))
