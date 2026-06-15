"""Admin routes — mining pool registry (Pool Operator Snapshot Rewards).

All routes require a valid ``X-Admin-Token`` (see middleware.admin_auth). Pool
metadata is trimmed/sanitised before persistence; output is JSON (the Next.js
frontend escapes on render).
"""

from __future__ import annotations

import logging
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel, Field, field_validator

from ..middleware.admin_auth import require_admin
from ..sqlite_store import get_db

router = APIRouter(prefix="/admin/pools", tags=["admin"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)

# Pool lifecycle: applied (pending) → active / rejected; active ↔ disabled.
_POOL_STATUSES = {"active", "disabled", "pending", "rejected"}


def _clean(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


class PoolIn(BaseModel):
    pool_name: str = Field(min_length=1, max_length=120)
    coinbase_tag: Optional[str] = Field(default=None, max_length=120)
    payout_address: Optional[str] = Field(default=None, max_length=120)
    website: Optional[str] = Field(default=None, max_length=255)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    discord: Optional[str] = Field(default=None, max_length=255)
    telegram: Optional[str] = Field(default=None, max_length=255)
    status: str = Field(default="active")

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str) -> str:
        v = (v or "active").strip().lower()
        if v not in _POOL_STATUSES:
            raise ValueError(f"status must be one of {sorted(_POOL_STATUSES)}")
        return v


class PoolUpdate(BaseModel):
    pool_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    coinbase_tag: Optional[str] = Field(default=None, max_length=120)
    payout_address: Optional[str] = Field(default=None, max_length=120)
    website: Optional[str] = Field(default=None, max_length=255)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    discord: Optional[str] = Field(default=None, max_length=255)
    telegram: Optional[str] = Field(default=None, max_length=255)
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in _POOL_STATUSES:
            raise ValueError(f"status must be one of {sorted(_POOL_STATUSES)}")
        return v


@router.get("")
async def list_pools(status: Optional[str] = None):
    store = get_db()
    return {"pools": await store.pool_list(status=status)}


@router.post("")
async def create_pool(body: PoolIn):
    store = get_db()
    data = {
        "pool_name": _clean(body.pool_name),
        "coinbase_tag": _clean(body.coinbase_tag),
        "payout_address": _clean(body.payout_address),
        "website": _clean(body.website),
        "contact_email": _clean(body.contact_email),
        "discord": _clean(body.discord),
        "telegram": _clean(body.telegram),
        "status": body.status,
    }
    # No two active pools may share a payout address — block attribution would
    # otherwise be ambiguous (last-write-wins in the match index).
    if data["payout_address"] and data["status"] == "active":
        dup = await store.pool_find_by_payout_address(data["payout_address"], active_only=True)
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"Payout address already used by active pool '{dup['pool_name']}'.",
            )
    try:
        pool_id = await store.pool_create(data)
    except sqlite3.IntegrityError:
        # Backstop for the read-then-write race: the partial unique index on
        # active payout addresses rejected the insert.
        raise HTTPException(
            status_code=409,
            detail="Payout address already used by an active pool.",
        )
    return await store.pool_get(pool_id)


@router.put("/{pool_id}")
async def update_pool(pool_id: int, body: PoolUpdate):
    store = get_db()
    existing = await store.pool_get(pool_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Pool not found.")
    data = {}
    for f in ("pool_name", "coinbase_tag", "payout_address", "website",
              "contact_email", "discord", "telegram"):
        val = getattr(body, f)
        if val is not None:
            data[f] = _clean(val)
    if body.status is not None:
        data["status"] = body.status
    # Enforce payout-address uniqueness among active pools for the *resulting*
    # state (after this update is applied).
    new_addr = data["payout_address"] if "payout_address" in data else existing.get("payout_address")
    new_status = data["status"] if "status" in data else existing.get("status")
    if new_addr and new_status == "active":
        dup = await store.pool_find_by_payout_address(
            new_addr, exclude_id=pool_id, active_only=True,
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"Payout address already used by active pool '{dup['pool_name']}'.",
            )
    if data:
        try:
            await store.pool_update(pool_id, data)
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=409,
                detail="Payout address already used by an active pool.",
            )
    return await store.pool_get(pool_id)
