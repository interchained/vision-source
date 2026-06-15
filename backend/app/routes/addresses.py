from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..electrumx.client import ElectrumXError, get_electrumx
from ..models.address import (
    AddressBalance,
    AddressStats,
    AddressTokenBalance,
    AddressTx,
    AddressUtxo,
)
from ..sqlite_store import Keys, get_db as get_redis
from ..rpc.client import get_rpc
from ..rpc.tokens import TokenRPC
from ..utils.address import address_to_script_hash, is_valid_address

router = APIRouter()
logger = logging.getLogger(__name__)

_ZERO_BALANCE = AddressBalance(confirmed_sats=0, unconfirmed_sats=0)

# Fast fail for the optional ElectrumX top-up. Our local index is the
# source of truth — ElectrumX is only nice-to-have for mempool-only balance.
_ELECTRUMX_ROUTE_TIMEOUT = 0.8

# When ElectrumX times out we mark it as broken for a short window so the
# next request doesn't pay the same wait. Set to a few seconds — long
# enough to absorb a burst of page loads, short enough to recover quickly
# if the server comes back.
_ELECTRUMX_COOLDOWN_SECONDS = 30.0
_electrumx_blocked_until: float = 0.0


async def _electrumx_safe(coro):
    return await asyncio.wait_for(coro, timeout=_ELECTRUMX_ROUTE_TIMEOUT)


async def _label_for(address: str) -> Optional[dict]:
    redis = get_redis()
    members = await redis.smembers(Keys.SPECIAL_ADDRESSES)
    for m in members:
        try:
            w = json.loads(m)
        except Exception:
            continue
        if w.get("address") == address:
            return w
    return None


async def _index_status() -> dict:
    """Fetch the address-index sync status (phase, last_height, tip)."""
    db = get_redis()
    try:
        raw = await db.get(Keys.ADDRESS_INDEX_STATUS)
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


async def _try_unconfirmed_balance(addr: str) -> int:
    """Best-effort mempool balance via ElectrumX. Returns 0 if unavailable.

    Uses a short timeout and a process-wide cooldown so a slow upstream
    never blocks the page. If the call times out, we mark ElectrumX as
    broken for ``_ELECTRUMX_COOLDOWN_SECONDS`` and fall through immediately
    on subsequent requests."""
    global _electrumx_blocked_until
    now = asyncio.get_event_loop().time()
    if now < _electrumx_blocked_until:
        return 0
    sh = address_to_script_hash(addr)
    if sh is None:
        return 0
    try:
        elec = get_electrumx()
        bal = await _electrumx_safe(elec.get_balance(sh))
        return int(bal.get("unconfirmed", 0))
    except (asyncio.TimeoutError, ElectrumXError, Exception):
        _electrumx_blocked_until = now + _ELECTRUMX_COOLDOWN_SECONDS
        return 0


@router.get("/address/{addr}", response_model=AddressStats)
async def address_stats(addr: str):
    if not is_valid_address(addr):
        raise HTTPException(400, "Invalid address format")

    db = get_redis()
    label_info = await _label_for(addr)

    # Local index — authoritative, always serves something even if 0.
    confirmed, _received = await db.address_balance(addr)
    tx_count = await db.address_tx_count(addr)
    first_h, last_h = await db.address_first_last_height(addr)

    # Mempool top-up via ElectrumX. Cheap to try, harmless to skip.
    unconfirmed = await _try_unconfirmed_balance(addr)

    return AddressStats(
        address=addr,
        valid=True,
        balance=AddressBalance(
            confirmed_sats=confirmed,
            unconfirmed_sats=unconfirmed,
        ),
        tx_count=tx_count,
        label=label_info.get("label") if label_info else None,
        is_special=label_info is not None,
        first_seen_height=first_h,
        last_seen_height=last_h,
        electrumx_available=True,
    )


@router.get("/address/{addr}/txs")
async def address_txs(addr: str, limit: int = Query(50, ge=1, le=500), offset: int = 0):
    if not is_valid_address(addr):
        raise HTTPException(400, "Invalid address format")

    db = get_redis()
    rows = await db.address_txs(addr, limit=limit, offset=offset)
    total = await db.address_tx_count(addr)

    items = [
        AddressTx(
            txid=r["txid"],
            height=r["height"],
            fee_sats=None,  # not tracked yet — would require per-tx fee join
        ).model_dump()
        for r in rows
    ]
    # Augment with in/out totals so the UI can render directional badges.
    for item, r in zip(items, rows):
        item["in_sats"] = r["in_sats"]
        item["out_sats"] = r["out_sats"]
        item["block_time"] = r["block_time"]

    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
        "electrumx_available": True,
        "index": await _index_status(),
    }


@router.get("/address/{addr}/utxos")
async def address_utxos(addr: str):
    if not is_valid_address(addr):
        raise HTTPException(400, "Invalid address format")
    db = get_redis()
    rows = await db.address_utxos(addr)
    items = [
        AddressUtxo(
            txid=r["txid"],
            vout=r["vout"],
            height=r["height"],
            value_sats=r["value_sats"],
        ).model_dump()
        for r in rows
    ]
    return {
        "items": items,
        "total": len(items),
        "electrumx_available": True,
        "index": await _index_status(),
    }


@router.get("/address/{addr}/tokens")
async def address_tokens(addr: str):
    """List ITSL token balances for this address."""
    if not is_valid_address(addr):
        raise HTTPException(400, "Invalid address format")
    rpc = TokenRPC(get_rpc())
    redis = get_redis()
    try:
        raw = await redis.get(Keys.TOKEN_REGISTRY)
        tokens = json.loads(raw) if raw else (await rpc.all_tokens() or [])
    except Exception:
        tokens = []

    async def _one(tok: dict) -> Optional[AddressTokenBalance]:
        token_id = tok.get("address") or tok.get("id") or tok.get("token_id")
        if not token_id:
            return None
        try:
            history = await rpc.token_history(token_id, addr)
        except Exception:
            history = None
        if not history:
            return None
        try:
            bal = await rpc.get_token_balance_of(token_id, addr)
        except Exception:
            bal = "0"
        if bal in (None, "0", 0):
            return None
        return AddressTokenBalance(
            token_id=token_id,
            name=tok.get("name", ""),
            symbol=tok.get("symbol", ""),
            decimals=int(tok.get("decimals", 0) or 0),
            balance=str(bal),
            verified=bool(tok.get("verified", False)),
        )

    sem = asyncio.Semaphore(8)

    async def _bounded(tok):
        async with sem:
            return await _one(tok)

    try:
        results = await asyncio.gather(*[_bounded(t) for t in tokens], return_exceptions=False)
        holdings = [r.model_dump() for r in results if r]
    except Exception:
        holdings = []

    return {"items": holdings, "total": len(holdings)}


@router.get("/address-index/status")
async def address_index_status():
    """Expose the address-index backfill progress so the UI can render
    a "still indexing" state for empty pre-backfill addresses."""
    return await _index_status()
