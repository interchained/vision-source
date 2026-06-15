"""Pool Operator Snapshot Rewards routes.

Two surfaces:
  • Admin (``/api/admin/snapshots*``) — create/run snapshots, change status,
    manage per-pool entries, export CSV. Guarded by X-Admin-Token.
  • Public (``/api/pools/snapshots*``) — read-only transparency view of past
    snapshots and their per-pool rewards.
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from ..config import settings
from ..middleware.admin_auth import require_admin
from ..rpc.client import RPCConnectionError, RPCError
from ..services.pool_rewards import (
    SnapshotError,
    execute_snapshot,
    itc_str_to_sats,
    prepare_snapshot,
)
from ..sqlite_store import get_db

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/admin/snapshots", tags=["admin"], dependencies=[Depends(require_admin)])
public_router = APIRouter(prefix="/pools", tags=["pools"])

_SNAPSHOT_STATUSES = {"draft", "generated", "approved", "paid", "rejected"}
# Every status a snapshot row can actually hold — includes the internal
# ``draft``/``failed`` states that admins can't *set* but the cleanup endpoint
# must be allowed to *target*.
_ALL_SNAPSHOT_STATUSES = _SNAPSHOT_STATUSES | {"failed"}
_ENTRY_STATUSES = {"pending", "approved", "paid", "rejected"}

# Strong references to in-flight background scan tasks so they aren't
# garbage-collected mid-run (asyncio only holds weak refs to bare tasks).
_BACKGROUND_TASKS: set[asyncio.Task] = set()


class SnapshotIn(BaseModel):
    snapshot_name: str = Field(min_length=1, max_length=160)
    start_height: int = Field(ge=0)
    end_height: int = Field(ge=0)
    reward_per_block: str = Field(default=settings.POOL_REWARD_PER_BLOCK)
    notes: Optional[str] = Field(default=None, max_length=2000)
    allow_duplicate: bool = False


class SnapshotStatusIn(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _v(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in _SNAPSHOT_STATUSES:
            raise ValueError(f"status must be one of {sorted(_SNAPSHOT_STATUSES)}")
        return v


class CleanupIn(BaseModel):
    """Bulk-delete snapshots by status. Defaults to the leftover/failed states a
    re-run leaves behind, so a bare ``POST /cleanup`` is safe."""
    statuses: list[str] = Field(default_factory=lambda: ["failed", "draft"])

    @field_validator("statuses")
    @classmethod
    def _v(cls, v: list[str]) -> list[str]:
        out = []
        for s in v or []:
            s = (s or "").strip().lower()
            if s and s not in _ALL_SNAPSHOT_STATUSES:
                raise ValueError(f"status must be one of {sorted(_ALL_SNAPSHOT_STATUSES)}")
            if s:
                out.append(s)
        if not out:
            raise ValueError("statuses must contain at least one valid status")
        return out


class EntryUpdateIn(BaseModel):
    status: Optional[str] = None
    txid: Optional[str] = Field(default=None, max_length=120)

    @field_validator("status")
    @classmethod
    def _v(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in _ENTRY_STATUSES:
            raise ValueError(f"status must be one of {sorted(_ENTRY_STATUSES)}")
        return v


# ── admin ──────────────────────────────────────────────────────────────────

@admin_router.post("", status_code=202)
async def create_snapshot(body: SnapshotIn):
    """Create a snapshot and start scanning in the background.

    Validation + the draft row are created synchronously (fast), then the heavy
    block scan runs as a background task. We return ``202`` immediately with the
    ``draft`` snapshot so the request never blocks long enough to trip the
    proxy's 502 timeout. The admin UI polls ``GET /admin/snapshots/{id}`` until
    the status flips ``draft → generated`` (or ``failed``).
    """
    store = get_db()
    try:
        snap = await prepare_snapshot(
            store,
            snapshot_name=body.snapshot_name.strip(),
            start_height=body.start_height,
            end_height=body.end_height,
            reward_per_block=body.reward_per_block,
            notes=(body.notes.strip() if body.notes else None),
            allow_duplicate=body.allow_duplicate,
        )
    except SnapshotError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RPCConnectionError as e:
        raise HTTPException(status_code=503, detail=f"ITC node unreachable: {e}")
    except RPCError as e:
        raise HTTPException(status_code=502, detail=f"RPC error: {e}")

    # Fire-and-forget the scan; it owns its own error handling (marks the
    # snapshot ``failed`` on any exception). Keep a reference so the task isn't
    # garbage-collected before it runs.
    task = asyncio.create_task(execute_snapshot(store, snap["id"]))
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)

    return {"snapshot": snap, "entries": []}


@admin_router.post("/cleanup")
async def cleanup_snapshots(body: CleanupIn = CleanupIn()):
    """Bulk-delete leftover snapshots (default: ``failed`` + ``draft``) and their
    derived entries/blocks. Backs the ``cleanup_snapshots.sh`` script so cleanup
    runs through the backend that owns the DB (no second-process lock contention)."""
    store = get_db()
    deleted = await store.snapshots_delete_by_status(body.statuses)
    return {"ok": True, "deleted": deleted, "statuses": body.statuses}


@admin_router.get("")
async def list_snapshots(limit: int = 100, offset: int = 0):
    store = get_db()
    return {"snapshots": await store.snapshot_list(limit=min(limit, 500), offset=offset)}


@admin_router.delete("/{snapshot_id}")
async def delete_snapshot(snapshot_id: int):
    """Delete a single snapshot and its derived entries/blocks."""
    store = get_db()
    ok = await store.snapshot_delete(snapshot_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    return {"ok": True, "deleted": snapshot_id}


@admin_router.get("/{snapshot_id}")
async def get_snapshot(snapshot_id: int):
    store = get_db()
    snap = await store.snapshot_get(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    entries = await store.entries_list(snapshot_id)
    return {"snapshot": snap, "entries": entries}


@admin_router.put("/{snapshot_id}")
async def set_snapshot_status(snapshot_id: int, body: SnapshotStatusIn):
    store = get_db()
    snap = await store.snapshot_get(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    await store.snapshot_set_status(snapshot_id, body.status)
    # Cascade approve/paid/rejected to all entries for convenience.
    if body.status in ("approved", "paid", "rejected"):
        await store.entries_set_status_all(snapshot_id, body.status)
    return await store.snapshot_get(snapshot_id)


@admin_router.put("/{snapshot_id}/entries/{entry_id}")
async def update_entry(snapshot_id: int, entry_id: int, body: EntryUpdateIn):
    store = get_db()
    entry = await store.entry_get(entry_id)
    if not entry or entry["snapshot_id"] != snapshot_id:
        raise HTTPException(status_code=404, detail="Entry not found.")
    ok = await store.entry_update(
        entry_id,
        status=body.status,
        txid=(body.txid.strip() if body.txid else None),
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    return await store.entry_get(entry_id)


@admin_router.get("/{snapshot_id}/blocks")
async def snapshot_blocks(snapshot_id: int, pool_id: Optional[int] = None):
    store = get_db()
    snap = await store.snapshot_get(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    return {"blocks": await store.reward_blocks_list(snapshot_id, pool_id=pool_id)}


def _csv_response(rows: list[list], header: list[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@admin_router.get("/{snapshot_id}/export.csv")
async def export_snapshot_csv(snapshot_id: int):
    """Detailed per-pool results CSV (audit / record-keeping)."""
    store = get_db()
    snap = await store.snapshot_get(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    entries = await store.entries_list(snapshot_id)
    header = [
        "pool_name", "payout_address", "blocks_found",
        "reward_per_block", "total_reward", "total_reward_sats", "status", "txid",
    ]
    rows = [
        [
            e["pool_name"], e.get("payout_address") or "", e["blocks_found"],
            e["reward_per_block"], e["total_reward"], itc_str_to_sats(e["total_reward"]),
            e["status"], e.get("txid") or "",
        ]
        for e in entries
    ]
    return _csv_response(rows, header, f"snapshot_{snapshot_id}_results.csv")


@admin_router.get("/{snapshot_id}/payouts.csv")
async def export_payouts_csv(snapshot_id: int):
    """Payout-ready CSV: payout_address + payout_amount (and satoshis).

    This is the end-of-week sheet the operator feeds into the bulk payout
    process. Amounts are pre-calculated at satoshi precision via Decimal.
    Entries with no payout address or zero reward are skipped.
    """
    store = get_db()
    snap = await store.snapshot_get(snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    entries = await store.entries_list(snapshot_id)
    header = ["payout_address", "payout_amount", "payout_amount_sats", "pool_name", "blocks_found"]
    rows = []
    for e in entries:
        addr = e.get("payout_address")
        if not addr:
            continue
        sats = itc_str_to_sats(e["total_reward"])
        if sats <= 0:
            continue
        rows.append([addr, e["total_reward"], sats, e["pool_name"], e["blocks_found"]])
    return _csv_response(rows, header, f"snapshot_{snapshot_id}_payouts.csv")


# ── public ─────────────────────────────────────────────────────────────────

class PoolApplicationIn(BaseModel):
    """Public grant application submitted by a mining pool operator."""
    pool_name: str = Field(min_length=1, max_length=120)
    payout_address: str = Field(min_length=4, max_length=120)
    coinbase_tag: Optional[str] = Field(default=None, max_length=120)
    website: Optional[str] = Field(default=None, max_length=255)
    contact_email: Optional[str] = Field(default=None, max_length=255)
    discord: Optional[str] = Field(default=None, max_length=255)
    telegram: Optional[str] = Field(default=None, max_length=255)


def _clean_opt(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


@public_router.post("/apply")
async def apply_for_grant(body: PoolApplicationIn):
    """Operator-submitted application. Creates a pool in ``pending`` status for
    admin review — never auto-activates. Deduped by payout address against pools
    that are already ``active`` or ``pending`` (a ``rejected``/``disabled`` pool
    may re-apply)."""
    store = get_db()
    payout = body.payout_address.strip()
    name = body.pool_name.strip()
    if not payout:
        raise HTTPException(status_code=400, detail="Payout address is required.")

    existing = await store.pool_find_by_payout_address(
        payout, statuses=("active", "pending"),
    )
    if existing:
        if existing["status"] == "active":
            raise HTTPException(
                status_code=409,
                detail="This payout address is already registered as an active grant recipient.",
            )
        raise HTTPException(
            status_code=409,
            detail="An application for this payout address is already pending review.",
        )

    data = {
        "pool_name": name,
        "coinbase_tag": _clean_opt(body.coinbase_tag),
        "payout_address": payout,
        "website": _clean_opt(body.website),
        "contact_email": _clean_opt(body.contact_email),
        "discord": _clean_opt(body.discord),
        "telegram": _clean_opt(body.telegram),
        "status": "pending",
    }
    try:
        await store.pool_create(data)
    except Exception:
        logger.exception("Pool application failed for %s", payout)
        raise HTTPException(status_code=500, detail="Could not submit application. Please try again.")
    # Minimal confirmation — do not echo back stored record.
    return {"ok": True, "status": "pending", "pool_name": name}


@public_router.get("/snapshots")
async def public_snapshots(limit: int = 50, offset: int = 0):
    store = get_db()
    snaps = await store.snapshot_list(limit=min(limit, 200), offset=offset)
    # Public view only exposes generated/approved/paid snapshots.
    visible = [s for s in snaps if s["status"] in ("generated", "approved", "paid")]
    return {"snapshots": visible}


@public_router.get("/snapshots/{snapshot_id}")
async def public_snapshot(snapshot_id: int):
    store = get_db()
    snap = await store.snapshot_get(snapshot_id)
    if not snap or snap["status"] not in ("generated", "approved", "paid"):
        raise HTTPException(status_code=404, detail="Snapshot not found.")
    entries = await store.entries_list(snapshot_id)
    # Public entries omit internal fields; expose only transparency-relevant data.
    public_entries = [
        {
            "pool_name": e["pool_name"],
            "payout_address": e.get("payout_address"),
            "blocks_found": e["blocks_found"],
            "reward_per_block": e["reward_per_block"],
            "total_reward": e["total_reward"],
            "status": e["status"],
            "txid": e.get("txid"),
        }
        for e in entries
    ]
    return {"snapshot": snap, "entries": public_entries}
