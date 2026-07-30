# A20Core Rebrand — Implementation Contract

> **Source of truth:** `Brand_Engineering/Brand/A20Core_BRAND.md` ("A New Renaissance", v1.3).
> This file is the *engineering* translation of that contract for `frontend/`.
> Token names below are frozen — every sweep agent codes against them.
> Created 2026-07-30 for the rebrand epic.

---

## 1. What changes

| Layer | From | To |
|---|---|---|
| Type | Inter / JetBrains Mono | **Hanken Grotesk** (UI+body), **Space Mono** (metadata/data), **Fraunces** (editorial accent only) |
| Light ground | `#ffffff` / `#f5f5f5` | **Fresco Cream** `#F1E6CC` + **Cream Hi** `#FAF3E2` |
| Dark ground | `#121212` / `#1e1e1e` | **Cosmos Ink** `#0E1330` |
| Primary | Material blue `#2196f3` | **Lapis** `#20419A` |
| Secondary | Purple `#9c27b0` | **Renaissance Gold** `#C29A33` |
| Success | `#10B981` | **Emerald** `#1B8A5A` |
| Error | `#EF4444` | **Terracotta** `#C15A2C` |
| Warning | `#F59E0B` | **Gold** `#C29A33` |
| Info | `#3B82F6` | **Lapis** `#20419A` |
| Logo | `a64logo_dark.png` | `Logo/lockup/*` + `Logo/mark_*.svg` |
| Name | "A64 Core (Platform)" | **"A20Core"** (user-visible strings only) |

### Deliberate palette decisions (read before questioning a mapping)

- **The brand supplies three chromatic voices (lapis, emerald, terracotta) and one
  signature (gold) for four semantic states.** We map success→emerald,
  error→terracotta, warning→gold, info→lapis. No hues are invented. Terracotta is
  a warm red-orange, not a fire-engine red — destructive actions therefore use
  `error[600]`/`[700]` (deepened) rather than `error[500]`, so "Delete" still
  carries weight. This is the brand's warmth/no-fear posture, applied on purpose.
- **`primary` and `info` are both Lapis**, exactly as the old theme had `primary`
  and `info` both blue. Not a bug.
- **`secondary` is Gold and Gold is "rare and meaningful" (§1.4).** Do not use
  `secondary`/gold for ordinary buttons, links, or row accents. It is for: the
  active nav item, one primary CTA per view, and genuine highlight badges.
  Ordinary interactive colour is `primary` (lapis).
- **Coral `#E8654A` and Teal `#1FA39C` are art-only (§3).** They must not appear in UI code.
- **Fraunces is editorial-only (§4).** Never on body, labels, table text or controls.

---

## 2. Frozen token surface (`frontend/shared/src/theme/theme.ts`)

The existing token *shape* is preserved so all ~7,000 existing `theme.colors.*`
references keep working. Additions are marked **NEW**.

```
colors.primary[50…900]     Lapis ramp        (was blue)
colors.secondary[50…900]   Gold ramp         (was purple; was NOT a full ramp — now is)
colors.neutral[50…900]     Warm cream→ink ramp (was cool grays)
colors.success             #1B8A5A           emerald[500]
colors.warning             #C29A33           gold[500]
colors.error               #C15A2C           terracotta[500]
colors.info                #20419A           lapis[500]
colors.successBg / warningBg / errorBg / infoBg   tinted grounds
colors.canvas          NEW  page ground — Fresco Cream (light) / Cosmos Ink (dark)
colors.background           raised panel/card ground — Cream Hi / raised cosmos
colors.surface              recessed ground — Cream / deeper cosmos
colors.textPrimary          Ink #1B1A14 (light) / Cream #F1E6CC (dark)
colors.textSecondary        Slate #5C564A (light) / warm muted (dark)
colors.textDisabled
colors.onAccent        NEW  text/icon colour on primary/secondary/error fills — #FAF3E2 (never pure white)
colors.border          NEW  hairline — neutral[300]
colors.emerald / terracotta / lapis / gold   NEW  full ramps, for non-semantic categorical use

typography.fontFamily.primary   "Hanken Grotesk", …
typography.fontFamily.mono      "Space Mono", …
typography.fontFamily.display   NEW  "Fraunces", … (editorial accent ONLY)
```

