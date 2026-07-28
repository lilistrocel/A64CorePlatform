# A20Core — Engineering Brand Guide

**Identity:** Slate (v0.001, 2026-05-18 — replaces Substrate)
**Tagline:** *The Cornerstone of National Food Security.*
**Stack target:** React 18 + TypeScript + Vite + styled-components 6 + Recharts + MapLibre GL

This is the long-form human reference. The short, machine-readable contract
for coding agents lives at [`AGENTS.md`](./AGENTS.md). When the two disagree,
**AGENTS.md wins**.

---

## 1. The mental model

A20Core is sovereign-grade infrastructure software. The product is a national
food-security platform deployed to ADAFSA, ESG Agro, and equivalent
government / large-private operators in the GCC.

The visual language must reflect that. It is **editorial-corporate**: think
Bloomberg terminal calm, Economist long-read clarity, McKinsey deck restraint.
The defaults are quiet. Authority is communicated through:

- **Massive numerals** in a chunky editorial serif (Playfair Display).
- **Mono metadata** that looks like a status console (IBM Plex Mono).
- **Whitespace as a structural element** — not "padding I didn't fill."
- **A single chromatic accent** (Sage) used sparingly enough that the eye
  knows it means something.

If a design choice feels promotional, energetic, or playful — it is wrong.
If it feels reserved, dense with information, and self-evident — it is right.

---

## 2. Palette

### Brand colors

| Name | Hex | Token | Role | Budget |
|---|---|---|---|---|
| **Linen** | `#EDEAE3` | `colors.surface.canvas` | Page background, the warm-paper feel | ~70% |
| **Linen Soft** | `#F4F2EC` | `colors.surface.raised` | Lifted card surface, hover | (within Linen) |
| **Stone** | `#DCD8CF` | `colors.surface.sunken` / `border.subtle` | Wells, inputs, dividers | ~12% |
| **Stone Deep** | `#CFC9BD` | `colors.border.default` | Table rules, borders | (within Stone) |
| **Ink** | `#0F0F0F` | `colors.text.primary` | Headlines, body, KPI numbers | ~12% |
| **Slate** | `#4B4844` | `colors.text.secondary` | Captions, metadata, mono labels | ~2% |
| **Sage** | `#0F6E56` | `colors.accent.sage` | The single chromatic accent | ~3% |
| **Rust** | `#B85C2A` | `colors.accent.rust` | RESERVED — see §2a | <1% |

### Status colors (functional)

| Name | Hex | Token | Use |
|---|---|---|---|
| Success | `#0F6E56` (= Sage) | `colors.status.success` | Healthy, on-target, complete |
| Warning | `#B8842A` | `colors.status.warning` | Out-of-spec but not failed |
| Danger | `#9E2A2A` | `colors.status.danger` | Failure, destructive action confirm |
| Info | `#4B4844` (= Slate) | `colors.status.info` | Neutral information |

Note: status is muted intentionally. A20Core never uses a pure red — brick
red `#9E2A2A` reads as serious without screaming.

### §2a. Rust discipline

Rust is the brand's emergency accent. Use it in exactly two contexts:

1. **Pricing / "The Ask" screens.** The hero number on an investment, pricing,
   or contract-value page.
2. **The single most important call-to-action** on a destination — never more
   than one Rust element per page.

Things Rust is **not** for: warnings (use `warning`), errors (use `danger`),
links (use Sage), "new" badges, disabled states, chart highlights, or hover
states.

### Contrast quick reference

| Foreground | Background | Ratio | WCAG |
|---|---|---|---|
| Ink (`#0F0F0F`) | Linen (`#EDEAE3`) | 19.3 : 1 | AAA |
| Ink | Stone | 16.4 : 1 | AAA |
| Slate (`#4B4844`) | Linen | 6.9 : 1 | AA (Large only — don't use under 18px) |
| Sage (`#0F6E56`) | Linen | 6.3 : 1 | AA |
| Sage | Stone | 5.6 : 1 | AA (Large only) |
| Rust (`#B85C2A`) | Linen | 4.2 : 1 | AA (Large only) |

**Hard rules:** never put Slate on Stone. Never put Sage on Stone for body text.

---

## 3. Typography

Three fonts, three roles. They do not substitute for each other.

### Playfair Display — Display
Use for: h1, h2, hero numbers, KPI values, slide-titles-in-UI.
Weights: 700 (Bold), 900 (Black). Italics enabled.
Letter-spacing: `-0.03em` (tight).
Line-height: 1.05–1.2.

The signature Slate move is a two-line head where the second clause is
italicised. Implement with `<em>`:

```html
<h1>The Cornerstone of <em>National Food Security.</em></h1>
```

### Inter — Body
Use for: body, subheads (smaller than h2), buttons, navigation, forms.
Weights: 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold).
Sweet spot: 14–18px. Line-height: 1.55.

