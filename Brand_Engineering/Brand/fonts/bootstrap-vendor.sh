#!/usr/bin/env bash
# A20Core — bootstrap-vendor.sh
# One-shot script: resolve a pinned google/fonts SHA → patch manifest → vendor.
# Run this ONCE in any networked environment (local or CI) to close T-2026-0234.
# After this run, commit Brand/fonts/ttf/ + Brand/fonts/licenses/ +
# Brand/fonts/fonts.manifest.json together. Subsequent builds use vendor-fonts.sh
# --check (no network needed).
#
# Usage:
#   bash Brand/fonts/bootstrap-vendor.sh               # pin latest HEAD
#   bash Brand/fonts/bootstrap-vendor.sh <commit-sha>  # pin specific SHA
#
# Prerequisites: bash, python3, curl, sha256sum (or shasum), git-reachable network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$HERE/fonts.manifest.json"

# --- resolve ref -----------------------------------------------------------
if [ -n "${1:-}" ]; then
  REF="$1"
  echo "Using provided ref: $REF"
else
  echo "Resolving latest google/fonts HEAD SHA..."
  REF="$(curl -fsS \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/google/fonts/commits/main" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")"
  echo "Resolved: $REF"
fi

# --- pin ref in manifest ---------------------------------------------------
python3 - "$MANIFEST" "$REF" <<'PY'
import json, sys
path, ref = sys.argv[1], sys.argv[2]
m = json.load(open(path))
m["upstream"]["ref"] = ref
json.dump(m, open(path, "w"), indent=2, ensure_ascii=False)
open(path, "a").write("\n")
print(f"Pinned upstream.ref → {ref}")
PY

# --- vendor ---------------------------------------------------------------
bash "$HERE/vendor-fonts.sh" --update-checksums

echo ""
echo "==========================================================="
echo " Bootstrap complete."
echo " Review ttf/, licenses/, and fonts.manifest.json, then:"
echo "   git add Brand/fonts/ttf/ Brand/fonts/licenses/ Brand/fonts/fonts.manifest.json"
echo "   git commit -m 'feat(brand): vendor OFL fonts @ ${REF:0:12}'"
echo "==========================================================="
