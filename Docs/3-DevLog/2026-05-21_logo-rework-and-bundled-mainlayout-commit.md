# 2026-05-21 — A20Core logo rework + bundled MainLayout commit

## What happened

The platform brand artwork was updated to A20Core. Across the day this surfaced three issues that required several commits to chase down:

1. **Wrong mapping** — `a64logo_dark.png` initially got the light-content logo (which is intended for dark backgrounds). On the white auth cards the logo became invisible. Fixed by swapping the source-of-truth files.
2. **Too small visually** — the new source PNGs were 1024×1024 squares with ~37% top + ~37% bottom transparent padding. Every "200px tall" slot rendered only ~53px of real logo. Fixed by cropping both PNGs to their alpha bounding boxes (via Pillow inside the api container).
3. **Wrong sizing approach** — the cropped logos turned out to be ~2.9:1 banner-shaped, so the previous square-shaped `clamp(96, 14vw, 200)` values overflowed the 440px auth card by ~140px. Retuned to `clamp(56, 8vw, 120)`.

## Commits today (this session)

| SHA | Author | What |
|---|---|---|
| `2d4ac34` | Viet Anh | Initial swap to A20Core PNGs (mapping turned out wrong) |
| `1ac2667` | Viet Anh | Track `Logo/` source PNGs (gitignore exception) |
| `7e16243` | Viet Anh | Correct logo mapping + double display size |
| `49c1560` | Viet Anh | Use clamp() for responsive sizing across auth + division pages |
| `a6a7646` | Viet Anh | Crop PNGs to content + retune clamp for banner ratio (final) |
| `<next>`  | Viet Anh | Sidebar logo clamp in MainLayout.tsx **— bundled with Adrian's WIP** |

## Note for Adrian (bundled commit)

The final commit in the list above (the MainLayout one) carries **both**:

- **My change:** `LogoImg` styled-component now uses `clamp(40px, 5vw, 70px)` (replaces the old `height: 36px` + `@media (min-width: 1024px) { height: 44px }` pattern). Lives near the bottom of `MainLayout.tsx`.
- **Your uncommitted WIP** (from your Claude Code tmux session here on `noobai`) was sitting in this working tree:
  - A new `mainContentRef` + `useEffect` that resets scroll on route change (lines ~220–235).
  - The `<MainContent>` ref hook-up (line ~437).
  - The `Sidebar` styled-component switching from `position: static` to `position: sticky` + `height: 100vh` on `@media (min-width: 1024px)` (lines ~533–550).

If any of that wasn't ready to ship, revert with `git revert <sha>` of that specific commit — the changes are isolated to `MainLayout.tsx`. If the scroll work is what you intended, great, nothing to do.

I bundled rather than surgically extracting because git-stash-replay against your live tmux state felt riskier than just pinning everything to the same commit. The commit message describes both changes honestly.

— from Viet Anh's session, 2026-05-21
