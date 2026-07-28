# AGENTS.md — A20Core Slate Brand Rules

> **You are a coding agent working on the A20Core platform.** This file is the
> non-negotiable visual contract. Follow it every time you write a component,
> page, chart, or layout. When in doubt, prefer **less** ornament — Slate is
> editorial, not decorative.

Stack you will see in this repo: React 18 + TypeScript + Vite + **styled-components 6** +
TanStack Query + Zustand + React Router 6 + React Hook Form + Zod + Recharts +
MapLibre GL + react-grid-layout.

---

## §1. The mental model

A20Core's UI is **a national infrastructure white-paper rendered as software**.
It is Bloomberg-terminal calm, not Stripe-marketing slick. If a design choice
makes the screen feel more like a *product launch page*, reject it. If it makes
the screen feel more like a *central-bank dashboard*, ship it.

The aesthetic codename is **Slate**. Replaces the deprecated dark-navy
"Substrate" identity. Do not reintroduce navy + teal anywhere.

---

## §2. Tokens — the only source of truth

**Always import from `@/theme`.** Never inline a hex code, font name, pixel
spacing, or radius value.

```tsx
// ✅ DO
const Wrap = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  padding: ${({ theme }) => theme.space['6']};
`

// ❌ DON'T
const Wrap = styled.div`
  background: #EDEAE3;       /* hard-coded hex */
  padding: 24px;             /* hard-coded spacing */
`
```

The only place a hex appears is inside `src/theme/tokens.ts`. If you find
yourself writing a color that isn't in the theme, **first** add a semantic
token, **then** consume it.

---

## §3. Palette discipline

Six brand colors, used at very different ratios. Treat this as a budget —
exceeding it breaks the look:

| Color | Token | Usage budget | When to use |
|---|---|---|---|
| Linen | `colors.surface.canvas` | **~70%** | Page backgrounds, the default surface. |
| Stone | `colors.surface.sunken` / `border.subtle` | ~12% | Wells, inputs, dividers. |
| Ink | `colors.text.primary` | ~12% | Headlines, body, KPI numbers. |
| Slate | `colors.text.secondary` | ~2% | Captions, mono labels, metadata. |
| Sage | `colors.accent.sage` | **~3%** | The single chromatic accent. KPIs, brand rule, links, key chart series. |
| Rust | `colors.accent.rust` | **<1%** | RESERVED. See §3a. |

### §3a. Rust is sacred

Rust (`#B85C2A`) is the brand's emergency accent. It appears in **exactly two
contexts**:

1. **Pricing / "The Ask" screens** — the headline number on a checkout / pricing
   / investment page.
2. **The single most important call-to-action on a destination** — and never
   more than one per page.

Do not use Rust for: warnings, errors, links, hover states, "new" badges,
disabled states, or chart highlights. Use the `status.warning`/`status.danger`
tokens for those. If a designer says "make this stand out," reach for
`accent.sage`, not `accent.rust`.

---

## §4. Typography discipline

Three fonts, three roles. Never mix them up:

- **Playfair Display** — display heads only (h1, h2, hero numbers, KPI values).
  Big, italic-when-emphasising-a-word, tight tracking. Never use for body, never
  use for buttons, never use under 18px.
- **Inter** — every body, label, button, nav, form. 14–18px the sweet spot.
- **IBM Plex Mono** — metadata, status chips, version numbers, page chips,
  numeric units. Always `text-transform: uppercase` with `letter-spacings.wider`
  when used as a chip. Never use for paragraph text.

The signature Slate move: a Playfair headline where the **second clause is
italic**. Always use `<em>` inside the heading, not a separate class:

```tsx
<h1>The Cornerstone of <em>National Food Security.</em></h1>
```

---

## §5. Layout

- **Containers** never exceed `theme.layout.containerMax` (1440px).
- **Page padding**: 40px on lg+, 16px on mobile. Use `theme.layout.outerPadding`.
- **Grid**: 12 columns, 24px gutter (`theme.space['6']`).
- **Brand rule**: every major page section gets a 2px Sage top rule
  (`theme.brandRule.sage` or the `<BrandRule />` component).
- **Whitespace is structural.** If a section feels cramped, add space — don't
  add borders.

---

## §6. styled-components conventions

1. **Use `$`-prefixed transient props** for any prop that styles but shouldn't
   reach the DOM:
   ```tsx
   <Btn $variant="primary" $size="md" />     // ✅
   <Btn variant="primary" size="md" />       // ❌ leaks to DOM
   ```
2. **Co-locate styles**. For a component `<Foo />`, either keep its
   styled parts in the same file, or in a sibling `Foo.styles.ts`. Never put
   one component's styles in a global `styles/` folder.
3. **No CSS-in-JS for layout primitives that pure CSS handles.** A `gap` on a
   parent flex/grid is better than a `margin-top` on every child.
4. **Theme is fully typed**: `${({ theme }) => theme.colors.text.primary}` will
   autocomplete (via `styled.d.ts`). If it doesn't, you forgot to wrap in
   `<ThemeProvider>`.

---

## §7. Component patterns

Reference implementations live at `src/components/`. The canonical examples:

- `Button.tsx` — variants `primary` (sage), `ghost`, `subtle`, `ask` (rust — §3a),
  `danger`. Sizes `sm`/`md`/`lg`. Always use `$variant` and `$size`.
