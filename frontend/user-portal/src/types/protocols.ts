/**
 * Protocols (SOP) Types
 *
 * Mirrors src/modules/protocols/models/. A protocol is a versioned written
 * procedure; `appliesTo` scope tags are what bind it to the screen where the
 * work is recorded, so the right SOP appears in context rather than waiting to
 * be looked up.
 */

export type ProtocolCategory =
  | 'lab'
  | 'cultivation'
  | 'harvest'
  | 'sanitation'
  | 'safety'
  | 'equipment'
  | 'quality'
  | 'admin';

export type ProtocolStatus = 'draft' | 'active' | 'retired';

export const PROTOCOL_CATEGORY_LABELS: Record<ProtocolCategory, string> = {
  lab: 'Lab technique',
  cultivation: 'Cultivation',
  harvest: 'Harvest',
  sanitation: 'Sanitation',
  safety: 'Safety',
  equipment: 'Equipment',
  quality: 'Quality control',
  admin: 'Admin & records',
};

export const PROTOCOL_CATEGORY_ICONS: Record<ProtocolCategory, string> = {
  lab: '🧫',
  cultivation: '🌱',
  harvest: '🧺',
  sanitation: '🧼',
  safety: '🦺',
  equipment: '🔧',
  quality: '🔬',
  admin: '📋',
};

export const PROTOCOL_STATUS_LABELS: Record<ProtocolStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  retired: 'Retired',
};

/**
 * A visual reference. `attachmentId` is a photo taken in this lab (preferred);
 * `externalUrl` is a cited published figure and requires attribution.
 * `showsWhat` is separate from `caption` because a visual guide has to say what
 * the reader should be looking at, not just what the picture is of.
 */
export interface ProtocolImage {
  attachmentId?: string | null;
  externalUrl?: string | null;
  caption: string;
  attribution?: string | null;
  showsWhat?: string | null;
}

export interface ProtocolStep {
  order: number;
  text: string;
  durationMinutes?: number | null;
  /** Steps that get skipped under time pressure and cause the failure later. */
  isCritical: boolean;
  images: ProtocolImage[];
  notes?: string | null;
}

export interface Consumable {
  name: string;
  quantity?: string | null;
  notes?: string | null;
}

export interface Protocol {
  id: string;
  code: string;
  title: string;
  category: ProtocolCategory;
  purpose?: string | null;
  scope?: string | null;
  ppe: string[];
  safetyNotes?: string | null;
  equipment: Consumable[];
  materials: Consumable[];
  steps: ProtocolStep[];
  /** Scope tags, e.g. 'propagation:agar_to_agar', 'media:pour'. */
  appliesTo: string[];
  references: string[];
  /** Gallery for the procedure as a whole, e.g. contamination identification. */
  referenceImages: ProtocolImage[];
  tags: string[];
  notes?: string | null;
  version: number;
  status: ProtocolStatus;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProtocolPayload {
  code: string;
  title: string;
  category: ProtocolCategory;
  purpose?: string;
  scope?: string;
  ppe?: string[];
  safetyNotes?: string;
  equipment?: Consumable[];
  materials?: Consumable[];
  steps?: ProtocolStep[];
  appliesTo?: string[];
  references?: string[];
  referenceImages?: ProtocolImage[];
  tags?: string[];
  notes?: string;
}

export type UpdateProtocolPayload = Partial<CreateProtocolPayload> & {
  status?: ProtocolStatus;
};

/**
 * A pinned reference stored on a work record. Denormalised so the version
 * actually followed stays readable after the protocol is revised.
 */
export interface ProtocolRef {
  protocolId: string;
  code?: string | null;
  title?: string | null;
  version: number;
  followedAt?: string | null;
}

/**
 * Scope tags used across the app. Keeping them here rather than as loose
 * strings means a typo shows up as a type error instead of a protocol that
 * silently never appears anywhere.
 */
export const PROTOCOL_SCOPES = {
  propagationAgar: 'propagation:agar_to_agar',
  propagationTissue: 'propagation:tissue_clone',
  propagationLC: 'propagation:lc_inoculation',
  propagationGrain: 'propagation:grain_transfer',
  propagationBulk: 'propagation:bulk_inoculation',
  propagationSpore: 'propagation:spore_print',
  mediaPour: 'media:pour',
  mediaSterilise: 'media:sterilise',
  harvestRecord: 'harvest:record',
  accessionRegister: 'accession:register',
  contamination: 'contamination:response',
  roomFruiting: 'room:fruiting',
} as const;

/** Scope tag for a propagation method, e.g. agar_to_agar -> propagation:agar_to_agar. */
export function scopeForMethod(method: string): string {
  return `propagation:${method}`;
}
