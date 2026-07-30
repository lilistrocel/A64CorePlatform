# A20Core — Brand Contract · "A New Renaissance"

> **READ FIRST (for AI agents & developers).** This is the single source of truth for the A20Core brand as of **2026-06-09**. Apply it to every new asset, document, slide, UI, and line of copy. The previous **Cornerstone** brand (IBM Plex + Cornerstone Cream/Night Ops + stepped-pyramid mark) and the older **Slate** brand are **RETIRED** — do not use them. When old and new conflict, **new wins**.

---

## 0. How to use this pack

- Treat this file as a brand contract. If your repo auto-reads `AGENTS.md` or `CLAUDE.md`, reference or paste the **Quick rules** below into it.
- All production assets are in this pack (see **§7 Asset manifest**).
- Canonical reference: open `Brand_Book/A20Core_Brand_Book.pdf` (or `.html`).

## 1. Quick rules (the contract)

1. **Brand = A New Renaissance.** Warm, hopeful, humanist, sovereign. Light over gloom.
2. **Type:** Hanken Grotesk (display + body + UI), Space Mono (metadata/labels/data), Fraunces (editorial accent only). **Never IBM Plex.**
3. **Surfaces:** Fresco Cream `#F1E6CC` (primary, light) + Cosmos Ink `#0E1330` (depth/night). Both first-class.
4. **Accent:** Renaissance Gold `#C29A33` / `#DCB94F` — rare and meaningful. Lapis, Emerald, Terracotta are the chromatic voices. Coral/Teal are art-only.
5. **Logo:** use the supplied A20Core lockup/emblem files. The "0" is the world-emblem. Never redraw, recolor off-palette, stretch, rotate, or crowd it.
6. **Tagline:** *Order, born from many.*
7. **Voice:** declarative, warm, specific. No hype, no fear, no "total control" framing.
8. **Imagery:** painterly (Renaissance × retrofuture), hopeful, humanist. No stock photos, no cold 3D, no dystopia.
9. **RETIRE:** Cornerstone, IBM Plex, Cornerstone Cream/Night Ops naming, the stepped-pyramid logo, Slate. Mark any such files deprecated.

## 2. Logo

- **Files:** `Logo/lockup/lockup_{cosmos,cream,transparent}.svg` (text outlined — font-independent) and matching PNGs; emblem-only `Logo/mark_{cosmos,cream,mono}.svg`; icons in `Logo/icons/`.
- **Construction:** emblem · gold vertical divider · wordmark **A20Core** (Hanken Grotesk; "A20" weight 800, "Core" weight 600). The zero is a slightly imperfect Earth holding two crossing gold currents.
- **Modes:** cosmos (dark) and cream (light) lockups provided. `mark_mono.svg` uses `currentColor` for single-color use on any contrasting ground.
- **Clear space:** ≥ the emblem's inner-ring diameter on all sides. **Min lockup width ~120px;** below that use the emblem alone (legible to ~16px).
- **Don't:** stretch/skew, recolor the ring off-palette, rotate, add effects, or place on busy/low-contrast grounds.

## 3. Color tokens

| Token | Hex | Role |
|---|---|---|
| `cream` | `#F1E6CC` | Primary light ground (~65%) |
| `cream-hi` | `#FAF3E2` | Raised light |
| `cosmos` | `#0E1330` | Depth / night ground |
| `ink` | `#1B1A14` | Text on light |
| `slate` | `#5C564A` | Secondary text |
| `gold` / `gold-hi` | `#C29A33` / `#DCB94F` | Signature accent (rare) |
| `lapis` | `#20419A` | Chromatic — wisdom/cosmic |
| `emerald` | `#1B8A5A` | Chromatic — life/growth |
| `terracotta` | `#C15A2C` | Chromatic — earth/humanity |
| `coral` | `#E8654A` | Expressive accent — **art only** |
| `teal` | `#1FA39C` | Expressive accent — **art only** |

```css
:root{
  --cream:#F1E6CC; --cream-hi:#FAF3E2; --cosmos:#0E1330; --ink:#1B1A14; --slate:#5C564A;
  --gold:#C29A33; --gold-hi:#DCB94F; --lapis:#20419A; --emerald:#1B8A5A;
  --terra:#C15A2C; --coral:#E8654A; --teal:#1FA39C;
}
```

## 4. Typography

