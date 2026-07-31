/**
 * Night Observatory (T-901) lucide-react replacement for
 * `PROTOCOL_CATEGORY_ICONS` (emoji, `src/types/protocols.ts`, out of scope
 * for this shard) — spec §6 removes every icon emoji. Shared across every
 * protocols screen that renders a category icon.
 */
import type { LucideIcon } from 'lucide-react';
import {
  FlaskConical,
  Sprout,
  ShoppingBasket,
  SprayCan,
  HardHat,
  Wrench,
  Microscope,
  ClipboardList,
} from 'lucide-react';
import type { ProtocolCategory } from '../../types/protocols';

export const PROTOCOL_CATEGORY_ICON_COMPONENTS: Record<ProtocolCategory, LucideIcon> = {
  lab: FlaskConical,
  cultivation: Sprout,
  harvest: ShoppingBasket,
  sanitation: SprayCan,
  safety: HardHat,
  equipment: Wrench,
  quality: Microscope,
  admin: ClipboardList,
};
