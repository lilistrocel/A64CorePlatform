/**
 * Night Observatory (T-901) lucide-react replacement for `KIND_ICONS`
 * (emoji, `src/types/genetics.ts`, out of scope for this shard) — spec §6
 * removes every icon emoji. Shared across the genetics pages that render an
 * organism-kind icon (GeneticsRepoPage, LineDetailPage) so the mapping only
 * lives in one place.
 */
import type { LucideIcon } from 'lucide-react';
import { Leaf, Sprout, PawPrint, HelpCircle } from 'lucide-react';
import type { OrganismKind } from '../../types/genetics';

export const KIND_ICON_COMPONENTS: Record<OrganismKind, LucideIcon> = {
  plant: Leaf,
  fungus: Sprout,
  animal: PawPrint,
  other: HelpCircle,
};
