// Night Observatory glass-panel mixins.
//
// Source of truth: Docs/2-Working-Progress/night-observatory-spec.md §2.
// Visual ground truth: Brand_Engineering/Brand/A20Core_NightObservatory_Glass.html
//
// These are the ONLY place the glass recipe, gold thread, mono label and
// phase badge patterns are defined — do not hand-roll them per component.
// Every mixin composes inside a styled-components template via `css`.
//
// Baked in per spec §2:
//  - `backdrop-filter` + `-webkit-backdrop-filter` together, always.
//  - `@supports not (backdrop-filter: blur(1px))` fallback to `colors.glass.opaque`.
//  - `@media (prefers-reduced-motion: reduce)` disables lift/glow transitions.
import { css } from 'styled-components';
import type { Theme, PhaseKey } from './theme';

function parseHexChannels(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(clean)) return null;
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const bigint = parseInt(full, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

/**
 * Convert a colour token to `rgba(r, g, b, alpha)` at the given alpha. Used
 * to build the 16%/45% tints the badge pattern (spec §4) requires — CSS
 * can't tint a hex (or rgba) custom property without either `color-mix()`
 * (not supported in every target browser yet) or pre-computed rgba.
 *
 * Contract (this is the part that matters — read before reusing):
 *  - `#rrggbb` / `#rgb` input (phase.*, bright.* and most other theme hex
 *    tokens) → parsed and re-emitted at `alpha`. This is the common case.
 *  - `rgb(...)` / `rgba(...)` input → the R/G/B channels are kept and ONLY
 *    the alpha channel is replaced with `alpha`. This case exists because
 *    several dark-theme ground tokens — `surface`, `line`, `glass.*`, and
 *    the `*Bg` tokens — are defined as rgba(...) STRINGS in theme.ts, not
 *    hex. A naive hex parser fed one of those produces `NaN` channels and
 *    silently invalid CSS (`rgba(NaN, NaN, NaN, 0.16)` — a declaration the
 *    browser drops, not an error anyone sees). That is exactly the failure
 *    mode the codebase's `${token}cc` hex-alpha idiom hit. Re-aliasing
 *    instead of rejecting means a caller can pass any themed surface token
 *    into `colorBadge`/`hexToRgba` without first checking which shape it
 *    happens to be.
 *  - Anything else (a CSS named colour, `hsl()`, a bare custom property) is
 *    returned UNCHANGED, with a dev-only console warning. Silently emitting
 *    garbage CSS is worse than emitting the original (at-least-valid)
 *    colour at the wrong alpha — this mixin has no way to blend an alpha
 *    into a colour space it doesn't understand, so it declines rather than
 *    guesses.
 */
export function hexToRgba(input: string, alpha: number): string {
  const hexChannels = parseHexChannels(input);
  if (hexChannels) {
    const [r, g, b] = hexChannels;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const rgbaMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(
    input.trim(),
  );
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      `hexToRgba: unrecognised colour "${input}" (not hex or rgba) — returning it unchanged, alpha ${alpha} NOT applied.`,
    );
  }
  return input;
}

/**
 * Lighten a `colors.bright.*` hex toward cream by a fixed 16% blend — the
 * cheapest correct hover state for tokens that have no shade ramp.
 *
 * Why a helper and not a ramp: `colors.bright.*` (spec §1.2) is nine flat
 * hexes with no `50..900` steps, so nothing using a bright accent has a
 * built-in hover shade — one Phase 3 screen shipped a tile whose hover was
 * pixel-identical to its rest state. Generating a full 9-hue ramp (à la
 * `primary`/`secondary`) is out of proportion to the problem: those ramps
 * exist because primary/secondary need many weights (text, fills, borders,
 * disabled states) across many components, whereas `bright.*` is used as a
 * single accent colour in a handful of places and only ever needs ONE
 * more step, for `:hover`. A blend-toward-cream function gives that one
 * step, stays consistent across every `bright.*` token (same 16% blend
 * regardless of hue, unlike hand-picking nine bespoke hover hexes), and
 * costs one function instead of 45+ new colour constants.
 *
 * Blends toward `#FAF3E2` (cream-hi) rather than toward flat white so the
 * lightened result stays inside the palette's warm-neutral family instead
 * of drifting toward a cold white — consistent with how the dark theme's
 * own tints (glass.shine, textPrimary) are cream-based, not white-based.
 */
