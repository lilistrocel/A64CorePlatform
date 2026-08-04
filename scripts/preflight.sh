#!/usr/bin/env bash
#
# scripts/preflight.sh — read-only deployment-identity check.
#
# Prints what THIS box actually resolves for every per-deployment value
# (PUBLIC_BASE_URL, FRONTEND_URL, Cloudflare Access settings, Cloudflare
# tunnel identity — see the "DEPLOYMENT IDENTITY" block in .env.example)
# and loudly flags anything still undeclared or configured in a way that
# cannot possibly work.
#
# Background: a sibling deployment on a different machine discovered that
# docker-compose.yml used to default PUBLIC_BASE_URL to
# "https://dev.a20core.com" — a DIFFERENT, real deployment's host. Printed
# genetics-label QR codes would have silently encoded that foreign URL.
# This script exists so that mistake (or its unset/loopback equivalent) is
# caught by running one command before a deploy, not by a phone scanning a
# label after the fact.
#
# A second sibling deployment (using the instances/<name>/.env layout from
# instances/instance-manager.sh) then found this script hardcoded ROOT/.env
# as the only place it would ever look — so on a box with no root .env, it
# printed a false [BLOCKING] PUBLIC_BASE_URL-is-unset even though the value
# was correctly set in instances/<name>/.env. --env-file / --instance below,
# plus the printed "Env file:" line, fix that: a false BLOCKING is worse
# than no check, because it teaches people the tool is wrong.
#
# Deliberately read-only: makes no changes to .env, docker, or anything
# else. Does not require the stack to be running, though container-prefix
# detection degrades gracefully (not an error) when it is not.
#
# POSIX-ish on purpose (this project targets Windows AND Linux — see
# CLAUDE.md): no GNU-only flags, so this also behaves under Git Bash.
#
# Usage:
#   bash scripts/preflight.sh                     # auto-resolve (see below)
#   bash scripts/preflight.sh --env-file <path>    # explicit .env to read
#   bash scripts/preflight.sh --instance <name>    # read instances/<name>/.env
#
# Env-file resolution precedence (first match wins; explicit "Env file:"
# line in the output always says which one was actually used and why):
#   1. --env-file <path>     — explicit, always wins
#   2. --instance <name>     — explicit, resolves to instances/<name>/.env
#   3. ROOT/.env             — if present, this is the default. A box that
#                              has BOTH a root .env and instances/<name>/
#                              dirs (e.g. a primary deployment that also
#                              hosts secondary instances) reads root .env
#                              unless told otherwise — see the printed NOTE
#                              when other instances/*/.env exist too.
#   4. instances/<prefix>/.env — only when root .env is absent, using the
#                              compose project prefix detected from
#                              `docker ps` (the same detection this script
#                              already did, just applied earlier now).
#   5. none                  — no file found; falls back to exported shell
#                              env only, same as before.
#
# Exit code: 0 if nothing blocking was found, 1 otherwise — safe to use as
# a deploy gate, e.g.:
#   bash scripts/preflight.sh || exit 1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTANCES_ROOT="$ROOT/instances"

usage_and_exit() {
  local code="${1:-0}"
  cat <<EOF
Usage: bash scripts/preflight.sh [--env-file <path>] [--instance <name>]

  --env-file <path>   Read this .env file explicitly (highest precedence).
  --instance <name>   Read instances/<name>/.env explicitly.
  -h, --help          Show this help.

With no flags: reads ROOT/.env if present, otherwise auto-detects an
instances/<prefix>/.env from the running container prefix. See the header
comment in this script for the full precedence order.
EOF
  exit "$code"
}

OPT_ENV_FILE=""
OPT_INSTANCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) OPT_ENV_FILE="${2:-}"; shift 2 ;;
    --env-file=*) OPT_ENV_FILE="${1#*=}"; shift ;;
    --instance) OPT_INSTANCE="${2:-}"; shift 2 ;;
    --instance=*) OPT_INSTANCE="${1#*=}"; shift ;;
    -h|--help) usage_and_exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage_and_exit 1 ;;
  esac
done

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

# --- Compose container-prefix detection (read-only `docker ps`) -----------
# Run once, early: both the env-file auto-detection below and the display
# section further down need it, and `docker ps` should only be invoked once.
DOCKER_PROBE_STATUS="unknown"  # no-docker | no-daemon | empty | ok
DOCKER_NAMES=""
DETECTED_PREFIX=""