`spacing`, `borderRadius`, `breakpoints`, `zIndex`, `shadows`, `fontSize`,
`fontWeight`, `lineHeight` keep their current keys and values. Shadows get warmer
(brown-tinted rather than pure black) but keys are unchanged.

### Ramps

**Lapis (`primary`)** — 50 `#EDF1FB` · 100 `#D6DFF5` · 200 `#AEC0EB` · 300 `#7E9BDC` ·
400 `#4E72C4` · **500 `#20419A`** · 600 `#1B3785` · 700 `#162C6B` · 800 `#112252` · 900 `#0C1839`

**Gold (`secondary`)** — 50 `#FBF4E2` · 100 `#F5E7BF` · 200 `#EBD494` · 300 `#DCB94F` (gold-hi) ·
400 `#CFA83F` · **500 `#C29A33`** · 600 `#A6822A` · 700 `#856820` · 800 `#634D18` · 900 `#42330F`

**Emerald** — 50 `#E8F5EE` · 100 `#C7E7D6` · 200 `#92CFAF` · 300 `#5AB486` · 400 `#2F9C68` ·
**500 `#1B8A5A`** · 600 `#16744B` · 700 `#125C3C` · 800 `#0D452D` · 900 `#092E1E`

**Terracotta** — 50 `#FBF0EA` · 100 `#F5DACB` · 200 `#E9B296` · 300 `#D98A63` · 400 `#CD6D3E` ·
**500 `#C15A2C`** · 600 `#A44A24` · 700 `#833A1C` · 800 `#622C15` · 900 `#411D0E`

**Neutral, light theme** — 50 `#FAF3E2` · 100 `#F1E6CC` · 200 `#E6D9BC` · 300 `#D4C6A6` ·
400 `#B3A98F` · 500 `#8C8471` · 600 `#6E6858` · 700 `#5C564A` (slate) · 800 `#3A362C` · 900 `#1B1A14` (ink)

**Neutral, dark theme** (inverted, as today) — 50 `#0E1330` · 100 `#161C42` · 200 `#1E2650` ·
300 `#2A3363` · 400 `#3D4776` · 500 `#7C7A86` · 600 `#9A9689` · 700 `#BDB49C` · 800 `#DCD2B8` · 900 `#F1E6CC`

### Ground tokens

| Token | Light | Dark |
|---|---|---|
| `canvas` (page body) | `#F1E6CC` Fresco Cream | `#0E1330` Cosmos Ink |
| `background` (cards/panels) | `#FAF3E2` Cream Hi | `#161C42` |
| `surface` (recessed/subhead) | `#EDE0C2` | `#1E2650` |
| `textPrimary` | `#1B1A14` Ink | `#F1E6CC` Cream |
| `textSecondary` | `#5C564A` Slate | `#A8A08C` |
| `textDisabled` | `#8C8471` | `#6E6A5C` |
| `border` | `#D4C6A6` | `#2A3363` |
| `successBg` / `warningBg` / `errorBg` / `infoBg` | `#E8F5EE` / `#FBF4E2` / `#FBF0EA` / `#EDF1FB` | `#0D452D` / `#634D18` / `#622C15` / `#112252` |

> `GlobalStyles` must set `body { background: colors.canvas }` (today it uses
> `colors.background`). This is what makes Fresco Cream the dominant ~65% surface
> per §3 of the brand contract, with panels raised in Cream Hi above it.

---

## 3. Hex → token migration table (for the sweep)

Every hardcoded colour in `frontend/user-portal/src` maps through this table.
**Left column is what to search for; right column is what to write.**
All replacements use the styled-components theme callback, e.g.
`color: ${({ theme }) => theme.colors.primary[500]};`

