# Git Hooks

Versioned hooks for this repo. Activate once per clone:

```bash
git config core.hooksPath .githooks
```

## `pre-commit`

Fast static checks (<1s) on staged `.ts` / `.tsx` files. Blocks the commit if any
of the following are found:

- **Duplicate top-level identifiers** (`const`, `let`, `function`, `class`,
  `interface`, `type`) within a single file. Catches Babel-crash patterns like
  the `PurchaseOrdersPage` collision that left the dev UI blank on 2026-05-20.
- **Merge-conflict markers** (`<<<<<<<` / `=======` / `>>>>>>>`).
- **Stray `debugger;`** statements.

Bypass with `git commit --no-verify` if you genuinely need to (not recommended).

## Why not just `tsc --noEmit`?

Running the full TypeScript build takes ~30s — too slow for a pre-commit hook
and a friction-fest for normal commits. The targeted grep covers the most
common breakage class in <1s. For deep checks, run `npm run build:check` in
`frontend/user-portal/` manually before pushing.
