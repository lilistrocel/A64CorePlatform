# Deployment Identity — A64 Core Platform

**Status:** Active
**Audience:** Whoever is setting up, operating, or debugging a given A64 deployment. No prior familiarity with any other deployment is assumed — and no fact about another deployment should be assumed to apply here either.

This document exists because A64 runs on more than one machine, and a fact that is
true of one deployment has already been mistaken for a fact about all of them —
see [Why this document exists](#why-this-document-exists). It is the single place
that lists what makes one A64 deployment different from another, what each of
those differences controls, and what breaks when one is wrong.

## Table of Contents
- [Why this document exists](#why-this-document-exists)
- [Deployment Identity Values](#deployment-identity-values)
- [Each variable, in detail](#each-variable-in-detail)
  - [PUBLIC_BASE_URL](#public_base_url)
  - [Cloudflare tunnel hostname](#cloudflare-tunnel-hostname)
  - [Zero Trust team domain and AUD tag](#zero-trust-team-domain-and-aud-tag)
  - [Container name prefix](#container-name-prefix)
  - [Admin contact](#admin-contact)
- [The rule: no default may name another live deployment](#the-rule-no-default-may-name-another-live-deployment)
- [Checking what this box resolved to](#checking-what-this-box-resolved-to)
- [See Also](#see-also)

## Why this document exists

`CLAUDE.md` used to describe one deployment's hostname, IP, and container
names under a heading that read as a universal statement about "the" server.
A second A64 deployment, on a different machine, with a different hostname
and no containers matching that name prefix at all, followed those
instructions and found none of them applied.

That mismatch would have been survivable on its own. It was not survivable
because `docker-compose.yml` also defaulted `PUBLIC_BASE_URL` to the first
deployment's hostname. Left in place, that default would have been baked
into every genetics QR label the second deployment printed — physical labels
that scan to the **first** deployment's server, not the one that printed
them. The mistake was caught before any labels were printed, but it is
exactly the kind of error this document is meant to make structurally hard
to repeat: every value that differs between deployments now has to be
looked up here and set explicitly, not inherited from an example.

## Deployment Identity Values

Fill this in for your deployment before relying on any instruction elsewhere
in this repo that references one of these values. Every other doc
(`CLAUDE.md`, `Cloudflare-Access-Setup.md`) refers back to this table instead
of hardcoding a value.

| Variable | What it is | This deployment's value |
|---|---|---|
| Hostname | Output of `hostname` on the box running the stack | |
| Public base URL | The externally-reachable URL this deployment serves the app at (`PUBLIC_BASE_URL`) | |
| Cloudflare tunnel hostname | The hostname `cloudflared` publishes for this deployment (lives outside this repo) | |
| Zero Trust team domain | `<team>.cloudflareaccess.com` for this deployment's Access setup | |
| Access AUD tag | This deployment's Application Audience tag in Cloudflare Access | |
| Compose project / container prefix | The prefix on every container this deployment's `docker compose` starts, e.g. `<prefix>-api-1` | |
| Admin contact | Who owns this deployment's Cloudflare account, DNS, and server access | |

**Reference deployment (`noobai`) — a worked example only. Do not copy these
values into your own deployment's table above:**

| Variable | Reference value |
|---|---|
| Hostname | `noobai` |
| Public base URL | `https://dev.a20core.com` |
| Cloudflare tunnel hostname | `dev.a20core.com` (same value as public base URL on this deployment — not guaranteed elsewhere) |
| Compose project / container prefix | `a64coreplatform-` |

## Each variable, in detail

### `PUBLIC_BASE_URL`

**What it controls.** This is the hostname the backend stamps into every
genetics label QR code (`src/modules/genetics/api/v1/labels.py`, via
`settings.PUBLIC_BASE_URL` in `src/config/settings.py`). It is also the
value that should agree with whatever URL users actually type into a
browser to reach this deployment.

**Why it gets the most space here.** Every other identity value in this
document is corrected by editing a config file and restarting a container.
`PUBLIC_BASE_URL` is different: once a label has been printed onto a
physical vessel tag, the QR code on that tag is fixed. If the value was
wrong at print time, the fix is not a config change — it is reprinting and
re-affixing every label that went out with the wrong URL baked in. A wrong
value here does not fail loudly at the moment of the mistake; it fails
quietly, later, when someone scans a tag and lands on the wrong
deployment's server (or on nothing, if the wrong host doesn't resolve at
all).

**Consequence of getting it wrong.** A deployment that inherits another
deployment's `PUBLIC_BASE_URL` — by leaving a shared default in place,
copying a `.env` file without editing it, or copying this document's
reference row into its own table — prints labels that scan to the *other*
deployment's server. Two deployments can end up cross-wired: vessels
physically located at deployment B, scannable only against deployment A's
database.

**Current safeguard.** `docker-compose.yml` no longer supplies a default
value for `PUBLIC_BASE_URL` that names any real deployment. An unset value
now fails at the point of use rather than silently resolving to whatever
the previous default happened to be — the same fail-fast pattern already
used for `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` in
`src/config/settings.py` (`validate_cf_access_settings`): refusing to start
is strictly better than starting with a value that is wrong in a way nobody
will notice until a label is printed. Set `PUBLIC_BASE_URL` explicitly for
this deployment before generating any label.

### Cloudflare tunnel hostname

**Where it lives.** This is **not** an environment variable in this repo.
It is configured entirely inside `cloudflared`'s own config (a host
`systemd` service on the reference deployment, `~/.cloudflared/config.yml`
there — your deployment's process manager and file location will likely
differ). This repo has no record of it and cannot validate it.

**What it must agree with.** This hostname is what the tunnel publishes to
the internet; `PUBLIC_BASE_URL` is what the application believes its own
public address is. If the two disagree — for example the tunnel publishes
`app.example.com` but `PUBLIC_BASE_URL` is still set to a different host —
users reach the app at one address while every printed label points at
another. Keep both values in the table above so the mismatch is checkable
in one place instead of two systems that never talk to each other.

### Zero Trust team domain and AUD tag

These gate Cloudflare Access, not label printing, but they are equally
deployment-specific and equally unsafe to leave defaulted or copied from a
reference. The full setup walkthrough — creating the Access application,
ordering the Bypass/Allow policies, and wiring `CF_ACCESS_TEAM_DOMAIN` /
`CF_ACCESS_AUD` — lives in
[Cloudflare-Access-Setup.md](./Cloudflare-Access-Setup.md); this document
only tracks the resulting values so they sit alongside the rest of this
deployment's identity. Do not duplicate that setup procedure here.

### Container name prefix

**Where it comes from.** The prefix on every container name (`<prefix>-api-1`,
`<prefix>-mongodb-1`, etc.) is set by Docker Compose's project name — by
default, the directory name the compose file lives in, or an explicit
`COMPOSE_PROJECT_NAME`/`-p` override. It is **not** guaranteed to be
`a64coreplatform-` outside of the reference deployment, and no doc or
command in this repo should assume it is.

**How to find it on any box.** Run `docker ps --format '{{.Names}}'` and
read off whatever precedes `-api-1` in the actual output. See the `CLAUDE.md`
"Server & Git" section for how this feeds every `docker restart` / `docker
exec` command in day-to-day operation.

### Admin contact

Not a technical value, but still deployment-specific: whoever can change
Cloudflare DNS, the Access policy, or the server's environment for this
particular deployment. Record it so a locked-out operator knows who to
escalate to instead of guessing it's the same person as another
deployment's admin.

## The rule: no default may name another live deployment

Any config value that is allowed to default must default to something
inert — empty, `localhost`, or a value that fails loudly — never to another
deployment's real hostname, tunnel address, or credential. This applies to
every value in the table above and to any future one like it. Concretely:

- `PUBLIC_BASE_URL` has no built-in default naming a real host; an unset
  value must fail at the point of use rather than silently resolving to a
  previous example.
- `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` default to empty strings, and
  `src/config/settings.py` refuses to boot with Access enabled and either
  one blank (see [Cloudflare-Access-Setup.md](./Cloudflare-Access-Setup.md)).
- Any new deployment-identity variable added later should be reviewed
  against this same rule before it ships: could its default, unedited, be
  mistaken for a working value on a different box? If yes, it needs a
  fail-fast check instead of a default.

The point is not to make every deployment configure everything from
scratch with no guidance — the reference-deployment rows throughout this
repo exist to show a *working example*. The point is that copying an
example value and never revisiting it must be caught, not rewarded with a
deployment that appears to work while quietly pointing at someone else's
server.

## Checking what this box resolved to

`scripts/preflight.sh` runs the discovery steps described in `CLAUDE.md`'s
"Server & Git" section (hostname, container prefix from `docker ps`, and
the API's configured `PUBLIC_BASE_URL`) and prints what the current box
actually resolved to. Run it before trusting any doc's example values on an
unfamiliar box, and before generating the first label on a newly-configured
deployment.

## See Also

- [Cloudflare-Access-Setup.md](./Cloudflare-Access-Setup.md) — the full
  Access setup walkthrough for the Zero Trust team domain and AUD tag
  tracked in this document.
- [Deployment-Modes.md](./Deployment-Modes.md) — ops-only vs. full-stack
  compose invocations (a different axis of deployment variation: which
  services run, not which machine or hostname).
- [`CLAUDE.md`](../../CLAUDE.md) — "Server & Git" section: the discovery
  steps and command patterns (`docker restart <prefix>-api-1`, etc.) that
  consume the values tracked here.
