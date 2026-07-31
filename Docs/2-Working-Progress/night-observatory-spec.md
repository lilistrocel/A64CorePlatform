# Night Observatory — Implementation Contract

> **Design source:** `Brand_Engineering/Brand/A20Core_NightObservatory_Glass.html` (visual ground truth)
> and the redesign brief supplied 2026-07-30. Brand contract underneath:
> `Brand_Engineering/Brand/A20Core_BRAND.md`.
> **Predecessor:** `a20core-rebrand-spec.md` (the cream tokenization, commit `229324a`).
> Token names below are frozen — every agent codes against them.
> Backlog: **T-901**.

---

## 0. What this is, and what it is not

A **visual reskin**. Application logic, routes, data fetching, component behaviour,
props and state stay exactly as they are. If a change would alter what the app
*does*, it is out of scope — flag it instead.

The predecessor pass routed every colour in the app through `theme.colors.*`
(≈3,190 literals eliminated). That is why this is tractable: most screens
re-theme from the token layer alone. What each agent adds on top is the **glass
treatment**, the **phase colour system**, **Space Mono metadata**, and **icon
replacement**.

### Decisions already taken (do not revisit)
- **Dark is the only mode.** `lightTheme` stays in `theme.ts` as dead code for a
  possible future light variant; the toggle is hidden and the store forced to dark.
  Do not delete `lightTheme`, and do not wire any new UI to it.
- Fonts stay **self-hosted** from `public/fonts/` (CSP blocks external font hosts).
  Do not add the Google Fonts `<link>` from the brief — the faces are already local.
  Fraunces **italic** is required; confirm the italic variable face is loaded.
- Icons come from **`lucide-react`**, already used in 39 files. It is currently
  resolving via hoisting from `frontend/shared`; it gets declared explicitly in
  `frontend/user-portal/package.json` as part of Phase 1.

---

## 1. Token surface (frozen)

All of this lives in `frontend/shared/src/theme/theme.ts` on the **`darkTheme`**
object. Existing key names are preserved so the ~7,000 existing `theme.colors.*`
references re-theme for free. New groups are additive.

### 1.1 Existing keys — remapped values

| Token | Night Observatory value | Note |
|---|---|---|
| `canvas` | `#0A0E24` cosmos-deep | page floor, under the sky layer |
| `background` | `#171D40` cosmos-hi | **opaque** raised surface — menus, tooltips, dropdowns, popovers |
| `surface` | `rgba(23,29,64,.42)` glass | translucent panel ground |
| `textPrimary` | `#FAF3E2` cream-hi | headings, key values |
| `textSecondary` | `#B4C8DC` celeste | secondary text, cool accent |
| `textDisabled` | `#8B90AC` muted | tertiary, placeholders, inactive nav |
| `border` | `rgba(180,200,220,.14)` line | hairlines and dividers |
| `onAccent` | `#0E1330` cosmos | **changed meaning** — text on a *gold* fill is now dark |
| `success` | `#54D39B` emerald-b | |
| `warning` | `#E8C86A` gold-b | |
| `error` | `#F08A70` coral-b | the only "red"; never solid red |
| `info` | `#6B8AE0` lapis-b | |
| `successBg`/`warningBg`/`errorBg`/`infoBg` | phase colour at 16% over transparent | see §4 badge pattern |
| `primary[50..900]` | lapis ramp re-centred on `#6B8AE0` at 500 | brightened for dark ground |
| `secondary[50..900]` | gold ramp, 500 = `#DCB94F` gold-hi | **gold is rare — see §3** |
| `neutral[50..900]` | cosmos→cream scale, 50 darkest | 50 `#0A0E24` · 100 `#0E1330` · 200 `#171D40` · 300 `#252D58` · 400 `#3A4066` · 500 `#5A5F7D` · 600 `#7E86A6` · 700 `#8B90AC` · 800 `#B4C8DC` · 900 `#FAF3E2` |

`onAccent` flipping from cream to cosmos is the one **breaking semantic change**.
It is correct — the primary button is a gold gradient and needs dark text. Any
call site using `onAccent` on a *lapis* or *coral* fill needs `cream-hi` instead;
use the new `colors.onDark` for that.

### 1.2 New keys