if ! command -v docker >/dev/null 2>&1; then
  DOCKER_PROBE_STATUS="no-docker"
elif ! DOCKER_NAMES="$(docker ps --format '{{.Names}}' 2>/dev/null)"; then
  DOCKER_PROBE_STATUS="no-daemon"
elif [ -z "$DOCKER_NAMES" ]; then
  DOCKER_PROBE_STATUS="empty"
else
  DOCKER_PROBE_STATUS="ok"
  for suffix in api mongodb redis nginx user-portal; do
    match="$(printf '%s\n' "$DOCKER_NAMES" | grep -E "^.+-${suffix}-[0-9]+\$" | head -n 1 || true)"
    if [ -n "$match" ]; then
      DETECTED_PREFIX="$(printf '%s' "$match" | sed -E "s/-${suffix}-[0-9]+\$//")"
      break
    fi
  done
fi

# --- Env-file resolution ---------------------------------------------------
# See the precedence order documented in the header comment. Nothing here
# reads secret values — raw_value_of()/print_var_row() (above) already mask
# them; this section only decides WHICH file those functions read from, and
# prints that choice so it is never incidental.
list_instance_env_dirs() {
  # Prints instance directory names under instances/ that have a .env,
  # excluding _template. Read-only; used only for the "NOTE" below.
  [ -d "$INSTANCES_ROOT" ] || return 0
  for d in "$INSTANCES_ROOT"/*/; do
    [ -d "$d" ] || continue
    local n
    n="$(basename "$d")"
    [ "$n" = "_template" ] && continue
    [ -f "${d}.env" ] && printf '%s\n' "$n"
  done
}

ENV_FILE=""
ENV_FILE_SOURCE=""

if [ -n "$OPT_ENV_FILE" ]; then
  ENV_FILE="$OPT_ENV_FILE"
  ENV_FILE_SOURCE="explicit --env-file"
  if [ ! -f "$ENV_FILE" ]; then
    echo "[BLOCKING] --env-file '$ENV_FILE' does not exist."
    BLOCKING=1
  fi
elif [ -n "$OPT_INSTANCE" ]; then
  ENV_FILE="$INSTANCES_ROOT/$OPT_INSTANCE/.env"
  ENV_FILE_SOURCE="explicit --instance '$OPT_INSTANCE'"
  if [ ! -f "$ENV_FILE" ]; then
    echo "[BLOCKING] --instance '$OPT_INSTANCE' has no .env at '$ENV_FILE'."
    BLOCKING=1
  fi
elif [ -f "$ROOT/.env" ]; then
  ENV_FILE="$ROOT/.env"
  ENV_FILE_SOURCE="root .env (default precedence: root .env wins over any instances/<name>/.env when both exist on this box — pass --instance <name> or --env-file <path> to check a specific instance instead)"
elif [ -n "$DETECTED_PREFIX" ] && [ -f "$INSTANCES_ROOT/$DETECTED_PREFIX/.env" ]; then
  ENV_FILE="$INSTANCES_ROOT/$DETECTED_PREFIX/.env"
  ENV_FILE_SOURCE="auto-detected instance '$DETECTED_PREFIX' (root .env absent; derived from the running container-name prefix below)"
else
  ENV_FILE=""
  ENV_FILE_SOURCE="none found (no root .env, no auto-detected instances/<prefix>/.env — relying on exported shell env only)"
fi

# Which instance name (if any) ENV_FILE resolved to, so the "other instances
# not read" note below doesn't list the one actually in use.
USED_INSTANCE_NAME=""
case "$ENV_FILE" in
  "$INSTANCES_ROOT"/*/.env)
    USED_INSTANCE_NAME="$(basename "$(dirname "$ENV_FILE")")"
    ;;
esac

OTHER_INSTANCES=""
while IFS= read -r inst; do
  [ -z "$inst" ] && continue
  [ "$inst" = "$USED_INSTANCE_NAME" ] && continue
  OTHER_INSTANCES="$OTHER_INSTANCES $inst"
done <<INSTLIST
$(list_instance_env_dirs)
INSTLIST
OTHER_INSTANCES="${OTHER_INSTANCES# }"

echo "==============================================================="
echo " A64 Core Platform — deployment preflight"
echo "==============================================================="
echo "Hostname:   $(hostname 2>/dev/null || echo unknown)"
echo "Repo root:  $ROOT"
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  echo "Env file:   $ENV_FILE"
else
  echo "Env file:   NOT FOUND"
