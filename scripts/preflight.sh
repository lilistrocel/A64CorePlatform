#!/usr/bin/env bash
#
# scripts/preflight.sh — read-only deployment-identity check.
#
# Prints what THIS box actually resolves for every per-deployment value
# (PUBLIC_BASE_URL, FRONTEND_URL, Cloudflare Access settings — see the
# "DEPLOYMENT IDENTITY" block in .env.example) and loudly flags anything
# still undeclared or configured in a way that cannot possibly work.
#
# Background: a sibling deployment on a different machine discovered that
# docker-compose.yml used to default PUBLIC_BASE_URL to
# "https://dev.a20core.com" — a DIFFERENT, real deployment's host. Printed
# genetics-label QR codes would have silently encoded that foreign URL.
# This script exists so that mistake (or its unset/loopback equivalent) is
# caught by running one command before a deploy, not by a phone scanning a
# label after the fact.
#
# Deliberately read-only: makes no changes to .env, docker, or anything
# else. Does not require the stack to be running, though container-prefix
# detection degrades gracefully (not an error) when it is not.
#
# POSIX-ish on purpose (this project targets Windows AND Linux — see
# CLAUDE.md): no GNU-only flags, so this also behaves under Git Bash.
#
# Exit code: 0 if nothing blocking was found, 1 otherwise — safe to use as
# a deploy gate, e.g.:
#   bash scripts/preflight.sh || exit 1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

BLOCKING=0
WARNINGS=0

# Vars whose values must never be printed, only whether they are set.
# Not exhaustive by name — anything matching *PASSWORD*/*SECRET*/*_KEY/*TOKEN*
# is also caught generically in is_sensitive() below.
SENSITIVE_VARS="CF_ACCESS_AUD SECRET_KEY ADMIN_PASSWORD MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD REDIS_PASSWORD MYSQL_PASSWORD ANTHROPIC_API_KEY LICENSE_ENCRYPTION_KEY FINANCE_INGESTION_SECRET FINANCE_MYSQL_PASSWORD FINANCE_MYSQL_ROOT_PASSWORD BACKUP_ENCRYPTION_KEY WEATHERBIT_API_KEY ELEVENLABS_API_KEY DOCKER_REGISTRY_PASSWORD"

is_sensitive() {
  # $1 = var name
  case " $SENSITIVE_VARS " in
    *" $1 "*) return 0 ;;
  esac
  case "$1" in
    *PASSWORD*|*SECRET*|*_KEY|*TOKEN*) return 0 ;;
  esac
  return 1
}

# Extract just the resolved value for a var: an already-exported shell
# environment variable wins (matches docker-compose's own precedence rule);
# otherwise fall back to the last matching KEY=VALUE line in .env; otherwise
# empty. No shell expansion is performed on the .env line's value.
## Uses `${var+_}` (existence test, NOT `${var:-...}`) so a shell env var
## that is explicitly exported as an EMPTY string is correctly reported as
## "set via env, empty value" rather than silently falling through to
## .env/dotenv — those are different, and blurring them is exactly the kind
## of silent-fallback bug this whole script exists to catch.
_env_is_set() {
  local var_name="$1" is_set
  eval "is_set=\${${var_name}+_}"
  [ "$is_set" = "_" ]
}

_env_value() {
  local var_name="$1"
  eval "printf '%s' \"\${${var_name}}\""
}

raw_value_of() {
  var_name="$1"
  local line value
  if _env_is_set "$var_name"; then
    _env_value "$var_name"
    return 0
  fi
  if [ -f "$ENV_FILE" ]; then
    line=$(grep -E "^${var_name}=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)
    if [ -n "$line" ]; then
      value="${line#*=}"
      printf '%s' "$value"
      return 0
    fi
  fi
  printf ''
}

# Where a var's resolved value came from: env / dotenv / unset.
source_of() {
  var_name="$1"
  local line
  if _env_is_set "$var_name"; then
    printf 'env'
    return 0
  fi
  if [ -f "$ENV_FILE" ]; then
    line=$(grep -E "^${var_name}=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)
    if [ -n "$line" ] && [ -n "${line#*=}" ]; then
      printf 'dotenv'
      return 0
    fi
  fi
  printf 'unset'
}

# $1 = var name. Prints its label + display row (value masked if sensitive).
print_var_row() {
  local var_name="$1" value src display
  value="$(raw_value_of "$var_name")"
  src="$(source_of "$var_name")"
  if [ "$src" = "unset" ]; then
    display="<unset>"
  elif [ -z "$value" ]; then
    display="<empty> (declared via $src, but blank)"
  elif is_sensitive "$var_name"; then
    display="<set>"
  else
    display="$value"
  fi
  print_row "$var_name" "$display" "$src"
}

hostname_of_url() {
  # Strip scheme, then userinfo, then path, then port. No python/perl
  # dependency, deliberately POSIX-ish parameter expansion only.
  local url="$1" no_scheme no_path no_userinfo host
  no_scheme=$(printf '%s' "$url" | sed -E 's#^[A-Za-z][A-Za-z0-9+.-]*://##')
  no_path="${no_scheme%%/*}"
  no_userinfo="${no_path##*@}"
  # Bracketed IPv6, e.g. [::1]:8000 -> ::1
  case "$no_userinfo" in
    \[*\]*)
      host="${no_userinfo#\[}"
      host="${host%%]*}"
      ;;
    *)
      host="${no_userinfo%%:*}"
      ;;
  esac
  printf '%s' "$host"
}