```
colors.celeste        #B4C8DC
colors.muted          #8B90AC
colors.line           rgba(180,200,220,.14)
colors.onDark         #FAF3E2   // text on lapis/coral/emerald fills
colors.cosmos         #0E1330
colors.cosmosDeep     #0A0E24
colors.cosmosHi       #171D40

colors.glass.base     rgba(23,29,64,.42)
colors.glass.hi       rgba(37,45,88,.5)
colors.glass.border   rgba(180,200,220,.18)
colors.glass.shine    rgba(250,243,226,.07)
colors.glass.opaque   rgba(23,29,64,.85)   // backdrop-filter fallback

colors.bright.lapis    #6B8AE0
colors.bright.emerald  #54D39B
colors.bright.gold     #E8C86A
colors.bright.terra    #E8935F
colors.bright.laurel   #C9CBA4
colors.bright.lavender #C3A0CF
colors.bright.verdi    #57C4BC
colors.bright.coral    #F08A70
colors.bright.rose     #EDD1BE

colors.phase.<key>    // §5 — the semantic status system
```

### 1.3 Typography

```
typography.fontFamily.primary  "Hanken Grotesk", system-ui, sans-serif
typography.fontFamily.mono     "Space Mono", monospace
typography.fontFamily.display  "Fraunces", serif      // ITALIC ONLY, editorial only
```

---

## 2. Mixins (`frontend/shared/src/theme/mixins.ts`, new file)

Do **not** hand-roll the glass recipe per component. Import these.

```ts
glassPanel            // the §5 recipe: gradient + border + blur(18px) + 3-layer shadow
glassPanelHover       // lift -4px, gold rim, gold glow — for INTERACTIVE panels only
glassControl          // small-radius (11px) variant for inputs/selects/pills
glassOpaque           // cosmos-hi, no blur — menus, tooltips, dropdowns
monoLabel             // Space Mono, .10–.16em tracking, uppercase, .58–.72rem
goldThread            // the 2px top gradient thread for stat tiles
phaseBadge(phaseKey)  // §4 badge pattern from the phase map
sheen                 // optional rotated diagonal highlight for hero cards
```

Rules baked into the mixins, not restated per file:
- `backdrop-filter` **and** `-webkit-backdrop-filter` together, always.
- `@supports not (backdrop-filter: blur(1px))` fallback to `colors.glass.opaque`.
- `@media (prefers-reduced-motion: reduce)` disables lift and glow transitions.

**Never stack more than two glass layers over the sky.** A glass modal containing
glass cards is the limit; a glass card inside a glass panel inside a glass modal
turns to mud. When nesting deeper, the inner surface uses `glassOpaque` or a
plain `line` border with no fill.

---

## 3. Gold discipline (hard limit)

Gold appears **only** on: the logo emblem and its glow · the active nav item ·
primary stat numerals · the single gold thread on stat tiles · the primary
FAB/CTA · focus rings · the short gold underline on section headers · the
**Harvesting** phase.

**Nothing else.** Target ≤4 gold elements visible per viewport. Secondary
emphasis is `celeste`, never gold. In particular: gold is **not** a status
colour (except Harvesting), **not** a link colour, **not** a chart series
default, and **not** an ordinary button.

If you are about to make something gold and it is not on that list, use
`celeste` (emphasis) or the appropriate phase colour (status).

---

## 4. Component patterns

**Badge / pill** — radius 99px, Space Mono uppercase, 6–7px glowing dot + label.
Text = phase colour, background = phase at 16%, border = phase at 45%, dot
`box-shadow: 0 0 8px`. Never dark text on a phase-tinted transparent background.
The label text always carries the meaning — colour alone is never the signal.

**Buttons** — Primary: `linear-gradient(145deg, gold-hi, gold)` + `onAccent`
(cosmos) text, 700. Secondary: glass + `glass.border` + cream text. Ghost:
transparent, celeste text/border. Destructive: **coral-b tinted glass, never
solid red**. Radius 10–12px, hover lift 1–2px.

**Inputs/selects/textareas** — `glassControl`, 11px radius, cream-hi text, muted
placeholder, Space Mono uppercase micro-label above. Focus:
`border-color: gold-hi; box-shadow: 0 0 0 3px rgba(220,185,79,.15)`.
Toggles: glass track, active emerald-b. Checkbox/radio: celeste border, gold-hi checked.

