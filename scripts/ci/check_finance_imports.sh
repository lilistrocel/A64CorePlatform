#!/usr/bin/env bash
# Wave 0 (T-059.6) — Import-boundary lint.
#
# Fails the CI build if any Python file under `src/` (other than the
# explicitly-allowed exceptions below) imports from `services.finance`.
# The operations backend must remain decoupled from the finance service
# so an ops-only deployment can run without the finance package even
# being on the Python path.
#
# Allowed exceptions: NONE today. The finance bridge lives at
# `src/modules/finance_bridge/*` and depends on the `contracts/` package
# (not `services.finance`), so it does not trigger this lint.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Look for any `from services.finance...` or `import services.finance` in src/.
# Exclude bytecode/cache. Print offending lines for the developer.
MATCHES=$(grep -RnE \
  '(^|[^.])(from[[:space:]]+services\.finance|import[[:space:]]+services\.finance)' \
  --include='*.py' \
  --exclude-dir='__pycache__' \
  src/ || true)

if [ -n "$MATCHES" ]; then
  echo "❌ Wave 0 import boundary violation:"
  echo "   src/ must not import from services.finance/."
  echo
  echo "$MATCHES"
  echo
  echo "Either move the call behind the finance_bridge contract, or"
  echo "publish a domain event via OutboxWriter instead."
  exit 1
fi

echo "✅ src/ does not import from services.finance/"