### IBM Plex Mono — Metadata
Use for: status chips, version numbers, page chips, KPI unit labels,
timestamps, breadcrumbs, the bottom-of-page metric row.

When used as a chip: `text-transform: uppercase`, `letter-spacing: 0.12em`.
Sizes: 10–14px (never larger).

### Web font loading

Add to your `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

For offline / sovereign deployments where Google Fonts is unavailable, ship
the TTFs from `A20Core/IBM_Plex_Mono/` and download Playfair + Inter from
Google Fonts and self-host. Wire them up with `@font-face` declarations
inside `GlobalStyles`.

---

## 4. Layout

- 12-column grid, 24px gutter (`theme.space['6']`).
- Container max width: 1440px (`theme.layout.containerMax`).
- Page padding: 40px (lg+), 16px (mobile).
- Every major page section gets a 2px Sage top rule (`theme.brandRule.sage`
  or the `<BrandRule />` component).
- Whitespace is structural. A spacious feel is intentional, not unfinished.

### The Slate page anatomy

```
┌──────────────────────────────────────────────────┐
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │  2px Sage brand rule
│ A20CORE  ·  YIELD AI  ·  V0.8.1                  │  MetricRow header (mono)
│                                                  │
│ The Cornerstone of                               │  Playfair displayLg
│ National Food Security.                          │  (with italic emphasis)
│                                                  │
│ A sovereign-grade agentic AI platform...         │  Inter italic body
│                                                  │
│ [KPI] [KPI] [KPI]                                │  KPICards in a grid
│                                                  │
│ V0.8.1 LIVE · 4 FARMS · 5,047,318 KG TRACKED     │  Footer MetricRow
└──────────────────────────────────────────────────┘
```

---

## 5. Components — anatomy

All canonical examples live at `src/components/`. The patterns:

### Button
- **Primary** = Sage fill, Linen text. The default CTA.
- **Ghost** = transparent, Ink text, Stone border. Secondary action.
- **Subtle** = Stone fill, Ink text. Tertiary / inline action.
- **Ask** = Rust fill. See §2a — use once per destination, on pricing only.
- **Danger** = Brick-red fill. Destructive only.
- Sizes `sm` (32px), `md` (40px, default), `lg` (48px).
- Radius `radii.md` (4px) — never pill except for `MetricChip`.

### Card
- **Bordered** (default) = 1px Stone border, Linen-soft background.
- **Raised** = subtle shadow, no border. Interactive cards only.
- **Accent** = 2px Sage top rule on a bordered card. Use for key dashboards.
- **Plain** = padded background, no border or shadow. Inside section grids.

### KPICard
The signature Slate KPI: mono label (Slate), massive Playfair number (Ink),
optional delta chip (Sage if up, Danger if down, Slate if flat). Numbers use
`font-variant-numeric: tabular-nums` so updates don't jitter.

### MetricChip / MetricRow
The mono ALL-CAPS pills used in headers, footers, breadcrumbs. Separate them
with a middle-dot (`·`) — `MetricRow` handles this automatically.

### BrandRule
The 2px Sage horizontal line. Anchors the top of every major section. Rust
variant exists but is reserved for the same contexts as the Rust button.

### SplitHero
The editorial cover layout: left text panel, right photo panel. The
canonical landing pattern.

---

## 6. Recharts theming

```tsx
import { rechartsTheme, chartPalette } from '@/theme'

<LineChart data={data}>
  <CartesianGrid {...rechartsTheme.grid} />
  <XAxis dataKey="day" {...rechartsTheme.axis} />
  <YAxis {...rechartsTheme.axis} />
  <Tooltip {...rechartsTheme.tooltip} />
  <Legend {...rechartsTheme.legend} />
  <Line dataKey="yield" stroke={chartPalette[0]} strokeWidth={2} dot={false} />