### Blues → `primary` (Lapis)
| Old | New |
|---|---|
| `#eff6ff` `#e3f2fd` `#e0f2fe` `#f0f9ff` | `primary[50]` |
| `#dbeafe` `#bbdefb` `#bfdbfe` `#e0e7ff` | `primary[100]` |
| `#90caf9` | `primary[200]` |
| `#60a5fa` `#4a90d9` `#64b5f6` | `primary[300]` |
| `#42a5f5` | `primary[400]` |
| `#3b82f6` `#2196f3` | `primary[500]` |
| `#2563eb` `#1976d2` `#3a7bc8` `#1e88e5` | `primary[600]` |
| `#1d4ed8` `#1565c0` `#0369a1` | `primary[700]` |
| `#1e40af` `#0d47a1` | `primary[800]` |

### Greens → `success` / `emerald`
| Old | New |
|---|---|
| `#ecfdf5` `#f0fdf4` | `successBg` (or `emerald[50]`) |
| `#d1fae5` `#dcfce7` | `emerald[100]` |
| `#6ee7b7` | `emerald[200]` |
| `#34d399` | `emerald[300]` |
| `#10b981` `#22c55e` `#4caf50` `#8bc34a` `#84cc16` | `success` (= `emerald[500]`) |
| `#059669` `#16a34a` `#2e7d32` `#047857` `#388e3c` | `emerald[600]` |
| `#15803d` `#065f46` | `emerald[700]` |
| `#166534` | `emerald[800]` |

### Reds → `error` / `terracotta`
| Old | New |
|---|---|
| `#fef2f2` `#fff5f5` | `errorBg` (= `terracotta[50]`) |
| `#fee2e2` | `terracotta[100]` |
| `#fecaca` | `terracotta[200]` |
| `#fca5a5` | `terracotta[300]` |
| `#ef4444` `#f44336` `#ef5350` | `error` (= `terracotta[500]`) |
| `#dc2626` `#c62828` | `terracotta[600]` ← **destructive button fills use this, not `error`** |
| `#b91c1c` | `terracotta[700]` |
| `#991b1b` | `terracotta[800]` |
| `#7f1d1d` | `terracotta[900]` |

### Ambers / oranges → `warning` / `gold`, deep oranges → `terracotta`
| Old | New |
|---|---|
| `#fffbeb` `#fef9c3` | `gold[50]` |
| `#fef3c7` | `warningBg` (= `gold[100]`) |
| `#fde68a` | `gold[200]` |
| `#fcd34d` | `gold[300]` |
| `#f59e0b` `#eab308` `#ff9800` | `warning` (= `gold[500]`) |
| `#f97316` | `terracotta[400]` — this is orange, not amber |
| `#d97706` `#ca8a04` | `gold[600]` |
| `#c2410c` `#e65100` | `terracotta[600]` |
| `#b45309` `#854d0e` | `gold[700]` |
| `#92400e` | `gold[800]` |

### Purples → judgement call
Purple carried a *categorical* meaning (AI / special / premium badges).
- If the purple distinguishes a category from an adjacent blue element → `secondary` (gold) ramp.
- If it is decorative only → `primary[700]`.

| Old | Default |
|---|---|
| `#f3e8ff` `#ede9fe` | `secondary[50]` |
| `#a855f7` `#8b5cf6` | `secondary[500]` |
| `#7c3aed` `#6366f1` `#4f46e5` | `secondary[600]` |
| `#5b21b6` `#6b21a8` `#3730a3` | `secondary[700]` |

### Teal / cyan (art-only in brand — must leave the UI)
`#06b6d4` `#14b8a6` → `primary[400]` (or `emerald[400]` if it reads as a success/growth metric).

### Grays → `neutral` / text tokens
| Old | New |
|---|---|
| `#fff` `#ffffff` (as a *surface*) | `colors.background` |
| `#fff` `#ffffff` (as text/icon **on a coloured fill**) | `colors.onAccent` |
| `#f9fafb` `#fafafa` `#f5f5f5` `#f3f4f6` `#f0f0f0` `#eeeeee` | `neutral[100]` / `surface` |
| `#e5e7eb` `#e0e0e0` `#d1d5db` `#d4d4d4` | `colors.border` (= `neutral[300]`) |
| `#bdbdbd` | `neutral[400]` |
| `#9ca3af` `#9e9e9e` `#888` | `textDisabled` (= `neutral[500]`) |
| `#6b7280` `#757575` `#6c757d` `#666` | `textSecondary` |
| `#616161` `#4b5563` | `neutral[700]` |
| `#374151` `#424242` `#333` | `neutral[800]` |
| `#1f2937` `#111827` `#212121` | `textPrimary` (= `neutral[900]`) |
| `#1a1a2e` `#121212` `#1e1e1e` | `colors.canvas` / cosmos |

