/**
 * Night Observatory (T-901) phase/icon mapping for the mushroom module.
 *
 * `src/types/mushroom.ts` is outside this shard's owned directories and
 * still derives `PHASE_COLORS` / `PHASE_TEXT_COLORS` from the dead
 * `lightTheme` (see file header there) — it was not in scope to edit here.
 * Components in this shard route phase colour through `phaseBadge()` /
 * `theme.colors.phase` directly instead of those two exports, via the
 * mapping below from the module's `RoomPhase` (snake_case, e.g.
 * `fruiting_initiation`) onto the frozen `PhaseKey` vocabulary (spec §5.1,
 * camelCase, e.g. `fruitingInit`).
 *
 * `ROOM_TYPE_ICON_COMPONENTS` is the lucide-react replacement for
 * `ROOM_TYPE_ICONS` (emoji, also defined in the out-of-scope types file) —
 * spec §6 removes every icon emoji.
 *
 * `ROOM_PHASE_TO_KEY` (formerly a hand-written duplicate of
 * `ROOM_PHASE_TO_PHASE_KEY` in `types/mushroom.ts`) has been removed —
 * import the canonical map directly instead (T-901 final cleanup).
 */
import type { LucideIcon } from 'lucide-react';
import {
  FlaskConical,
  TestTube2,
  Wheat,
  Package,
  Sprout,
  Snowflake,
  ClipboardList,
} from 'lucide-react';
import type { HarvestQualityGrade, RoomType } from '../../types/mushroom';

export const ROOM_TYPE_ICON_COMPONENTS: Record<RoomType, LucideIcon> = {
  lab: FlaskConical,
  spawn: TestTube2,
  substrate_prep: Wheat,
  incubation: Package,
  fruiting: Sprout,
  storage: Snowflake,
  harvest_pack: ClipboardList,
};

/**
 * Harvest quality grade — an ordinal data encoding (A best -> rejected
 * worst), walked across distinct `theme.colors.bright.*` hues. Replaces
 * `QUALITY_GRADE_COLORS` (types/mushroom.ts, out of scope, still keyed off
 * the dead `lightTheme` — its grade C lands on `warning`/gold-b, which spec
 * §3 reserves for the literal Harvesting room phase, not a quality band).
 */
export const QUALITY_GRADE_HUE: Record<HarvestQualityGrade, string> = {
  A: 'emerald',
  B: 'lapis',
  C: 'terra',
  D: 'coral',
  rejected: 'coral',
};