</LineChart>
```

Hard rules:
- No hard-coded series colors. Always `chartPalette[i]`.
- Vertical grid is hidden by default (Slate editorial).
- No 3D, no gradients, no chart shadows.
- Tabular numerals on axis ticks.

---

## 7. MapLibre theming

```tsx
import { slateMapStyle, mapLayerStyles } from '@/theme'

<Map mapStyle={slateMapStyle()} ...>
  <Source id="parcels" type="geojson" data={parcels}>
    <Layer id="parcels-fill" type="fill" paint={mapLayerStyles.parcelFill} />
  </Source>
</Map>
```

The `slateMapStyle()` helper desaturates OSM tiles and overlays them with
Linen so the map matches the page. Never ship a raw Mapbox / OSM style.

---

## 8. Forms

- Input: 40px tall, Stone-soft fill, Stone-deep border. On focus, the border
  becomes Sage and the input shows `shadows.focus` (Sage ring).
- Label: above the input, Slate, body sm, semibold. No floating labels.
- Validation: Zod schemas adjacent to the form. Error text in
  `colors.status.danger`, body sm, italic, below the input.
- Helper text: Slate, body sm, regular, below the label.

---

## 9. Motion

- Default duration: 200ms (`motion.duration.base`).
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (`motion.easing.standard`).
- Hover transitions: background color, border color, transform.
- No springy bounces. No "playful" rebounds.
- Respect `prefers-reduced-motion`. `GlobalStyles` handles this — don't
  override.

---

## 10. Accessibility

- Color contrast: §2 table. Ink/Linen is the default text combo; never
  drop below AA Large for any text.
- Focus: every interactive element shows `shadows.focus` (Sage ring).
  Don't disable focus outlines — replace them.
- Touch targets: ≥40px on mobile.
- ARIA: use semantic HTML first; reach for `role`/`aria-*` only when HTML
  can't describe the affordance.
- Keyboard navigation: tab order must be logical. Test with keyboard before
  shipping.

---

## 11. Anti-patterns

Do not introduce any of the following. If you see them in existing code,
refactor them out:

- Glassmorphism, neumorphism, frosted overlays.
- Gradient text or backgrounds.
- Drop shadows above `shadows.lg`.
- Border radii above 12px (except `MetricChip` pill).
- Emoji as UI elements (use a proper icon library instead).
- Full-bleed photography (Slate uses photos as small punctuation, not full
  backgrounds).
- Animated loaders that "breathe" — use a simple Sage spinner.
- Dark-mode-by-default. Slate is light-first; dark is opt-in for
  ops/night surfaces.
- Material UI, shadcn/ui, Chakra, Mantine, Ant Design — the look fights back.

---

## 12. File structure

```
src/
├── theme/
│   ├── tokens.ts         ← raw tokens (palette, type, space, etc.)
│   ├── theme.ts          ← styled-components DefaultTheme assembly
│   ├── styled.d.ts       ← TS module augmentation (auto-loaded)
│   ├── globalStyles.ts   ← createGlobalStyle (reset + fonts + base type)
│   ├── recharts.ts       ← Recharts theming helpers
│   ├── maplibre.ts       ← MapLibre style helpers
│   └── index.ts          ← barrel
├── components/
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── KPICard.tsx
│   ├── MetricChip.tsx
│   ├── BrandRule.tsx
│   ├── SplitHero.tsx
│   └── index.ts
└── ...

AGENTS.md                 ← agent-readable rules (this file's short twin)
```

---

## 13. Bootstrapping a new app

```tsx
// src/main.tsx
import { ThemeProvider } from 'styled-components'
import { theme, GlobalStyles } from '@/theme'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <GlobalStyles />
    <App />
  </ThemeProvider>
)
```

Make sure `src/theme/styled.d.ts` is included by your `tsconfig.json` (it
will be if `"include": ["src"]` is set, which the Vite template does
by default).

---

## 14. When something isn't covered

Default to **less**. Smaller type. Less color. More whitespace.

The look you are aiming for is the cover of a McKinsey report.
The look you are avoiding is the marketing page of a SaaS startup.

If you're unsure, go re-read [`AGENTS.md`](./AGENTS.md) §1 and §15.

---

*Document v1.0 — 2026-05-21. Derived from `For Investors/A20Core_Brand_Kit_Slate.md`.*