is_loopback_host() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    localhost|127.0.0.1|0.0.0.0|::1|"") return 0 ;;
    *) return 1 ;;
  esac
}

print_row() {
  # $1 = label, $2 = value, $3 = source
  printf '  %-22s %-40s [%s]\n' "$1" "$2" "$3"
}

echo "==============================================================="
echo " A64 Core Platform — deployment preflight"
echo "==============================================================="
echo "Hostname:   $(hostname 2>/dev/null || echo unknown)"
echo "Repo root:  $ROOT"
if [ -f "$ENV_FILE" ]; then
  echo ".env file:  found"
else
  echo ".env file:  NOT FOUND (relying on exported shell env only)"
fi
echo

echo "--- Deployment identity -----------------------------------------"

print_var_row PUBLIC_BASE_URL
print_var_row FRONTEND_URL
for v in CF_ACCESS_ENABLED CF_ACCESS_TEAM_DOMAIN CF_ACCESS_AUD CF_ACCESS_EXCLUSIVE CF_ACCESS_JIT_PROVISION CF_ACCESS_DEFAULT_ROLE; do
  print_var_row "$v"
done
echo

echo "--- Blocking checks ----------------------------------------------"

pbu_raw="$(raw_value_of PUBLIC_BASE_URL)"
if [ -z "$pbu_raw" ]; then
  echo "  [BLOCKING] PUBLIC_BASE_URL is unset. Printed genetics-label QR"
  echo "             codes will fail to generate (fails loudly at the"
  echo "             point of use, not at boot). Set it in .env to a"
  echo "             scheme+host a phone camera can reach."
  BLOCKING=1
else
  pbu_host="$(hostname_of_url "$pbu_raw")"
  if is_loopback_host "$pbu_host"; then
    echo "  [BLOCKING] PUBLIC_BASE_URL ('$pbu_raw') resolves to a loopback"
    echo "             host ('$pbu_host'). A phone camera cannot reach this"
    echo "             off-box — printed QR codes would be unscannable."
    BLOCKING=1
  else
    echo "  [ok]       PUBLIC_BASE_URL looks externally reachable: $pbu_raw"
  fi
fi

cf_enabled_raw="$(raw_value_of CF_ACCESS_ENABLED)"
cf_enabled_lc="$(printf '%s' "$cf_enabled_raw" | tr '[:upper:]' '[:lower:]')"
if [ "$cf_enabled_lc" = "true" ]; then
  cf_domain_raw="$(raw_value_of CF_ACCESS_TEAM_DOMAIN)"
  cf_aud_raw="$(raw_value_of CF_ACCESS_AUD)"
  if [ -z "$cf_domain_raw" ]; then
    echo "  [BLOCKING] CF_ACCESS_ENABLED=true but CF_ACCESS_TEAM_DOMAIN is"
    echo "             empty. Cloudflare Access verification cannot work."
    BLOCKING=1
  fi
  if [ -z "$cf_aud_raw" ]; then
    echo "  [BLOCKING] CF_ACCESS_ENABLED=true but CF_ACCESS_AUD is empty."
    echo "             An empty AUD would accept tokens minted for ANY"
    echo "             Cloudflare Access application, not just this one."
    BLOCKING=1
  fi
  if [ -n "$cf_domain_raw" ] && [ -n "$cf_aud_raw" ]; then
    echo "  [ok]       CF_ACCESS_ENABLED=true with team domain and AUD set."
  fi
else
  echo "  [ok]       CF_ACCESS_ENABLED is not 'true' — Cloudflare Access"
  echo "             checks skipped (password login only)."
fi
echo

echo "--- Compose container prefix on this box --------------------------"
if ! command -v docker >/dev/null 2>&1; then
  echo "  docker not found on PATH — skipping."
elif ! docker_names="$(docker ps --format '{{.Names}}' 2>/dev/null)"; then
  echo "  'docker ps' failed (daemon not running or not reachable) — skipping."
elif [ -z "$docker_names" ]; then
  echo "  No running containers found."
else
  prefix=""
  for suffix in api mongodb redis nginx user-portal; do
    match="$(printf '%s\n' "$docker_names" | grep -E "^.+-${suffix}-[0-9]+\$" | head -n 1 || true)"
    if [ -n "$match" ]; then
      prefix="$(printf '%s' "$match" | sed -E "s/-${suffix}-[0-9]+\$//")"
      break
    fi
  done
  if [ -n "$prefix" ]; then
    echo "  Detected compose project prefix: ${prefix}-"
    echo "  (e.g. '${prefix}-api-1', '${prefix}-mongodb-1')"
  else
    echo "  Could not confidently derive a prefix from running container names:"
    printf '%s\n' "$docker_names" | sed 's/^/    /'
  fi
fi
echo

echo "==============================================================="
if [ "$BLOCKING" -ne 0 ]; then
  echo " RESULT: BLOCKING problem(s) found — see [BLOCKING] lines above."
  echo "==============================================================="
  exit 1
fi
echo " RESULT: no blocking problems found."
echo "==============================================================="
exit 0
