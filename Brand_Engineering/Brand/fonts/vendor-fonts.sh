#!/usr/bin/env bash
# =====================================================================
# A20Core — vendor-fonts.sh
# Fetch the self-hosted OFL TTFs (Hanken Grotesk, Fraunces, Cairo,
# Amiri, Space Mono) + their licenses from a pinned google/fonts ref
# into ./ttf and ./licenses, so sovereign / offline builds — Latin or
# Arabic — render inside the data-sovereignty boundary
# (A20Core_BRAND.md §4 + §9.3; tasks T-2026-0111, T-2026-0143).
# The script is manifest-driven: add a font to fonts.manifest.json and
# it is fetched + checksum-verified with no change here.
#
#   ./vendor-fonts.sh                  # fetch + verify against manifest sha256
#   ./vendor-fonts.sh --update-checksums   # fetch + WRITE computed sha256 back
#   ./vendor-fonts.sh --ref <git-sha>  # override the pinned ref for this run
#   ./vendor-fonts.sh --check          # verify already-vendored files only (no network)
#
# Reproducible sovereign builds: pin a commit SHA (not "main") in
# fonts.manifest.json -> upstream.ref, run --update-checksums once,
# commit ttf/ + licenses/ + the populated manifest. Every later run
# then verifies bytes against the committed sha256 values.
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$HERE/fonts.manifest.json"

UPDATE=0; CHECK_ONLY=0; REF_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --update-checksums) UPDATE=1 ;;
    --check)            CHECK_ONLY=1 ;;
    --ref)              REF_OVERRIDE="${2:-}"; shift ;;
    -h|--help)          sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

# --- prerequisites -----------------------------------------------------
command -v python3 >/dev/null || { echo "need python3 (manifest parsing)" >&2; exit 1; }
if [ "$CHECK_ONLY" -eq 0 ]; then
  command -v curl >/dev/null || { echo "need curl" >&2; exit 1; }
fi
if command -v sha256sum >/dev/null; then SHA() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum   >/dev/null; then SHA() { shasum -a 256 "$1" | cut -d' ' -f1; }
else echo "need sha256sum or shasum" >&2; exit 1; fi

mkdir -p "$HERE/ttf" "$HERE/licenses"

# --- resolve ref + raw base -------------------------------------------
REF="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["upstream"]["ref"])' "$MANIFEST")"
[ -n "$REF_OVERRIDE" ] && REF="$REF_OVERRIDE"
RAW_BASE="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["upstream"]["raw_base"])' "$MANIFEST" | sed "s/{ref}/$REF/")"
echo "ref: $REF"
[ "$REF" = "main" ] && [ "$CHECK_ONLY" -eq 0 ] && \
  echo "WARNING: ref is 'main' — NOT reproducible. Pin a commit SHA for sovereign builds." >&2

# --- flatten manifest into TSV: kind  src  dest  sha256 ----------------
ROWS="$(python3 - "$MANIFEST" <<'PY'
import json,sys
m=json.load(open(sys.argv[1]))
for f in m["fonts"]:
    print("\t".join(["lic", f["license_src"], f["license_dest"], ""]))
    for fl in f["files"]:
        print("\t".join(["ttf", fl["src"], fl["dest"], fl.get("sha256") or ""]))
PY
)"

fail=0
while IFS=$'\t' read -r kind src dest want; do
  [ -z "${kind:-}" ] && continue
  out="$HERE/$dest"
  if [ "$CHECK_ONLY" -eq 0 ]; then
    echo "fetch $dest"
    curl -fsSL "$RAW_BASE/$src" -o "$out" || { echo "  FAILED: $src" >&2; fail=1; continue; }
  fi
  [ -f "$out" ] || { echo "  MISSING: $dest" >&2; fail=1; continue; }
  # checksum (TTFs only; licenses are text, verified by presence)
  if [ "$kind" = "ttf" ]; then
    got="$(SHA "$out")"
    if [ "$UPDATE" -eq 1 ]; then
      python3 - "$MANIFEST" "$dest" "$got" <<'PY'
import json,sys
p,dest,got=sys.argv[1],sys.argv[2],sys.argv[3]
m=json.load(open(p))
for f in m["fonts"]:
    for fl in f["files"]:
        if fl["dest"]==dest: fl["sha256"]=got
json.dump(m,open(p,"w"),indent=2,ensure_ascii=False); open(p,"a").write("\n")
PY
      echo "  sha256 recorded: $got"
    elif [ -n "$want" ]; then
      [ "$got" = "$want" ] && echo "  sha256 OK" || { echo "  sha256 MISMATCH: $dest" >&2; fail=1; }
    else
      echo "  sha256 (unpinned): $got"
    fi
  fi
done <<< "$ROWS"

if [ "$fail" -ne 0 ]; then echo "DONE WITH ERRORS" >&2; exit 1; fi
echo "OK — fonts vendored to ttf/ , licenses to licenses/"
[ "$UPDATE" -eq 1 ] && echo "Manifest checksums updated — review & commit fonts.manifest.json"
exit 0
