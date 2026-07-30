# Font licenses — OFL 1.1

All three vendored families are licensed under the **SIL Open Font License 1.1**:

| Family | Reserved Font Name | Authoritative license (fetched) |
|---|---|---|
| Cairo | "Cairo" | `OFL-Cairo.txt` |
| Amiri | "Amiri" | `OFL-Amiri.txt` |
| Space Mono | — | `OFL-SpaceMono.txt` |

`OFL-1.1.txt` is the shared, canonical license body for reference. The
per-font `OFL-*.txt` files — which carry each font's exact copyright line
and Reserved Font Name header — are fetched **verbatim from upstream** by
`../vendor-fonts.sh` (each Google Fonts package ships its OFL.txt next to
the TTFs). Those per-font files are authoritative; ship them with the
TTFs as OFL §2 requires.

OFL terms relevant to A20Core:
- ✅ Embed, self-host, bundle, and ship with the platform — free of charge.
- ✅ Modify (subset/instance) for build optimisation, **as long as** a
  Modified Version does not reuse the Reserved Font Name.
- ❌ Never sell the fonts by themselves.
- ❌ Never redistribute under a different license.