export function brightHover(hex: string): string {
  const channels = parseHexChannels(hex);
  if (!channels) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`brightHover: "${hex}" is not a hex colour — returning it unchanged.`);
    }
    return hex;
  }
  const CREAM: [number, number, number] = [0xfa, 0xf3, 0xe2];
  const BLEND = 0.16;
  const [r, g, b] = channels;
  const mix = (channel: number, target: number) => Math.round(channel + (target - channel) * BLEND);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r, CREAM[0]))}${toHex(mix(g, CREAM[1]))}${toHex(mix(b, CREAM[2]))}`;
}

/** The glass-panel recipe: gradient + border + blur(18px) + 3-layer shadow.
 * `position: relative` is included because goldThread/sheen/phaseBadge (all
 * pseudo-element based) are commonly composed alongside this mixin and need
 * a positioning context on the host. This mixin deliberately does NOT set
 * `overflow: hidden` — panels routinely host dropdowns/menus that must be
 * able to overflow their bounds; opt into clipping per-component instead. */
export const glassPanel = css`
  position: relative;
  border-radius: 18px;
  background: linear-gradient(
    155deg,
    ${({ theme }) => theme.colors.glass.hi} 0%,
    ${({ theme }) => theme.colors.glass.base} 55%,
    rgba(14, 19, 48, 0.35) 100%
  );
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow:
    0 18px 40px rgba(4, 6, 18, 0.55),
    0 4px 12px rgba(4, 6, 18, 0.4),
    inset 0 1px 0 rgba(250, 243, 226, 0.1),
    inset 0 0 0 0.5px rgba(180, 200, 220, 0.06);
  transition: transform 0.22s, box-shadow 0.22s, border-color 0.22s;

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/** `glassPanel` + hover lift/gold-rim/gold-glow. INTERACTIVE panels only
 * (room cards, clickable stat tiles, etc.) — never on a static display
 * panel, per spec §2. */
export const glassPanelHover = css`
  ${glassPanel}
  cursor: pointer;

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(220, 185, 79, 0.45);
    box-shadow:
      0 26px 54px rgba(4, 6, 18, 0.65),
      0 0 30px rgba(220, 185, 79, 0.12),
      inset 0 1px 0 rgba(250, 243, 226, 0.14);
  }

  @media (prefers-reduced-motion: reduce) {
    &:hover {
      transform: none;
    }
  }
`;

/** `glassPanel` at the modal/drawer weight — spec §4 "Modals/drawers":
 * blur 24px (vs the base panel's 18px) and 20px radius (vs 18px). Kept as a
 * separate export rather than a parameter on `glassPanel` because
 * `glassPanel` has ~245 existing call sites across the app (checked via
 * `grep -rn '\${glassPanel}'` on 2026-07-30) — parameterising it would mean
 * touching every one of them or defaulting the parameter, and a defaulted
 * parameter is indistinguishable from just adding a second export. Compose
 * on top of `glassPanel` (same gradient/border/shadow recipe) and override
 * only the two properties the modal weight changes; later declarations for
 * the same properties win in the generated CSS, so this does not need to
 * repeat the rest of the recipe. Pair with the `rgba(10, 14, 36, .6)` scrim
 * per spec §4 — this mixin only styles the panel, not the backdrop. */
export const glassPanelModal = css`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
`;

/** Small-radius (11px) glass variant for inputs/selects/pills. No shadow —
 * these sit inline in forms/toolbars, not floating above the sky. */