- `Card.tsx` — variants `bordered` (default), `raised`, `accent` (with Sage top
  rule), `plain`. Flat by default; elevate only when interactive.
- `KPICard.tsx` — the signature Slate KPI: mono label, Playfair number, mono
  delta. Numbers use `font-variant-numeric: tabular-nums`.
- `MetricChip` / `MetricRow` — for the bottom-of-page mono metadata rows.
- `BrandRule.tsx` — the 2px Sage horizontal anchor.
- `SplitHero.tsx` — editorial cover layout with right-side photo panel.

Build all new components by composing these. Do not reach for shadcn/ui,
Material UI, Chakra, Mantine, or Ant Design — the look will fight back.

---

## §8. Charts (Recharts)

```tsx
import { rechartsTheme, chartPalette } from '@/theme'

<LineChart data={data}>
  <CartesianGrid {...rechartsTheme.grid} />
  <XAxis dataKey="day"   {...rechartsTheme.axis} />
  <YAxis                  {...rechartsTheme.axis} />
  <Tooltip                {...rechartsTheme.tooltip} />
  <Line dataKey="yield"   stroke={chartPalette[0]} strokeWidth={2} dot={false} />
</LineChart>
```

Rules:
- **No hard-coded chart colors.** Use `chartPalette[i]` in series order.
- **Hide the vertical grid** (Slate editorial default — set on `rechartsTheme.grid`).
- **No 3D, no gradients, no shadow effects** on chart elements.
- **Tabular numerals** on every axis label that shows numbers.
- **No legend dots inside the chart area** — use the tokens' legend defaults
  which place a thin legend below.

---

## §9. Maps (MapLibre + react-map-gl)

```tsx
import { slateMapStyle, mapLayerStyles } from '@/theme'

<Map
  mapStyle={slateMapStyle()}
  initialViewState={{ longitude: 54.3773, latitude: 24.4539, zoom: 9 }}
  attributionControl
>
  <Source id="parcels" type="geojson" data={parcels}>
    <Layer id="parcels-fill" type="fill" paint={mapLayerStyles.parcelFill} />
  </Source>
</Map>
```

Rules:
- **Never use the default Mapbox / OSM style.** Always wrap with `slateMapStyle()`
  so tiles are desaturated and overlaid with Linen.
- **Parcel polygons**: Sage fill, 15% opacity by default; selected state at 30%.
- **Sensors / assets**: small Sage dots with Linen stroke (use `sensorPoint`).
- **Warnings / out-of-spec parcels**: ochre `warning` color, not Rust.

---

## §10. Forms (React Hook Form + Zod)

- Inputs: 40px tall (`md`), Stone fill, Ink text, Stone-deep border on focus
  becomes Sage. Mirror the Button size scale.
- Validation: Zod schemas live next to the form; error text in `colors.status.danger`,
  body sm, italic.
- Labels: above the input, Slate, body sm, semibold.
- No floating labels (they fight the editorial calm).

---

## §11. Motion

- Default transition: `theme.motion.duration.base` (200ms) with `easing.standard`.
- **Respect `prefers-reduced-motion`** — `GlobalStyles` handles this; don't
  override it with `transition: ... !important` anywhere.
- **No springy bounces, no easeOutBack**, no decorative motion. Slate moves;
  it doesn't perform.

---

## §12. Accessibility (hard rules)

- **Contrast**: Ink on Linen = 19.3:1 (AAA). Slate on Linen = ~6.9:1 (AA Large
  only — don't use Slate for body copy under 18px).
- **Never put Sage text on Stone** — fails contrast. Sage on Linen is fine.
- **Focus**: every interactive element shows `theme.shadows.focus` (sage ring).
  Don't disable focus outlines; replace them, don't remove them.
- **Touch targets** ≥ 40px on mobile.

---

## §13. Anti-patterns (immediate rejections)

- Glassmorphism, neumorphism, frosted overlays.
- Gradient text, gradient backgrounds (Sage→Rust gradient = especially banned).
- Drop shadows above `shadows.lg`.
- Border radii above `radii.xl` (12px). No pill buttons except `MetricChip`.
- Emoji as UI (status icons, decorative elements). Use proper icon libraries.
- Full-bleed photography (Slate uses photography as small punctuation).
- Decorative dividers (lines that aren't the 2px Sage rule).
- Animated loaders that "breathe" or pulse. Use a simple Sage spinner.
- Dark-mode-by-default. Slate is light-first; dark is opt-in only for
  ops/night surfaces.

---

## §14. File / naming conventions

- Components: PascalCase, one component per file (`KPICard.tsx`).
- Styles co-located in the same file, or as `KPICard.styles.ts` sibling.
- Utility / helper modules: kebab-case (`format-currency.ts`).
- Hooks: `useThing.ts` in `src/hooks/`.
- Tests: `*.test.tsx` next to the file under test.

---

## §15. When the rules don't cover it

Default to **less**. Smaller type. Less color. More whitespace. If the
result looks like the cover of a McKinsey report, you're on-brand. If it
looks like a SaaS marketing site, you're not.

Brand kit spec doc: `Brand_Engineering/A20Core_Engineering_Brand_Guide.md`.
Design tokens: `src/theme/tokens.ts`.
