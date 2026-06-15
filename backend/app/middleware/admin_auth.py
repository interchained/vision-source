"""Admin authentication for Pool Operator Snapshot Rewards routes.

A single shared secret (``settings.ADMIN_TOKEN``) guards every ``/api/admin/*``
write. The token is supplied by the client in the ``X-Admin-Token`` header and
compared in constant time.

Failure modes:
  • ADMIN_TOKEN unset  → 503 (the admin surface is intentionally locked, not
    open) so a misconfigured deploy never silently accepts writes.
  • header missing / mismatched → 401.
"""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from ..config import settings


async def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    configured = settings.ADMIN_TOKEN or ""
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin surface is locked: ADMIN_TOKEN is not configured on the server.",
        )
    supplied = x_admin_token or ""
    if not hmac.compare_digest(supplied, configured):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token.",
        )