### Rules for the sweep
1. **Semantics beat hue.** If a `#3b82f6` is the "info" state of a status badge, it
   becomes `info`/`infoBg`, not `primary[500]`. Read the surrounding code.
2. **Status-colour maps** (the `switch (status)` / `Record<Status, string>` helpers
   scattered across sales/purchasing/finance) are the highest-value targets — fix
   the map once and every consumer follows.
3. **Never leave a raw hex behind.** If no token fits, add one to `theme.ts` rather
   than hardcoding — and say so in your report.
4. `rgba(...)` overlays: convert to `${theme.colors.x}` + opacity suffix
   (`${theme.colors.error}14`) where the codebase already uses that idiom, else
   keep the alpha but retint off the brand hue.
5. Dark mode must be checked: a hardcoded light-gray background that becomes
   `neutral[100]` now flips correctly in dark mode. That is the point.

---

## 4. Typography

```
fontFamily.primary  '"Hanken Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif'
fontFamily.mono     '"Space Mono", ui-monospace, "Courier New", monospace'
fontFamily.display  '"Fraunces", Georgia, serif'   // editorial accent ONLY
```

- Self-hosted, **not** the Google CDN — the brand contract's sovereign-build rule
  (§4/§9.3: pick one, never both), and this app ships behind a restrictive CSP with
  no external font hosts allowed. Fonts are vendored from `Brand_Engineering/Brand/fonts/`.
- Space Mono replaces JetBrains Mono for: doc IDs, codes, timestamps, quantities,
  currency figures, table numerics. Wide tracking, often uppercase for labels.
- Fraunces appears on the login/auth screens' tagline and nowhere else for now.
- Only the Latin + Space Mono faces are needed today. Cairo/Amiri (Arabic, §9) are
  **not** wired up — the app has no RTL mode yet. Do not add them.

---

## 5. Logo & icons

Assets in `Brand_Engineering/Brand/Logo/`:

| Use | File |
|---|---|
| Sidebar expanded, login, register, MFA, division selector | `lockup/lockup_transparent.svg` (adapts to both themes) |
| Sidebar collapsed / small chrome | `mark_mono.svg` (uses `currentColor`) |
| Favicon | `icons/favicon-16.png`, `-32`, `-48` |
| Apple touch | `icons/apple-touch-180.png` |
| PWA / manifest | `icons/icon-192.png`, `icon-512.png` |

Rules (§2): min lockup width **120px** — below that use the emblem alone; clear
space ≥ the emblem's inner-ring diameter; never stretch, rotate, recolour or add
effects. Delete `public/a64logo_dark.png` and `public/a64logo_white.png` and
`public/vite.svg` once nothing references them.

---

## 6. Naming

Replace user-visible "A64 Core Platform" / "A64 Core" / "A64" with **"A20Core"**
(one word, capital A, capital C). In scope: page `<title>`, logo `alt` text,
auth-screen headings, the MFA backup-codes header, empty-state and error copy,
any hardcoded product name in a toast or modal.

**Out of scope — do not touch:** backend Python, MongoDB data, `package.json`
names, the `@a64core/shared` package specifier, import paths, env vars, domains,
docker service names, test fixtures asserting API payloads.

Tagline where a tagline slot exists: *Order, born from many.*

---

## 7. Sequencing

1. **Foundation** (blocking) — `theme.ts`, `GlobalStyles.tsx`, font vendoring,
   `index.html`, `index.css`, `App.css`, logo assets, naming.
2. **Sweep** (parallel shards, after 1) — the 239 files with hardcoded colour.
3. **Verification** — `npx tsc -b`, then a human pass in the browser.

Do not regenerate CodeMaps for this work: it is a restyle, not a structural
change (no new/removed endpoints, services, components or collections).
