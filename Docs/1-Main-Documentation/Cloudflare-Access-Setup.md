# Cloudflare Access Setup — A64 Core Platform

**Status:** Active
**Audience:** Whoever has Cloudflare dashboard access for a given A64 deployment. No prior familiarity with this codebase is assumed.

This is a **repeatable runbook**, not a record of one box's configuration. Every deployment
of A64 has its own domain, its own Zero Trust team, and usually its own Cloudflare admin.
Fill in the [Deployment values](#deployment-values) table for your deployment first, then
follow the rest of the document — every step below refers back to that table instead of
hardcoding a hostname.

## Table of Contents
- [What This Does](#what-this-does)
- [Prerequisites](#prerequisites)
- [Deployment Values](#deployment-values)
- [Cloudflare Dashboard Setup](#cloudflare-dashboard-setup)
- [Application Configuration](#application-configuration)
- [First-Login / User Provisioning](#first-login--user-provisioning)
- [Rollout Phases](#rollout-phases)
- [Break-Glass Access](#break-glass-access)
- [Verification Checklist](#verification-checklist)
- [Rollback](#rollback)
- [Troubleshooting](#troubleshooting)

## What This Does

Cloudflare Access sits in front of the tunnel and authenticates the user at the edge —
before the request ever reaches the origin. On success it injects a signed RS256 JWT into
every request as the `Cf-Access-Jwt-Assertion` header (also set as the `CF_Authorization`
cookie in the browser).

The A64 backend:
1. Reads that header (or cookie) on a dedicated exchange endpoint.
2. Verifies the JWT's signature against the Zero Trust team's JWKS, and checks its
   `aud` (Application Audience) and `iss` (issuer) claims.
3. Maps the verified email to a `users` document (case-insensitive lookup).
4. Issues the app's **own** JWT — the same access/refresh token pair every other login
   path produces.

Everything downstream of that point — role checks, `organizationId`, `divisionAccess`,
permission middleware — is completely unchanged. **Cloudflare replaces the credential
check, not the session.** A user who signs in through Access ends up with the exact same
kind of app session as a user who signs in with email + password.

## Prerequisites

Before starting, you need:

- A Cloudflare account with **Zero Trust** enabled (free tier is sufficient for small teams).
- A `cloudflared` tunnel already publishing this deployment's hostname to the origin
  (i.e. the app is already reachable through Cloudflare — this runbook adds an auth layer
  in front of an existing tunnel, it does not create the tunnel).
- Owner or Super Admin access to the Zero Trust dashboard for the team that will protect
  this application.
- Access to the deployment's environment configuration (`.env` / compose file) and the
  ability to restart the API container.

**Reference for context only** — on the primary A64 deployment, `cloudflared` runs as a
host `systemd` service configured at `~/.cloudflared/config.yml`, publishing
`dev.a20core.com → http://localhost:80`. Your deployment's tunnel configuration,
process manager, and hostname will very likely differ — that is expected, and nothing
below depends on matching it.

## Deployment Values

Fill this in before touching the dashboard. Every later step in this document refers back
to these placeholders instead of a hardcoded value.

| Placeholder | What it is | This deployment's value |
|---|---|---|
| `<APP_HOSTNAME>` | The public hostname the tunnel publishes for this app | |
| `<TEAM_DOMAIN>` | Your Zero Trust team domain, format `<team>.cloudflareaccess.com` | |
| `<AUD_TAG>` | The Application Audience tag Cloudflare assigns this Access application | |
| `<IDP_NAME>` | The identity provider selected for the Allow policy (Google Workspace, One-time PIN, etc.) | |
| `<CF_ADMIN_CONTACT>` | Who owns the Cloudflare account / can change this app's policies | |

**Reference deployment (example only — do not copy these values into your own
deployment):**

| Placeholder | Reference value |
|---|---|
| `<APP_HOSTNAME>` | `dev.a20core.com` |

## Cloudflare Dashboard Setup

All of the following happens in **Zero Trust → Access → Applications**.

### 1. Create the application

**Add an application → Self-hosted.** Set the domain to `<APP_HOSTNAME>`. Give it a
recognizable name (e.g. "A64 Core Platform — `<APP_HOSTNAME>`").

### 2. Add the Bypass policy FIRST

> **⚠️ Do this before the Allow policy, and make sure it is ordered ABOVE it.**
> Cloudflare Access evaluates policies top-down and stops at the first match. If the
> Allow policy is evaluated first, or the Bypass policy doesn't exist at all, **every
> QR label on every vessel stops resolving for anyone outside the Access team** —
> including the people this feature exists for, who scan a label and are never going
> to be in your organization's Zero Trust team.

Create a policy:
- **Action:** `Bypass`
- **Include:** `Everyone`
- **Paths:** `/i/*` and `/api/v1/public/*`

These correspond to the frontend `GET /i/:token` label-info page and the backend
`GET /api/v1/public/genetics/i/{token}` API it calls. Both are intentionally
unauthenticated in the application itself — this policy is what keeps them that way once
Access is in front of the origin. Drag or reorder this policy so it sits **above** the
Allow policy in the list.

### 3. Add the Allow policy

Create a second policy below the Bypass policy:
- **Action:** `Allow`
- **Include:** whichever combination fits your organization — specific emails, an email
  domain (e.g. `@yourcompany.com`), or an IdP group.

> **MFA must be enforced here, in the Cloudflare policy.** The application itself no
> longer forces its own TOTP — two-factor authentication became **opt-in per user**
> (Settings → Security) once Access became the primary credential check. If you don't
> require a second factor in this policy, nobody signing in through Access is getting one
> unless they individually turned on app TOTP.

### 4. Select the identity provider

Under **Authentication**, choose the IdP for this application (Google Workspace, Azure AD,
GitHub, One-time PIN email, etc.) and complete whatever IdP-specific setup Cloudflare
prompts for. Record the choice as `<IDP_NAME>` in the table above.

### 5. Copy the Audience tag and team domain

- The **Application Audience (AUD) tag** is shown on the application's **Overview** tab
  after it is saved — copy it as `<AUD_TAG>`.
- The **team domain** is shown in **Settings → Custom Pages** (or in the URL of the Zero
  Trust dashboard itself) as `<team>.cloudflareaccess.com` — copy it as `<TEAM_DOMAIN>`.

## Application Configuration

Set these environment variables for the API service, using the values gathered above:

| Variable | Purpose | Safe default |
|---|---|---|
| `CF_ACCESS_ENABLED` | Turns the whole feature on. When `false`, the exchange endpoint 404s and nothing else changes. | `false` |
| `CF_ACCESS_TEAM_DOMAIN` | Your `<TEAM_DOMAIN>` — **host only, no scheme** (e.g. `myteam.cloudflareaccess.com`, not `https://myteam.cloudflareaccess.com`). Used to build the JWKS and issuer URLs. | *(empty)* |
| `CF_ACCESS_AUD` | Your `<AUD_TAG>`. The backend rejects any token whose `aud` claim doesn't match this exactly. | *(empty)* |
| `CF_ACCESS_EXCLUSIVE` | Phase 2 cutover flag. `false` = dual mode (Access and password login both work). `true` = password login/registration only work for requests that did not arrive through the tunnel. | `false` |
| `CF_ACCESS_JIT_PROVISION` | Whether an unrecognized but Access-verified email gets auto-created as a pending user. | `true` |
| `CF_ACCESS_DEFAULT_ROLE` | Role assigned to a JIT-provisioned account before an admin reassigns it. | `user` |

> **`CF_ACCESS_AUD` must never be left empty while `CF_ACCESS_ENABLED=true`.** An empty
> audience means the backend would accept a token minted for *any* Access application in
> your Cloudflare account, not just this one. The app refuses to boot in that state by
> design — this is a fail-fast validator, not a warning you can ignore.

After setting these, restart the API container:

```bash
docker restart a64coreplatform-api-1
```

The API container runs without `--reload`, so a settings or code change is invisible
until it restarts — this is true for every deployment, not just the reference box.

## First-Login / User Provisioning

The first time a given email authenticates through Access:

1. If no `users` document matches that email, one is created automatically
   (`CF_ACCESS_JIT_PROVISION=true`) with `isActive=false`, `authProvider="cloudflare_access"`,
   and the default role from `CF_ACCESS_DEFAULT_ROLE`.
2. The user lands on a "pending activation" screen — they are authenticated by Cloudflare,
   but the app has nothing to authorize them into yet.
3. A super_admin opens **Admin → User Management**, filters to **Pending activation**,
   and assigns the correct organization and division access, then activates the account.
4. On the next sign-in, the same email resolves to the now-active user and proceeds
   straight into the app.

This manual step exists because **Cloudflare has no concept of your app's roles,
organizations, or divisions** — it only vouches for the email address. Nothing here is
optional or skippable; every new Access identity needs an admin to bind it to the correct
tenant before it can do anything.

## Rollout Phases

**Phase 1 — dual mode.** `CF_ACCESS_ENABLED=true`, `CF_ACCESS_EXCLUSIVE=false`. Both the
"Sign in with Cloudflare Access" path and the existing email/password form are live.
Existing users keep working exactly as before; new Access identities go through JIT
provisioning above.

**Phase 2 — cutover.** Flip `CF_ACCESS_EXCLUSIVE=true` and restart the API container.
No code change is required. From this point, password login and registration only
succeed for requests that arrive **without** Cloudflare's edge headers — i.e. requests
that did not come through the tunnel. See [Break-Glass Access](#break-glass-access) for
why that's the intended behavior, not a bug.

## Break-Glass Access

Cloudflare Access only protects traffic that arrives **through the tunnel**. Anything that
reaches the origin another way — most commonly, browsing `http://localhost` directly on
the server itself — bypasses Access entirely. This is deliberate: it's the recovery path
if the Cloudflare configuration is broken, the Access policy locks everyone out, or
Cloudflare itself is unavailable.

The backend's discriminator for "did this arrive through Cloudflare" is **the presence of
Cloudflare's edge headers** (`Cf-Ray` / `Cf-Connecting-Ip`), **not source IP**. Source IP
cannot be used here: `cloudflared` connects to nginx over the Docker bridge network, so
from the origin's point of view every tunnel request already looks like it came from a
private address. An internet client cannot forge or strip Cloudflare's own headers, which
is what makes "headers absent" a reliable signal that a request is local rather than
tunnel traffic pretending to be local.

**Security consequence:** this recovery path only stays safe if the origin is genuinely
unreachable except through the tunnel. If a deployment exposes the origin's port directly
to the internet (port-forwarded router, cloud security group open on the app port, etc.),
anyone can reach it, skip Cloudflare Access altogether, and get exactly the same
break-glass treatment as the legitimate local recovery case. **The origin must only be
reachable via the tunnel** for this design to hold.

## Verification Checklist

Run through this after configuring both Cloudflare and the application:

- [ ] `GET https://<APP_HOSTNAME>/api/v1/auth/cf-access/status` returns
      `{"enabled": true, "exclusive": false}` (or `true` if you're doing the Phase 2
      cutover directly).
- [ ] Visiting `https://<APP_HOSTNAME>/i/<any-valid-token>` with no Access session renders
      the label-info page — it must **not** redirect to a Cloudflare login screen.
- [ ] Visiting `https://<APP_HOSTNAME>` with no existing app session prompts the
      configured IdP, and completing it lands directly on the app dashboard with no app
      login screen shown.
- [ ] Signing in with an email that has never logged in before shows the pending
      activation screen, and a matching `users` document with
      `authProvider: "cloudflare_access"`, `isActive: false` appears in MongoDB.
- [ ] After a super_admin activates that account from User Management, signing in again
      reaches the dashboard.
- [ ] Logging out and reloading does **not** silently sign back in.
- [ ] Existing password-based users can still log in with email + password (Phase 1) —
      or are correctly rejected through the tunnel and still work from the origin itself
      (Phase 2).

## Rollback

If anything above fails and you need to disable Access without touching Cloudflare's
dashboard:

```bash
# set in the API's environment
CF_ACCESS_ENABLED=false
```

```bash
docker restart a64coreplatform-api-1
```

This immediately 404s the exchange endpoint and returns the application to
password-only login for everyone, regardless of the Cloudflare-side policy configuration.
It does not undo anything in the Cloudflare dashboard — the Bypass/Allow policies can stay
in place harmlessly while you investigate.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Every sign-in attempt fails with a 401 from the exchange endpoint | `CF_ACCESS_AUD` doesn't match the application's actual Audience tag (wrong app, typo, or copied from a different Access application) | Re-copy the AUD tag from the application's Overview tab in Zero Trust; confirm no leading/trailing whitespace |
| JWKS verification errors / "unknown issuer" | `CF_ACCESS_TEAM_DOMAIN` is wrong, includes a scheme (`https://`), or has a typo | Set it to the bare host, e.g. `myteam.cloudflareaccess.com` — no `https://` prefix |
| QR labels (`/i/<token>`) redirect to a Cloudflare login page instead of rendering | The Bypass policy is missing, misconfigured, or ordered **below** the Allow policy | Re-check [step 2](#2-add-the-bypass-policy-first) — Bypass must exist for `/i/*` and `/api/v1/public/*`, and must be first in the policy list |
| User logs out but is immediately signed back in | The `CF_Authorization` cookie wasn't cleared — the app's logout flow must redirect through `/cdn-cgi/access/logout`, which it does automatically when the session originated from Access | Confirm the frontend build includes the CF-aware logout path; check the browser's cookies for a lingering `CF_Authorization` after logout |
| Password login stopped working everywhere, including from the server itself | `CF_ACCESS_EXCLUSIVE=true` was set, but the request used for testing still carried `Cf-Ray`/`Cf-Connecting-Ip` (e.g. testing through the tunnel instead of directly against the origin) | Test break-glass from a request that genuinely bypasses the tunnel (e.g. `curl http://localhost/api/v1/auth/login` on the origin host) |
| New Access identity never reaches "pending activation" — outright rejected | `CF_ACCESS_JIT_PROVISION=false` | Set to `true` if you want unknown Access-verified emails to auto-provision as pending; otherwise this is expected and the account must be created manually first |

## See Also

- [User-Structure.md](./User-Structure.md) — authentication flows, roles, and the full
  user lifecycle this feature plugs into.
- [Versioning.md](./Versioning.md) — version history.
- [CLAUDE.md](../../CLAUDE.md) — the `response_model` / container-restart gotchas
  referenced throughout this document.
