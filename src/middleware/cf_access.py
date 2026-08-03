"""
Cloudflare Access request helpers.

These helpers do NOT verify anything — services.cf_access_service.verify_cf_access_token
is the only place that decides whether a token is genuine. This module only
(1) extracts the token from wherever Cloudflare Access puts it on a request,
and (2) distinguishes a request that arrived through the Cloudflare tunnel
from one that reached this box directly, for the break-glass gate on
POST /login and POST /register in api/v1/auth.py.
"""

from typing import Optional

from fastapi import Request

_TOKEN_HEADER = "Cf-Access-Jwt-Assertion"
_TOKEN_COOKIE = "CF_Authorization"

_CF_EDGE_HEADERS = ("cf-ray", "cf-connecting-ip")


def get_cf_access_token(request: Request) -> Optional[str]:
    """
    Extract the Cloudflare Access JWT from the current request, if present.

    Checks the `Cf-Access-Jwt-Assertion` header first — set by Cloudflare on
    every request it proxies onto the tunnel — falling back to the
    `CF_Authorization` cookie, which Access also sets and which some
    same-origin browser navigations carry instead of (or in addition to)
    the header.

    Args:
        request: The incoming FastAPI request.

    Returns:
        The raw JWT string, or None if neither is present.
    """
    header_token = request.headers.get(_TOKEN_HEADER)
    if header_token:
        return header_token
    return request.cookies.get(_TOKEN_COOKIE)


def is_local_request(request: Request) -> bool:
    """
    True when this request did NOT arrive through the Cloudflare tunnel.

    This is the break-glass discriminator for CF_ACCESS_EXCLUSIVE: once that
    flag is set, password login/registration stay reachable only for
    requests this function calls local.

    Why not source IP: `cloudflared` runs as a host systemd service and
    connects to nginx from the Docker bridge network, so the source IP of
    tunnel traffic is always a private address — indistinguishable from any
    other container-to-container call on this box. It carries no signal
    about whether the original client was on the internet.

    Why headers instead: Cloudflare Access stamps `Cf-Ray` and
    `Cf-Connecting-Ip` on every request it proxies onto the tunnel, and an
    internet client reaching this box through Cloudflare cannot strip or
    forge their absence — Cloudflare's edge sets them, the client doesn't.
    So their absence reliably means the request reached nginx some other
    way (e.g. directly on http://localhost, the intended break-glass path),
    and their presence reliably means it came through Cloudflare.

    Args:
        request: The incoming FastAPI request.

    Returns:
        True if neither edge header is present on the request.
    """
    headers = request.headers  # Starlette Headers: lookups are case-insensitive
    return not any(header in headers for header in _CF_EDGE_HEADERS)