**Tables** — no solid chrome. Transparent rows on the page, Space Mono uppercase
celeste column headers, `line` row dividers, hover `rgba(180,200,220,.05)`.
Numeric and code cells in Space Mono. Status cells use phase badges. A dense
table may sit inside **one** glass panel (see the two-layer rule).

**Modals/drawers** — `glassPanel` at blur 24px over a `rgba(10,14,36,.6)` scrim,
20px radius. The existing scrims are currently `rgba(0,0,0,.45)`; retint them.
Modals still close only via the X button, never on backdrop click — existing
behaviour, do not change it.

**Toasts** — small glass chips bottom-right with a phase-coloured edge bar:
emerald-b success, coral-b error, gold-b warning, celeste info.

**Charts** — series order: `celeste`, `bright.gold`, `bright.emerald`,
`bright.lapis`, `bright.terra`, `bright.lavender`. Gridlines `line`, axis labels
Space Mono `muted`, tooltips `glassOpaque`. Area fills = series colour ≤15%.
No 3D, no rainbow defaults.

**Empty states** — Fraunces *italic* celeste headline, one `muted` sentence, one
primary button. No emoji, no stock illustration.

**Page header** — Space Mono gold breadcrumb with a 20px leading dash
(`— OPERATIONS · LIVE`), then H1 1.9rem/800 cream-hi with `letter-spacing:-.01em`
(last word may be Fraunces italic celeste), then a one-line muted description.
Right side: glass stat tiles, min-width 118px, gold thread on top, 1.7rem/800
gold numeral with `text-shadow: 0 0 22px rgba(220,185,79,.4)`, Space Mono celeste
label. A stat that is semantically "alive/growing" may use `bright.emerald`.

**Sidebar** — 248px, `rgba(14,19,48,.55)` + blur 22px, `border-right: 1px solid line`.
Nav links muted 600; hover cream-hi on `rgba(180,200,220,.07)`; active gold-hi on
a gold-tinted gradient with gold border and a 3px glowing gold bar on the edge.
Section labels in Space Mono.

**Progress/distribution bars** — 10px, radius 99px, track `rgba(10,14,36,.6)`
with a `line` border, segments in phase colours, soft glow on the lit segment.

---

## 5. Phase / status colour map

`colors.phase.*` — the single semantic vocabulary. Same status = same colour in
every context (badge, card edge, filter pill, chart legend, progress segment).

### 5.1 Room phases (from the brief, verbatim)

| Key | Hex | |
|---|---|---|
| `empty` | `#7E86A6` | quiet slate-blue |
| `preparing` | `#B4C8DC` | celeste — dawn sky |
| `inoculated` | `#6B8AE0` | lapis-b |
| `colonizing` | `#C9CBA4` | laurel-b |
| `fruitingInit` | `#E8935F` | terra-b |
| `fruiting` | `#54D39B` | emerald-b |
| `harvesting` | `#E8C86A` | gold-b — the one gold status |
| `resting` | `#C3A0CF` | lavender-b |
| `cleaning` | `#57C4BC` | verdi-b |
| `maintenance` | `#EDD1BE` | rose-b |
| `quarantined` | `#F08A70` | coral-b — the only red; may pulse subtly |
| `decommissioned` | `#5A5F7D` | dim, no glow |

### 5.2 Extrapolated vocabularies

The brief's map covers room phases; the app carries ~8 other status vocabularies.
The brief authorises extrapolation ("extrapolate from the closest rule"). These
are **normative** — do not invent per-module variants, and note that the previous
pass already harmonised each module onto a single map, so there is one place to change.

