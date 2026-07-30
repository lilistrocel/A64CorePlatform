# A20Core fonts — self-hosted, sovereign

> Self-hosted OFL typefaces so the **entire** A20Core type system — Latin
> and Arabic — renders **inside the data-sovereignty boundary**: no Google
> CDN request leaves the perimeter on an offline or sovereign build.
> Realises `A20Core_BRAND.md` §4 (Latin) + §9.3 (Arabic/RTL).
> Tasks **T-2026-0111** (Arabic + metadata) and **T-2026-0143** (Latin stack).

## What's here

| Path | Purpose |
|---|---|
| `fonts.css` | `@font-face` self-host layer + RTL role bindings (mirrors §9.3) |
| `fonts.manifest.json` | Pinned upstream sources + checksums — the source of truth for the vendor script |
| `vendor-fonts.sh` | Deterministic fetch of TTFs + per-font licenses from a pinned `google/fonts` ref |
| `ttf/` | Vendored binaries land here (populated by the script) |
| `licenses/` | OFL 1.1 text + per-font licenses (OFL §2 requires shipping these) |

**Scope:** the full type system —
**Hanken Grotesk** (Latin display/body/UI, §4),
**Fraunces** (Latin editorial accent, §4),
**Cairo** (Arabic body/UI, §9.1),
**Amiri** (Arabic editorial, §9.1), and
**Space Mono** (metadata, shared by both scripts, §4/§9.1).
One `fonts.css` covers LTR and RTL sovereign renders.

## Why a vendoring script instead of committed binaries

Sovereign builds need **reproducibility and provenance**, not "some TTFs
someone dropped in once." `vendor-fonts.sh` fetches from a **pinned commit
SHA** of `google/fonts` and verifies every TTF against a SHA-256 recorded
in the manifest — so the bytes are auditable and identical on every build
host. Commit the populated `ttf/`, `licenses/`, and checksummed manifest
together and the supply chain is closed and verifiable.

## First-time vendor (maintainer, once)

1. Pin the ref: set `upstream.ref` in `fonts.manifest.json` to a specific
   `google/fonts` **commit SHA** (not `main`).
2. Fetch and record checksums:
   ```sh
   bash vendor-fonts.sh --update-checksums
   ```
3. Review `ttf/`, `licenses/`, and the now-populated `sha256` values, then
   commit all three together.

## Build / CI (every build thereafter)

```sh
bash vendor-fonts.sh          # fetch + verify bytes against pinned sha256
bash vendor-fonts.sh --check  # verify already-vendored files, no network
```

`--check` is the offline/air-gapped path: it confirms the committed TTFs
match the manifest without touching the network.

## Using the fonts

**Sovereign / offline build** — link this one file; zero external requests:

```html
<link rel="stylesheet" href="/Brand/fonts/fonts.css">
```

`fonts.css` declares every face *and* re-states the role bindings, so a
page that links it alone renders correctly in either direction:

- **Latin (LTR, §4):** Hanken Grotesk for body/UI/headings, Fraunces for
  `.tagline`/`blockquote`, Space Mono for `.meta`/`code`/`time`.
- **Arabic (RTL, §9.3):** Cairo for body/UI/headings, Amiri for
  `.tagline`/`blockquote`, Space Mono for `.meta`/`code`/`time`. The RTL
  attribute selectors outrank the Latin defaults, so adding
  `dir="rtl" lang="ar"` is all that switches the stack.

Western Arabic numerals, `dir="rtl"`, and `<bdi>` isolation rules are
unchanged — see `A20Core_BRAND.md` §9.2.

**Online build** — the Google CDN `<link>` in §9.3 still works. **Pick one
per build; never load both.**

## License

Hanken Grotesk, Fraunces, Cairo, Amiri, and Space Mono are all **SIL OFL
1.1**. Per-font license text is fetched alongside the TTFs into
`licenses/`. Embed and self-host freely; never sell the fonts alone;
never relicense.
*Order, born from many.*