- **Hanken Grotesk** — display, headlines, body, UI. Weights 400/500/600/700/800. Wordmark uses 800 ("A20") + 600 ("Core").
- **Space Mono** — metadata, labels, timestamps, code, data (400/700, wide tracking, often uppercase).
- **Fraunces** — editorial accent for covers and pull-quotes only (italic for warmth). Not for UI/body.
- **Arabic / RTL:** the Latin stack has no Arabic glyphs. For any Arabic-language asset use the companion set in **§9** — **Cairo** (body/UI), **Amiri** (editorial), Space Mono retained for Latin metadata. **Never IBM Plex Sans Arabic.**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```
All three are free/OFL. **Sovereign / offline builds:** don't hand-roll `@font-face` — link the ready-made self-host pack in **`Brand/fonts/`** (see §7). `Brand/fonts/fonts.css` ships the full Latin stack (Hanken Grotesk, Fraunces) plus Space Mono from vendored, checksum-verified OFL TTFs, restates these role bindings, and renders every glyph with zero external requests — keeping the build inside the data-sovereignty boundary. **Pick one per build — `fonts.css` *or* the Google CDN `<link>` above, never both** (same rule as §9.3).

## 5. Voice

Quiet confidence — a sovereign institution that is also deeply human. Declarative, not hype. Specific numbers, not vague claims. Hopeful, never fearful.

- **Say:** "Coordinates the systems a nation depends on." · "Order emerges; we steward it." · "A future that is beautiful and humane."
- **Avoid:** "Total control of everything." · buzzwords, fear, "Big Brother" framing.

## 6. Imagery & art direction

Painterly — Renaissance fresco meets retrofuture optimism. Humans + intelligence as collaborators; sacred geometry / golden ratio; orbits, constellations, domes, the imperfect Earth. Warm light from within; gold leaf. Palette as above. **Never** cold, sterile, photographic-stock, or dystopian. Hero references: the spirit object, the renaissance hall, the reach-for-the-stars mural.

## 7. Asset manifest (in this pack)

- `A20Core_BRAND.md` — this contract.
- `Brand_Book/A20Core_Brand_Book.pdf` + `.html` — canonical brand book.
- `Logo/lockup/` — full lockups (SVG outlined + PNG), cosmos/cream/transparent.
- `Logo/mark_*.svg` — emblem only (cosmos/cream/mono).
- `Logo/icons/` — favicon 16/32/48, apple-touch-180, icon-192/512, mark-512 variants.
- `Manifesto/A20Core_Manifesto.html` — the founding manifesto.
- `imagery/README.md` — hero-image slots + art-direction rules.
- `fonts/` — self-hosted OFL font pack for sovereign / offline builds. Ships the **full type system**: Hanken Grotesk + Fraunces (§4 Latin) **and** Cairo + Amiri (§9 Arabic), plus Space Mono (shared metadata). Contains `fonts.css` (`@font-face` layer + LTR/RTL role bindings, mirrors §4 + §9.3), `fonts.manifest.json` (pinned upstream sources + SHA-256 checksums), `vendor-fonts.sh` (deterministic, provenance-verified fetch), `ttf/` (vendored binaries), and `licenses/` (OFL 1.1). See `fonts/README.md`. One `fonts.css` covers both directions — link it **or** the CDN, never both (§4, §9.3).

## 8. Retire checklist (do this in the main repo)

- [ ] Replace any Cornerstone/IBM-Plex/Night-Ops references with this system.
- [ ] Swap the stepped-pyramid logo for the A20Core world-emblem lockup.
- [ ] Mark `Brand_Engineering/` (Cornerstone) and any Slate kit **deprecated**; keep only for history.
- [ ] Point `CLAUDE.md` / `AGENTS.md` brand context at this contract.
- [ ] Update decks, letterhead, app UI, and site to Fresco Cream / Cosmos Ink + Hanken/Space Mono/Fraunces.

## 9. Arabic typography & RTL

The Latin stack (§4) carries no Arabic glyphs. This section is the brand standard for **every** Arabic-language A20Core asset — document, slide, UI, or caption. It mirrors the three Latin roles, is OFL-licensed and self-hostable for sovereign/offline builds, and is warm + humanist to match the voice.

**The contract bans IBM Plex (§1), so IBM Plex Sans Arabic is excluded** — it carries the retired Cornerstone association and must not re-enter the system, even though it pairs technically.

### 9.1 Companion typefaces

| Latin role (§4) | Arabic companion | Weights | Use |
|---|---|---|---|
| **Hanken Grotesk** — display, body, UI | **Cairo** *(primary)* | 400 / 500 / 600 / 700 / 800 | All Arabic headlines, body, tables, UI. Humanist, generous x-height; Naskh-influenced clarity at body sizes; full weight parity with Hanken. |
| *(alternate, warmer Gulf voice)* | **Tajawal** | 400 / 500 / 700 / 800 | Acceptable brand-equivalent substitute for Cairo where a softer tone suits the piece. **Do not mix Cairo and Tajawal in one document.** |
| **Space Mono** — metadata, labels, data | Space Mono (Latin runs) **+** Cairo 600 + tracking for Arabic labels | — | Doc IDs, dates, codes, timestamps stay **Latin / LTR in Space Mono**. There is no brand Arabic monospace — do not invent one. Arabic-script labels emulate the mono treatment with weight 600 + `letter-spacing` (Arabic has no uppercase). |
| **Fraunces** — editorial accent | **Amiri** | 400 / 700 (+ italic-equivalent) | Arabic counterpart to Fraunces for **covers, pull-quotes, and the tagline lockup only**. Classical Naskh; not for UI/body. |

**Numerals:** use **Western Arabic numerals (0–9)**, not Eastern Arabic-Indic (٠–٩), in all A20Core Arabic documents — parity with the English mirror, unambiguous legal-article citations (`المادة 30(3)`), and clean ingestion by data/registers.

**Approved Arabic tagline lockup:** `النظام، يولد من الكثرة` — the canonical Arabic rendering of *Order, born from many.* Set in **Amiri** for editorial use, **Cairo 600** for inline/footer use. The wordmark **A20Core stays Latin** — never transliterate it.

### 9.2 RTL layout rules

1. **Direction.** Document root carries `dir="rtl" lang="ar"`.
2. **Alignment.** Body and headings align **right**; lists indent from the right; the right edge is the reading anchor.
3. **Tables.** Column order mirrors — the first logical column sits on the **right**. Inherit `dir="rtl"` from the wrapper; do not set cells LTR.
4. **Bidi isolation.** Latin runs inside Arabic (doc IDs, task codes, email, dates, URLs) must be bidi-isolated to render LTR — wrap in `<bdi>…</bdi>` or `<span dir="ltr">`. Legal-article numbers (`30(3)`) render correctly under the Western-numeral rule; leave inline.
5. **Leading.** Arabic needs more vertical room for diacritics — body **line-height 1.8** (vs ~1.6 Latin); headings 1.3.
6. **Punctuation.** Use the Arabic comma `،` and question mark `؟`.
7. **Logo / emblem.** Use the outlined-SVG lockup (`Logo/lockup/lockup_*.svg`) — font-independent, so unaffected by the Arabic typeface. In RTL place it **top-right**; clear-space and min-width rules unchanged (§2).
8. **Colour & surface.** Unchanged from §3 — Fresco Cream ground, Cosmos Ink / Ink text, Renaissance Gold rare. No RTL-specific palette change.

### 9.3 Render-ready font block

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Amiri:ital,wght@0,400;0,700;1,400&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

```css
[dir="rtl"], [lang="ar"]{
  font-family:"Cairo", system-ui, sans-serif;   /* Arabic body/UI/headings */
  line-height:1.8; text-align:right;
  color:var(--ink); background:var(--cream);
}
[lang="ar"] h1,[lang="ar"] h2,[lang="ar"] h3{ font-weight:700; line-height:1.3; }
[lang="ar"] .tagline,[lang="ar"] blockquote{ font-family:"Amiri", serif; }      /* editorial accent */
[lang="ar"] .meta,[lang="ar"] code,[lang="ar"] time{ font-family:"Space Mono", monospace; }  /* Latin metadata stays LTR */
[lang="ar"] bdi,[lang="ar"] [dir="ltr"]{ unicode-bidi:isolate; }
```

**Sovereign / offline build:** don't hand-roll the `@font-face` layer — the ready-made self-host pack ships in **`Brand/fonts/`** (see §7). Link `Brand/fonts/fonts.css` alone and every glyph renders from vendored OFL TTFs (Cairo, Amiri, Space Mono) with zero external requests, keeping Arabic-document rendering inside the data-sovereignty boundary. `fonts.css` re-states these RTL role bindings, so an Arabic page that links it needs nothing else. The TTFs are fetched and checksum-verified by `Brand/fonts/vendor-fonts.sh` against a pinned `google/fonts` ref. **Pick one per build — `fonts.css` *or* the Google CDN `<link>` above, never both.**

*Source standard: MKT-BRD-Arabic-Typography-RTL-Standard-v1.0 (T-2026-0082), promoted to the contract via T-2026-0100.*

*A New Renaissance · Order, born from many · v1.3 · 2026 (v1.1 adds §9 Arabic typography & RTL; v1.2 manifests the `Brand/fonts/` self-host pack in §7 and points §9.3 at `fonts.css`; v1.3 extends that pack to the full Latin stack — Hanken Grotesk + Fraunces — and syncs §4 + §7 to match, per T-2026-0169 ← T-2026-0143).*