| Meaning | Phase colour | Applies to |
|---|---|---|
| draft / not started | `empty` `#7E86A6` | all document types |
| pending / awaiting approval | `fruitingInit` `#E8935F` | PR/PO/GR/AP, sales docs, leave |
| open / active / in progress | `inoculated` `#6B8AE0` | orders, shipments, campaigns |
| partially done | `colonizing` `#C9CBA4` | partly delivered/received/closed |
| approved / posted / paid / delivered | `fruiting` `#54D39B` | all |
| closed / settled / completed | `resting` `#C3A0CF` | all |
| rejected / failed / overdue / expired | `quarantined` `#F08A70` | all |
| cancelled / void / archived | `decommissioned` `#5A5F7D` | all |
| maintenance / on hold / suspended | `maintenance` `#EDD1BE` | equipment, employees |
| cleaning / reconciling / syncing | `cleaning` `#57C4BC` | transient system states |

**`harvesting` gold is reserved for the literal harvest phase.** Do not use it
for "pending" or any other generic state — that is the most likely mistake here.

---

## 6. Icons — remove every emoji

**819 emoji occurrences across 126 files.** Every emoji used as an icon or
decoration is replaced with a `lucide-react` line icon: 17px in nav, 13px inline,
`currentColor`, 1.6px stroke where the icon component exposes `strokeWidth`.

Common replacements (extend consistently):
`📊`→`BarChart3` · `🌱`→`Sprout` · `⚠`→`AlertTriangle` · `✕`/`❌`/`✗`→`X` ·
`🌾`→`Wheat` · `📋`→`ClipboardList` · `✓`/`✅`→`Check` · `📦`→`Package` ·
`🏞`→`Mountain` · `🌿`→`Leaf` · `🗑`→`Trash2` · `📅`→`Calendar` · `📥`→`Inbox` ·
`📈`→`TrendingUp` · `💡`→`Lightbulb` · `🏗`→`Construction` · `🍄`→`Sprout` ·
`🔄`→`RefreshCw` · `📍`→`MapPin` · `🚨`→`Siren` · `🔍`→`Search` · `💧`→`Droplet` ·
`☀`→`Sun` · `📱`→`Smartphone` · `🏭`→`Factory` · `🍇`→`Grape` · `✏`→`Pencil`

Emoji inside **user-facing prose, toast copy, or data values** is not an icon —
leave those alone unless they are decorative. Emoji in comments: leave.

---

## 7. The sky

One fixed, non-scrolling layer behind everything, rendered once at the app shell
(not per page). Copy the `.sky` and `.sky::before` rules from the mockup verbatim
(mockup lines 40–64) — including all 15 starfield dots. `position:fixed; inset:0;
z-index:0; pointer-events:none`, with the app shell at `z-index:1`.

Stars do not twinkle. No parallax. If they compete with dense data, dim them —
do not remove them.

---

## 8. Explicit exceptions to "no pure white / no pure black"

`components/farm/FarmMapView.tsx` lines ~503–504 keep
`'text-color': '#ffffff'` and `'text-halo-color': '#000000'`. These are MapLibre
labels drawn on Esri satellite imagery, not app chrome — they must read against a
photograph. Same for the MapLibre attribution control background in
`components/map/MapContainer.tsx`. Leave all three; they are already commented.

---

## 9. Accessibility

- Body text ≥4.5:1 against its **actual** surface (glass over sky, not the token
  in isolation). `muted` is for ≥.75rem secondary text only.
- Gold focus ring on every interactive element; no default blue focus.
- Never dark text on a phase-tinted transparent background.
- Phase is never signalled by colour alone — the badge carries its label.
- Honour `prefers-reduced-motion` (handled in the mixins).
- Scrollbars: thin, `cosmosHi` thumb.

---

## 10. Sequencing

1. **Foundation** (blocking): tokens, mixins, GlobalStyles + sky, forced dark
   mode, `lucide-react` declared, fonts confirmed incl. Fraunces italic.
2. **Shell** (blocking for look): sidebar, page-header pattern, shared primitives
   in `frontend/shared/src/components/` (Button, Card, Input, Breadcrumb, Spinner,
   StatWidget, ChartWidget), toasts, modals.
3. **Screen sweep** (parallel shards): glass treatment, phase map, Space Mono
   metadata, emoji→icons, per module.
4. **Final**: gold audit (≤4 per view), contrast check, reduced-motion check,
   `tsc -b`, and a human pass in the browser.

**Definition of done:** every screen belongs to the mockup; no emoji icons remain;
every colour traces to §1 or §5; app logic untouched.

Do not regenerate CodeMaps — a restyle is not a structural change.