export const glassControl = css`
  position: relative;
  border-radius: 11px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }
`;

/** Cosmos-hi, no blur — for menus, tooltips, dropdowns, popovers: anything
 * that must stay legible over dense content and shouldn't compose with
 * glass panels underneath it (spec §2's "never stack more than two glass
 * layers" rule — an opaque menu popping out of a glass panel is the
 * intended way to stay under that limit). */
export const glassOpaque = css`
  background: ${({ theme }) => theme.colors.cosmosHi};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  box-shadow: 0 12px 32px rgba(4, 6, 18, 0.5);
`;

/** Space Mono metadata label: uppercase, wide tracking, small size. Default
 * sizing sits mid-range of the spec's .58–.72rem / .10–.16em band; override
 * `font-size`/`letter-spacing` after composing this mixin for a specific
 * spot's exact value (e.g. page-header breadcrumb vs. stat-tile label). */
export const monoLabel = css`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  letter-spacing: 0.13em;
  text-transform: uppercase;
  font-size: 0.62rem;
`;

/** The 2px top gradient thread for stat tiles — `transparent → gold-hi →
 * transparent`. Host must be `position: relative` (glassPanel already
 * provides this). Uses `colors.secondary[500]` (gold-hi), NOT
 * `colors.bright.gold` (gold-b is the warning/harvesting status colour —
 * see the gold-discipline note in theme.ts). */
export const goldThread = css`
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 18px;
    right: 18px;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(
      90deg,
      transparent,
      ${({ theme }) => theme.colors.secondary[500]},
      transparent
    );
    opacity: 0.8;
  }
`;

/** Optional rotated diagonal highlight sweep for hero cards. Host MUST be
 * `position: relative; overflow: hidden` — unlike glassPanel, this mixin
 * does not set overflow because most glassPanel consumers need to allow
 * overflow (dropdowns); opt in per-component. */
export const sheen = css`
  &::before {
    content: '';
    position: absolute;
    top: -60%;
    left: -30%;
    width: 70%;
    height: 200%;
    transform: rotate(22deg);
    background: linear-gradient(
      90deg,
      transparent,
      ${({ theme }) => theme.colors.glass.shine},
      transparent
    );
    pointer-events: none;
  }
`;

/** The §4 badge pattern for ANY colour: text = colour, background = colour
 * at 16%, border = colour at 45%, a 6px glowing dot. `phaseBadge` below is
 * the `PhaseKey`-typed entry point onto this same recipe; use `colorBadge`
 * directly for a badge driven by an arbitrary hex or a `bright.*` token —
 * anything that isn't one of the 12 frozen phase keys. One recipe, two
 * entry points; do not hand-roll this a third time.
 *
 * `color` is a resolved CSS colour string (hex or rgba — see hexToRgba's
 * contract above), not a theme key, so most callers reach for it from
 * inside a prop-interpolation function, e.g. a styled.span with a $color
 * prop whose template body is just "${({ $color }) => colorBadge($color)}".
 * Colour alone never carries the meaning — this only styles the chip;
 * callers must still render the label as text inside it. */
export function colorBadge(color: string) {
  return css`
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px;
    border-radius: 99px;
    font-family: ${({ theme }) => theme.typography.fontFamily.mono};
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${color};
    background: ${hexToRgba(color, 0.16)};
    border: 1px solid ${hexToRgba(color, 0.45)};

    &::before {
      content: '';
      flex-shrink: 0;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
    }
  `;
}

/** The §4 badge pattern for a given frozen phase key — delegates to
 * `colorBadge` with the phase's colour resolved from `theme.colors.phase`.
 * Use this when the badge maps onto one of the 12 room/status phases (spec
 * §5); use `colorBadge` directly for anything else (arbitrary hex,
 * `bright.*`). */
export function phaseBadge(phaseKey: PhaseKey) {
  return css`
    ${({ theme }: { theme: Theme }) => colorBadge(theme.colors.phase[phaseKey])}
  `;
}
