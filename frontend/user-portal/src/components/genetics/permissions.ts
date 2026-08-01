/**
 * Genetics Repo — client-side mirror of the role gates enforced server-side
 * in src/modules/genetics/middleware/auth.py (PERMISSION_ROLES).
 *
 * This is a UI convenience only, never a substitute for the server check —
 * used solely to decide whether to render a control at all, so a role that
 * would 403 never sees the button in the first place (CLAUDE.md T-8xx
 * "Remove line" spec, part C).
 */

// _CURATION in auth.py: moderator and above.
const CURATION_ROLES = new Set(['moderator', 'admin', 'super_admin']);

/** genetics.delete — deactivate a line, or purge one with zero dependents. */
export function canDeleteLines(role: string | undefined | null): boolean {
  return !!role && CURATION_ROLES.has(role);
}

/** genetics.delete.cascade / genetics.maintenance — strictly super_admin. */
export function canCascadePurge(role: string | undefined | null): boolean {
  return role === 'super_admin';
}

// _BENCH in auth.py: user and above (everyone except guest).
const BENCH_ROLES = new Set(['user', 'moderator', 'admin', 'super_admin']);

/** genetics.edit — update/split an accession, or amend a propagation event's date. */
export function canEditGenetics(role: string | undefined | null): boolean {
  return !!role && BENCH_ROLES.has(role);
}
