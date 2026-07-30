/**
 * Tutorial registry
 *
 * Tutorials live in code rather than the database because they are product
 * documentation: they describe the UI, so they change when the UI changes and
 * should be reviewed in the same commit. A database copy would drift out of
 * date silently and nobody would notice until it misled someone.
 *
 * Each topic explains what a screen is *for* and the one or two things that are
 * genuinely non-obvious — not a narration of every control. If a step just
 * reads "click the button labelled X", delete it; the button already says that.
 *
 * `protocols` lists SOP codes worth reading alongside. They are shown as plain
 * references, not links, because a protocol may not exist in every lab.
 */

export interface TutorialStep {
  title: string;
  body: string;
}

export interface Tutorial {
  /** Stable id — used as the seen-state key, so renaming it re-shows the tour. */
  id: string;
  title: string;
  /** One or two sentences: what this screen is for. */
  lead: string;
  steps: TutorialStep[];
  /** The thing people get wrong. Rendered with emphasis. */
  watchOut?: string;
  /** Related SOP codes, shown as references. */
  protocols?: string[];
}

export const TUTORIALS: Record<string, Tutorial> = {
  'genetics.repo': {
    id: 'genetics.repo',
    title: 'The Genetics Repo',
    lead: 'Your strain, variety and bloodline library — and the traceability trail from any dish in your hand back to where it came from.',
    steps: [
      {
        title: 'A line is an identity, not a thing',
        body: '"Blue Oyster" is a line. The four plates in incubator 2 are an accession. One line has many accessions over time, at different generations and in different rooms.',
      },
      {
        title: 'Order matters when you start',
        body: 'Pour a medium batch before registering material. An accession records what it grew on at the moment it is created, and that cannot be filled in afterwards.',
      },
      {
        title: 'Everything physical lives in a room',
        body: 'Petri dishes, LC jars, spawn bags and fruiting blocks are all accessions with a room. That is what makes "what is in my lab right now" answerable.',
      },
    ],
    watchOut:
      'A line with no accessions is just a name. The repo only becomes useful once the physical material is registered against it.',
  },

  'genetics.propagate': {
    id: 'genetics.propagate',
    title: 'Cloning versus expanding',
    lead: 'Both live behind the Propagate button, and they mean opposite things to the generation counter.',
    steps: [
      {
        title: 'Clone — a new generation',
        body: 'An agar-to-agar transfer or tissue clone advances G. G counts how many times a culture has been transferred, which is what predicts vigour loss.',
      },
      {
        title: 'Expansion — the same generation, more of it',
        body: 'Culture → liquid culture → grain spawn → bulk block leaves G alone. A production run multiplies a culture; it does not age it. A G2 culture stays G2 through the whole chain.',
      },
      {
        title: 'Spore prints reset',
        body: 'A print is sexual recombination, so the result is a brand-new individual: F goes up by one and G restarts at 0. A print off a G5 fruit is F1-G0, not G6. Tissue-cloning that same fruit is G6.',
      },
    ],
    watchOut:
      'Watch the preview line before you commit. It shows exactly what will be created and why, so if the generation looks wrong you have picked the wrong method.',
    protocols: ['SOP-LAB-007'],
  },

  'genetics.accession': {
    id: 'genetics.accession',
    title: 'Working with a single accession',
    lead: 'One physical record — a batch of plates, a jar, a set of blocks — and everything that has happened to it.',
    steps: [
      {
        title: 'Split when one vessel diverges',
        body: 'If one plate in eight sectors or contaminates, split it out. It keeps the same generation and parents, because it is the same material — just tracked separately from now on.',
      },
      {
        title: 'Observe, then promote',
        body: 'Record what you see. Flagging an observation as a novel trait is what lets you later promote it into its own line, with the ancestry back to this dish intact.',
      },
      {
        title: 'Read the breadcrumb',
        body: 'The "where it came from" trail walks back through every propagation. If it ends in "unrecorded origin", that is honest — the material predates the record, rather than the trail being broken.',
      },
    ],
  },

  'genetics.media': {
    id: 'genetics.media',
    title: 'Recipes and batches',
    lead: 'Formulations, the batches poured from them, and what any experiment was actually grown on.',
    steps: [
      {
        title: 'A recipe is versioned; a batch is a snapshot',
        body: 'Editing a formulation bumps the recipe version. Batches already poured keep the ingredient list they were made with, so history stays truthful after you change the recipe.',
      },
      {
        title: 'Additives are tracked separately',
        body: 'Put the things you are testing in the additives list, not the base ingredients. That is what makes "show me everything grown on a medium containing X" a single click.',
      },
      {
        title: 'Units are fixed on purpose',
        body: 'The unit is a dropdown because g/L, G/L and g/l are one unit to you and three to the database — any later ratio calculation would split across them silently.',
      },
    ],
    watchOut:
      'Yield figures across the app are biological efficiency on DRY substrate. The same crop reads roughly three times lower per kg of wet medium.',
    protocols: ['SOP-LAB-004'],
  },

  'protocols.library': {
    id: 'protocols.library',
    title: 'Protocols (SOPs)',
    lead: 'Written procedures — how a job is done here — surfaced at the point where the work is recorded.',
    steps: [
      {
        title: 'Tag where it applies',
        body: 'The "appears at" tags are the whole point. A protocol tagged propagation:agar_to_agar shows up inside the Propagate modal. An untagged protocol lives in the library and nobody meets it while working.',
      },
      {
        title: 'Only approved procedures reach the bench',
        body: 'Drafts are not offered when recording work, and citing one is refused. Approve a protocol to put it into use.',
      },
      {
        title: 'Mark the critical steps',
        body: 'Flag the steps that get skipped under time pressure and cause the failure later. They are highlighted everywhere the protocol appears.',
      },
    ],
    watchOut:
      'Revising an approved protocol bumps its version and returns it to draft. That is deliberate — a changed procedure is not the one that was signed off — but it does stop being offered until someone re-approves it.',
  },

  'mushroom.facilities': {
    id: 'mushroom.facilities',
    title: 'Facilities and rooms',
    lead: 'Your buildings and the rooms inside them. Room type decides how a room behaves.',
    steps: [
      {
        title: 'Fruiting rooms run one crop',
        body: 'They have a phase lifecycle — preparing, inoculated, colonising, fruiting, harvesting — and one strain at a time.',
      },
      {
        title: 'Every other room is a container',
        body: 'A lab, spawn room, incubation room or store holds many independent items at once. There is no single strain or crop phase; the dishes and blocks inside carry their own state, and the card shows what is in there.',
      },
      {
        title: 'Deleting refuses rather than cascades',
        body: 'A room holding material or carrying harvest history cannot be deleted, because that would orphan the records. Decommission it instead — it goes out of use and keeps its history.',
      },
    ],
  },

  'mushroom.harvest': {
    id: 'mushroom.harvest',
    title: 'Recording a harvest',
    lead: 'Weight and grade, plus the two fields that make the number mean something.',
    steps: [
      {
        title: 'Name the block',
        body: 'Picking the fruiting block attributes the yield to the lineage that produced it. Without it the harvest is still recorded, but it cannot answer "which of my cultures yields best".',
      },
      {
        title: 'Set the substrate weight per block',
        body: 'Biological efficiency is yield divided by dry substrate weight. If a room holds blocks from several batches, giving them all the room-level figure makes the comparison between lineages meaningless.',
      },
    ],
    protocols: ['SOP-HRV-001'],
  },

  'mushroom.strains': {
    id: 'mushroom.strains',
    title: 'Strain Library vs Genetics Repo',
    lead: 'These answer different questions, and both are needed.',
    steps: [
      {
        title: 'The Strain Library is growing conditions',
        body: 'What temperature, humidity and duration a species wants. One entry per species. It feeds room climate targets.',
      },
      {
        title: 'The Genetics Repo is lineage',
        body: 'Which specific culture you are holding and where it came from. Many lines can share one strain profile.',
      },
      {
        title: 'Link them',
        body: 'A genetic line can point at its strain profile, so the growing targets appear next to the lineage instead of in a separate module. The card here shows how many lines carry each strain.',
      },
    ],
  },
};

export function getTutorial(topic: string): Tutorial | undefined {
  return TUTORIALS[topic];
}
