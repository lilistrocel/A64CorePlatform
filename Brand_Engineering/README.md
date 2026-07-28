# A20Core — Brand Engineering Kit

Drop-in brand kit for AI coding agents and human developers building the
A20Core platform. Codifies the **Slate** visual identity in
machine-consumable form: design tokens, a styled-components theme,
Recharts + MapLibre adapters, canonical component patterns, and an
agent-readable rules contract.

---

## What's inside

```
Brand_Engineering/
├── README.md                           ← this file
├── AGENTS.md                           ← short, agent-readable rules
├── A20Core_Engineering_Brand_Guide.md  ← long-form human guide
└── src/
    ├── theme/
    │   ├── tokens.ts                   raw tokens
    │   ├── theme.ts                    styled-components theme assembly
    │   ├── styled.d.ts                 TS module augmentation
    │   ├── globalStyles.ts             reset + fonts + base typography
    │   ├── recharts.ts                 Recharts theming helpers
    │   ├── maplibre.ts                 MapLibre style + layer styles
    │   └── index.ts                    barrel
    └── components/
        ├── Button.tsx                  variants/sizes/states
        ├── Card.tsx                    bordered / raised / accent / plain
        ├── KPICard.tsx                 the signature Slate KPI
        ├── MetricChip.tsx              mono metadata chips + MetricRow
        ├── BrandRule.tsx               2px Sage anchor
        ├── SplitHero.tsx               editorial cover layout
        └── index.ts
```

---

## How to install in the platform repo

1. Copy `src/theme/` and `src/components/` into your repo's `src/` folder.
2. Copy `AGENTS.md` to the **repo root** (AI coding agents read it on every turn).
3. Copy `A20Core_Engineering_Brand_Guide.md` to `docs/` or `design/`.
4. Add the Google Fonts link from §3 of the brand guide to your `index.html`.
5. Wrap your app root in `<ThemeProvider theme={theme}>` + `<GlobalStyles />`.
6. Confirm TypeScript picks up `styled.d.ts` (it will, if `tsconfig.json`
   includes `src`).

Sample bootstrap:

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client'
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

---

## What's the difference between AGENTS.md and the Engineering Brand Guide?

- **`AGENTS.md`** is short, imperative, and contract-shaped. It tells
  coding agents *what to do and what not to do*, with one canonical example
  per rule. Drops into the repo root so agents auto-read it each turn.
- **`A20Core_Engineering_Brand_Guide.md`** is the long-form reference. Use
  it when you need to understand *why* a rule exists, or when you're making
  a judgement call the short rules don't cover.

When the two disagree, `AGENTS.md` wins.

---

## Stack assumptions

Built for the platform's confirmed stack:

- React 18 + TypeScript + Vite
- **styled-components 6** (transient props use `$` prefix)
- Zustand (state), TanStack Query (server state)
- React Router 6, React Hook Form + Zod
- **Recharts 3** (charts) — `rechartsTheme` adapter included
- **MapLibre GL + react-map-gl + turf** (maps) — `slateMapStyle()` included
- react-grid-layout (dashboards)

If you switch off styled-components later, the tokens in `tokens.ts` are
framework-agnostic — only `theme.ts`, `globalStyles.ts`, and the components
need refactoring.

---

## Source of truth

The Slate identity itself lives at
`For Investors/A20Core_Brand_Kit_Slate.md`. This kit is the engineering
translation. If the design spec ever updates, this kit needs to follow.

Versioning: this kit is **v1.0 — 2026-05-21**.