fi
echo "            (source: $ENV_FILE_SOURCE)"
if [ -n "$OTHER_INSTANCES" ]; then
  echo "            NOTE: instances/ also has .env for:$OTHER_INSTANCES — NOT read"
  echo "            this run. Pass --instance <name> or --env-file <path> to check"
  echo "            one of those instead."
fi
echo

echo "--- Deployment identity -----------------------------------------"

print_var_row PUBLIC_BASE_URL
print_var_row FRONTEND_URL
for v in CF_ACCESS_ENABLED CF_ACCESS_TEAM_DOMAIN CF_ACCESS_AUD CF_ACCESS_EXCLUSIVE CF_ACCESS_JIT_PROVISION CF_ACCESS_DEFAULT_ROLE; do
  print_var_row "$v"
done
echo

echo "--- Cloudflare tunnel identity (instances/instance-manager.sh) ---"
for v in CLOUDFLARE_DOMAIN CLOUDFLARED_TUNNEL_NAME CLOUDFLARED_TUNNEL_ID CLOUDFLARED_SERVICE_USER CLOUDFLARED_SERVICE_HOME; do
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

# Non-blocking: these vars are only required if instances/instance-manager.sh
# is used to manage this box's Cloudflare tunnel (its `create`/`destroy`
# commands). A deployment whose tunnel was configured manually/outside
# instance-manager.sh (e.g. a pre-existing host systemd service) never
# reads them and is unaffected either way — so an unset value here is a
# WARNING, not a BLOCKING, unlike PUBLIC_BASE_URL above.
tunnel_missing=""
for v in CLOUDFLARE_DOMAIN CLOUDFLARED_TUNNEL_NAME CLOUDFLARED_TUNNEL_ID; do
  v_val="$(raw_value_of "$v")"
  if [ -z "$v_val" ]; then
    tunnel_missing="$tunnel_missing $v"
  fi
done
tunnel_missing="${tunnel_missing# }"
if [ -n "$tunnel_missing" ]; then
  echo "  [WARNING]  Unset: $tunnel_missing"
  echo "             Required only by instances/instance-manager.sh create/destroy"
  echo "             (it now fails loudly, naming the missing var, instead of"
  echo "             falling back to any real tunnel/domain). See the HA-balancing"
  echo "             failure mode in Docs/1-Main-Documentation/Deployment-Identity.md"
  echo "             before running instance-manager.sh create/destroy on this box."
  WARNINGS=1
else
  echo "  [ok]       CLOUDFLARE_DOMAIN / CLOUDFLARED_TUNNEL_NAME / CLOUDFLARED_TUNNEL_ID all set."
fi

service_missing=""
for v in CLOUDFLARED_SERVICE_USER CLOUDFLARED_SERVICE_HOME; do
  v_val="$(raw_value_of "$v")"
  if [ -z "$v_val" ]; then
    service_missing="$service_missing $v"
  fi
done
service_missing="${service_missing# }"
if [ -n "$service_missing" ]; then
  echo "  [WARNING]  Unset: $service_missing"
  echo "             Needed only when rendering"
  echo "             instances/_template/cloudflared.service into this box's"
  echo "             systemd unit (User=/HOME=). Not read by any command here."
  WARNINGS=1
fi
echo

echo "--- Compose container prefix on this box --------------------------"
case "$DOCKER_PROBE_STATUS" in
  no-docker) echo "  docker not found on PATH — skipping." ;;
  no-daemon) echo "  'docker ps' failed (daemon not running or not reachable) — skipping." ;;
  empty) echo "  No running containers found." ;;
  ok)
    if [ -n "$DETECTED_PREFIX" ]; then
      echo "  Detected compose project prefix: ${DETECTED_PREFIX}-"
      echo "  (e.g. '${DETECTED_PREFIX}-api-1', '${DETECTED_PREFIX}-mongodb-1')"
    else
      echo "  Could not confidently derive a prefix from running container names:"
      printf '%s\n' "$DOCKER_NAMES" | sed 's/^/    /'
    fi
    ;;
esac
echo

echo "==============================================================="
if [ "$BLOCKING" -ne 0 ]; then
  echo " RESULT: BLOCKING problem(s) found — see [BLOCKING] lines above."
  echo "==============================================================="
  exit 1
fi
if [ "$WARNINGS" -ne 0 ]; then
  echo " RESULT: no blocking problems found (non-blocking [WARNING] lines above)."
else
  echo " RESULT: no blocking problems found."
fi
echo "==============================================================="
exit 0
