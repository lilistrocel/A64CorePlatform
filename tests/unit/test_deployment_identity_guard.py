"""
Regression guard for the FRONTEND_URL "documented but never wired" defect.

Background: `.env.example` has a block headed "DEPLOYMENT IDENTITY — every
value in this block is specific to THIS box". `FRONTEND_URL` was documented
there (commit 75820b2) but never added to the api service's `environment:`
block in docker-compose.yml, and `src/config/settings.py` sets
`env_file = None` (environment variables only, no `.env` loading). So there
was no path from any deployment's `.env` into the running process: the
documented knob did nothing, and `src/utils/email.py` built every
verification / password-reset link from the fallback
`http://localhost:3000`. Account recovery was broken on every deployment for
as long as the feature existed. A sibling deployment (esg.a20core.com) found
it — fixed in commit 72c3309. No unit test could see the original bug
because it lived in the gap between the documentation, the compose file, and
the settings module, not inside any one of them.

This test closes that gap by checking the gap itself: for every variable
documented under `.env.example`'s DEPLOYMENT IDENTITY heading, it asserts
there is an actual path from a deployment's own config into the running
process (or, for the handful of vars that are legitimately tooling-only,
into their real consumer script).

Design notes
------------
Parse, don't hardcode: the variable list is read out of `.env.example` at
test time (`_parse_deployment_identity_vars`). A hardcoded Python list of
var names would rot exactly like the thing it's guarding — the next var
added under the heading must be covered automatically, with no one needing
to remember to update this file.

Block-boundary detection: `.env.example` uses a heavy "════" box-drawing
separator to bracket the "DEPLOYMENT IDENTITY" heading's title text itself,
and lighter "────" separators to bracket sub-headings for related groups of
vars within it (e.g. "Cloudflare TUNNEL identity"). A light separator
immediately preceded by a blank line marks the start of a new such
sub-heading; one immediately preceded by a comment line is a
same-sub-heading transition (explanation -> vars) rather than a new one.
The DEPLOYMENT IDENTITY heading currently owns exactly one nested
sub-heading this way (Cloudflare TUNNEL identity, read by
instances/instance-manager.sh); the SECOND sub-heading encountered
("Cloudflare Access", a separately-documented, independently-toggled SSO
feature with its own runbook — see Cloudflare-Access-Setup.md — not a
per-box identity value) is where DEPLOYMENT IDENTITY's scope ends. Finding
zero vars, or not finding the heading at all, raises loudly (AssertionError
at collection time) rather than letting the rest of this module quietly
assert over an empty list — a guard that vacuously passes is worse than none.

Tooling-only vars: the Cloudflare tunnel vars (CLOUDFLARE_DOMAIN,
CLOUDFLARED_TUNNEL_NAME, CLOUDFLARED_TUNNEL_ID, CLOUDFLARED_SERVICE_USER,
CLOUDFLARED_SERVICE_HOME) are read by instances/instance-manager.sh and
instances/_template/cloudflared.service, never by FastAPI. These are
allow-listed below with an explicit justification AND this test asserts
each one actually appears in its claimed consumer file — an unexplained or
stale exclusion is exactly how the next FRONTEND_URL slips through.

Settings-side check: any var that IS supposed to reach the api process is
also checked against `Settings` in src/config/settings.py (a var plumbed
into the container that nothing in the process reads is half of the same
class of bug).

Pure static/config test: no Docker, no running container, no network. Only
plain-text/YAML parsing of `.env.example` and `docker-compose.yml`, plus
importing (not instantiating) `Settings` for its field names.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional

import pytest
import yaml

# ---------------------------------------------------------------------------
# Repo-root discovery
#
# This file may run from a normal checkout (CI's actions/checkout, or a dev
# host) where docker-compose.yml and .env.example sit at the repo root a
# fixed number of parents above this file -- OR from tests/ having been
# `docker cp`'d standalone into the api container's /app/tests (see
# CLAUDE.md "Running backend tests"), where neither file exists at all.
# Walking up looking for both marker files (rather than hardcoding
# `parents[2]`) means this keeps working if tests/ is ever relocated, and
# skips (rather than crashing) only in the one context that genuinely has no
# way to reach them.
# ---------------------------------------------------------------------------

_REPO_ROOT_MARKERS = ("docker-compose.yml", ".env.example")
_MAX_WALK_UP = 6


def _find_repo_root(start: Path) -> Optional[Path]:
    current = start.parent
    for _ in range(_MAX_WALK_UP):
        if all((current / marker).is_file() for marker in _REPO_ROOT_MARKERS):
            return current
        parent = current.parent
        if parent == current:  # reached filesystem root
            break
        current = parent
    return None


_REPO_ROOT = _find_repo_root(Path(__file__).resolve())

if _REPO_ROOT is None:
    # NOT expected in CI: .github/workflows/build.yml runs `actions/checkout@v4`
    # (a full checkout) before `pytest tests/ -v`, so docker-compose.yml and
    # .env.example are always reachable there. This only fires for the
    # standalone `docker cp tests/ .../app/tests` + in-container pytest
    # workflow, which has neither file. If this skip is ever seen in CI,
    # that is a CI regression to investigate, not something to trust.
    pytest.skip(
        "Could not find docker-compose.yml + .env.example by walking up "
        f"from {Path(__file__).resolve()} (checked {_MAX_WALK_UP} parent "
        "directories). Expected when tests/ has been copied standalone into "
        "a container without the rest of the repo; NOT expected in CI or a "
        "normal checkout.",
        allow_module_level=True,
    )

_ENV_EXAMPLE_PATH = _REPO_ROOT / ".env.example"
_COMPOSE_PATH = _REPO_ROOT / "docker-compose.yml"
_SETTINGS_PATH = _REPO_ROOT / "src" / "config" / "settings.py"
_INSTANCE_MANAGER_PATH = _REPO_ROOT / "instances" / "instance-manager.sh"
_CLOUDFLARED_TEMPLATE_PATH = (
    _REPO_ROOT / "instances" / "_template" / "cloudflared.service"
)


# ---------------------------------------------------------------------------
# .env.example parsing -- DEPLOYMENT IDENTITY block
# ---------------------------------------------------------------------------

_HEAVY_SEPARATOR_RE = re.compile(r"^#\s*═+\s*$")
_LIGHT_SEPARATOR_RE = re.compile(r"^#\s*─+\s*$")
_VAR_ASSIGNMENT_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=")
_HEADING_RE = re.compile(r"^#\s*DEPLOYMENT IDENTITY\b")


def _parse_deployment_identity_vars(env_example_path: Path) -> List[str]:
    """Return every variable documented under .env.example's DEPLOYMENT
    IDENTITY heading, in file order. See module docstring for the
    block-boundary algorithm and its rationale.
    """
    lines = env_example_path.read_text().splitlines()

    heading_idx = None
    for i, line in enumerate(lines):
        if _HEADING_RE.match(line):
            heading_idx = i
            break
    if heading_idx is None:
        raise AssertionError(
            "Could not find a '# DEPLOYMENT IDENTITY' heading line in "
            f"{env_example_path}. Either the heading was renamed or removed "
            "(in which case: was the FRONTEND_URL-class defect this test "
            "guards against re-documented somewhere else? update this "
            "test's _HEADING_RE to match), or this parser is broken. Do not "
            "let this fail silently into an empty variable list."
        )
    if heading_idx == 0 or not _HEAVY_SEPARATOR_RE.match(lines[heading_idx - 1]):
        raise AssertionError(
            f"'# DEPLOYMENT IDENTITY' found at line {heading_idx + 1} of "
            f"{env_example_path}, but the line directly above it is not the "
            "heavy '════' separator this parser expects to open the block. "
            "Update _HEAVY_SEPARATOR_RE / this function if the banner "
            "style changed."
        )

    closing_idx = None
    for i in range(heading_idx + 1, len(lines)):
        if _HEAVY_SEPARATOR_RE.match(lines[i]):
            closing_idx = i
            break
    if closing_idx is None:
        raise AssertionError(
            "Found the DEPLOYMENT IDENTITY heading but no closing heavy "
            f"'════' separator after it in {env_example_path}. Update this "
            "parser if the banner style changed."
        )

    variables: List[str] = []
    subsection_starts = 0
    prev_blank = True  # the line right after the closing separator is "fresh"
    for line in lines[closing_idx + 1 :]:
        is_blank = line.strip() == ""

        if not is_blank and prev_blank and _LIGHT_SEPARATOR_RE.match(line):
            subsection_starts += 1
            if subsection_starts >= 2:
                # Second sibling sub-heading (blank line + fresh light
                # separator) after the DEPLOYMENT IDENTITY heading's own
                # nested "Cloudflare TUNNEL identity" sub-heading -> this is
                # a new, differently-scoped section ("Cloudflare Access").
                break

        match = _VAR_ASSIGNMENT_RE.match(line)
        if match:
            variables.append(match.group(1))

        prev_blank = is_blank

    if not variables:
        raise AssertionError(
            "Parsed zero variables out of the DEPLOYMENT IDENTITY block in "
            f"{env_example_path} (heading at line {heading_idx + 1}, closing "
            f"separator at line {closing_idx + 1}). That is almost certainly "
            "a parser bug, not an empty section -- a guard that vacuously "
            "passes over nothing is worse than no guard at all."
        )
    return variables


DEPLOYMENT_IDENTITY_VARS: List[str] = _parse_deployment_identity_vars(_ENV_EXAMPLE_PATH)


# ---------------------------------------------------------------------------
# docker-compose.yml parsing -- api service `environment:` block
#
# docker-compose.yml is valid YAML, so this uses yaml.safe_load (already a
# project dependency -- requirements.txt has PyYAML) rather than hand-rolled
# indentation parsing, which would be a worse, more fragile reimplementation
# of a parser that already exists and is already correct.
# ---------------------------------------------------------------------------


def _parse_api_service_environment(compose_path: Path) -> List[str]:
    """Return the env-var names declared in services.api.environment in
    docker-compose.yml."""
    doc = yaml.safe_load(compose_path.read_text())
    try:
        api_service = doc["services"]["api"]
    except (KeyError, TypeError) as exc:
        raise AssertionError(
            f"{compose_path} has no services.api -- has the api service "
            "been renamed? Update this test if so."
        ) from exc

    env_entries = api_service.get("environment")
    if not env_entries:
        raise AssertionError(
            f"services.api in {compose_path} has no `environment:` block "
            "(or it's empty). If this ever moves to an `env_file:` "
            "directive instead, this whole guard's premise changes -- "
            "src/config/settings.py sets env_file=None, so an `env_file:` "
            "on the api service in compose would be a NEW path into the "
            "process this test doesn't yet know about. Update "
            "_parse_api_service_environment accordingly rather than "
            "letting this fail as a false alarm."
        )

    names: List[str] = []
    for entry in env_entries:
        if isinstance(entry, str):
            # The list-of-strings form. TWO shapes are valid and both count as
            # "wired in":
            #   - KEY=value   assignment, possibly with a ${VAR:-default}
            #   - KEY         pass-through: Compose forwards it ONLY when the
            #                 host/.env defines it, and omits it entirely
            #                 otherwise.
            # The bare form is not a lesser variant — for any key that
            # deployment_settings_service resolves env -> db -> unset it is the
            # REQUIRED form, because `KEY=${KEY:-}` sets an empty string, and a
            # non-empty default would be read as "env is set" and lock the key,
            # overriding admin configuration. Matching only `KEY=` here would
            # push authors toward the shape that breaks that resolution.
            match = _VAR_ASSIGNMENT_RE.match(entry)
            if match:
                names.append(match.group(1))
            elif re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", entry.strip()):
                names.append(entry.strip())
        elif isinstance(entry, dict):
            # docker-compose also allows a mapping form (`KEY: value`) for
            # `environment:`. Not used here today, but handled so this
            # doesn't silently under-count if that ever changes.
            names.extend(entry.keys())
    return names


API_ENV_VARS: List[str] = _parse_api_service_environment(_COMPOSE_PATH)


# ---------------------------------------------------------------------------
# Tooling-only allow-list
#
# Every entry here is a deliberate, justified exclusion from "must be wired
# into the api container" -- NOT a way to silence an inconvenient failure.
# Each one is also asserted (below) to actually appear in its claimed
# consumer, so a stale or wrong justification fails loudly too.
# ---------------------------------------------------------------------------

_TOOLING_ONLY_ALLOWLIST: Dict[str, str] = {
    "CLOUDFLARE_DOMAIN": (
        "Read only by instances/instance-manager.sh's create/destroy "
        "commands (per-instance subdomain construction), not by FastAPI."
    ),
    "CLOUDFLARED_TUNNEL_NAME": (
        "Read only by instances/instance-manager.sh (cloudflared tunnel "
        "run / route dns), not by FastAPI."
    ),
    "CLOUDFLARED_TUNNEL_ID": (
        "Read only by instances/instance-manager.sh (informational DNS-"
        "record guidance when cloudflared isn't on PATH), not by FastAPI."
    ),
    "CLOUDFLARED_SERVICE_USER": (
        "Fills the systemd User= placeholder in "
        "instances/_template/cloudflared.service, installed by "
        "instances/instance-manager.sh. Not read by FastAPI."
    ),
    "CLOUDFLARED_SERVICE_HOME": (
        "Fills the systemd HOME= placeholder in "
        "instances/_template/cloudflared.service, installed by "
        "instances/instance-manager.sh. Not read by FastAPI."
    ),
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_parser_found_the_known_anchor_vars():
    """Canary for `_parse_deployment_identity_vars` itself: PUBLIC_BASE_URL
    and FRONTEND_URL are the two vars this whole guard exists because of
    (see module docstring). If either has silently dropped out of the
    parsed set, the parser is broken -- it is not plausible that DEPLOYMENT
    IDENTITY legitimately shrank to exclude the var that caused this test
    to be written.
    """
    assert "FRONTEND_URL" in DEPLOYMENT_IDENTITY_VARS
    assert "PUBLIC_BASE_URL" in DEPLOYMENT_IDENTITY_VARS


def test_compose_api_environment_parser_found_a_sane_nonempty_list():
    """Canary for `_parse_api_service_environment`: MONGODB_URL is
    unconditionally required by the api service and has nothing to do with
    deployment identity -- if it's missing, the YAML parsing/lookup broke,
    not that `environment:` became empty.
    """
    assert (
        API_ENV_VARS
    ), f"Parsed zero environment vars from services.api in {_COMPOSE_PATH}."
    assert "MONGODB_URL" in API_ENV_VARS


def test_tooling_only_allowlist_has_no_stale_entries():
    """Every allow-listed var must still actually be under the DEPLOYMENT
    IDENTITY heading -- an allow-list entry for a var that no longer exists
    there is dead weight that could mask a future rename going unnoticed.
    """
    stale = set(_TOOLING_ONLY_ALLOWLIST) - set(DEPLOYMENT_IDENTITY_VARS)
    assert not stale, (
        f"Allow-list entries no longer present under DEPLOYMENT IDENTITY: "
        f"{sorted(stale)} -- remove them from _TOOLING_ONLY_ALLOWLIST."
    )


@pytest.mark.parametrize("var_name", sorted(_TOOLING_ONLY_ALLOWLIST))
def test_tooling_only_var_reaches_its_claimed_consumer(var_name: str):
    """For each allow-listed (tooling-only) var, assert it actually appears
    in one of its two possible real consumers. An allow-list entry whose
    var has drifted out of both consumer files would itself be an orphaned
    config value -- the same class of bug as the original FRONTEND_URL
    defect, just laundered through an exclusion list instead of a missing
    compose entry.
    """
    manager_text = _INSTANCE_MANAGER_PATH.read_text()
    template_text = (
        _CLOUDFLARED_TEMPLATE_PATH.read_text()
        if _CLOUDFLARED_TEMPLATE_PATH.is_file()
        else ""
    )
    assert var_name in manager_text or var_name in template_text, (
        f"'{var_name}' is allow-listed in this test as tooling-only "
        f"({_TOOLING_ONLY_ALLOWLIST[var_name]}) but does not appear in "
        f"either {_INSTANCE_MANAGER_PATH} or {_CLOUDFLARED_TEMPLATE_PATH}. "
        "Either its consumer moved (update the allow-list's justification "
        "and this test) or it is now genuinely orphaned."
    )


@pytest.mark.parametrize("var_name", DEPLOYMENT_IDENTITY_VARS)
def test_every_deployment_identity_var_reaches_the_running_process(var_name: str):
    """The core guard: every variable documented under DEPLOYMENT IDENTITY
    must have an actual path into the process that is supposed to use it.

    For api-process vars, that path is: present in docker-compose.yml's
    services.api.environment block. `src/config/settings.py` sets
    `env_file = None` (environment variables only) and docker-compose.yml
    has no `env_file:` directive on the api service, so `environment:` is
    the ONLY path from a deployment's own `.env` into the running api
    process -- a var missing from it is documented but inert, exactly the
    original FRONTEND_URL defect.
    """
    if var_name in _TOOLING_ONLY_ALLOWLIST:
        pytest.skip(
            f"{var_name} is tooling-only "
            f"({_TOOLING_ONLY_ALLOWLIST[var_name]}); covered by "
            "test_tooling_only_var_reaches_its_claimed_consumer instead."
        )

    assert var_name in API_ENV_VARS, (
        f"'{var_name}' is documented under .env.example's DEPLOYMENT "
        f"IDENTITY heading but is NOT present in the api service's "
        f"`environment:` block in {_COMPOSE_PATH}.\n\n"
        "This is exactly the FRONTEND_URL defect: settings.py has "
        "env_file=None (environment variables only) and docker-compose.yml "
        "has no env_file: directive on the api service, so a variable "
        "missing from `environment:` has NO path from a deployment's .env "
        "into the running process -- the documented knob does nothing.\n\n"
        f"Fix: add a line to services.api.environment in {_COMPOSE_PATH}, "
        f"e.g. `- {var_name}=${{{var_name}}}` (or with a safe, "
        "no-real-deployment-name default, per the no-fallback-may-name-a-"
        "real-deployment policy from commit 75820b2)."
    )


@pytest.mark.parametrize(
    "var_name",
    [v for v in DEPLOYMENT_IDENTITY_VARS if v not in _TOOLING_ONLY_ALLOWLIST],
)
def test_every_wired_deployment_identity_var_has_a_settings_field(var_name: str):
    """A var plumbed into the container that nothing in the FastAPI process
    reads is half of the same class of bug: the documented knob still does
    nothing, it just fails one step later. Checked via the real Settings
    class (import only, never instantiated -- no env vars are read and no
    validators run just by looking at `model_fields`).
    """
    from src.config.settings import Settings

    assert var_name in Settings.model_fields, (
        f"'{var_name}' is wired into the api service's `environment:` "
        f"block in {_COMPOSE_PATH} but has no corresponding field on "
        f"Settings in {_SETTINGS_PATH} -- the container receives it but "
        "nothing in the FastAPI process reads it. Add a "
        f"`{var_name}: <type>` field to Settings, or if it turns out to be "
        "consumed some other way (not a Settings field, not tooling-only), "
        "explain that here and adjust this test accordingly."
    )
