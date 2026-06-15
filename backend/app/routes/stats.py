from __future__ import annotations

import asyncio
import json
import logging
import time

from fastapi import APIRouter, HTTPException

from ..sqlite_store import Keys, get_db as get_redis
from ..rpc.client import get_rpc, RPCError
from ..rpc.methods import BlockchainRPC
from ..services.price import get_cached_price
from ..utils.emission import total_supply_at

router = APIRouter()
logger = logging.getLogger(__name__)

# In-process lock to ensure only one gettxoutsetinfo runs at a time even if
# multiple /stats/supply requests arrive concurrently. The RPC scans the
# entire UTXO set and is expensive — serialise + cache aggressively.
_supply_lock = asyncio.Lock()
SUPPLY_CACHE_TTL = 300  # 5 minutes


def _deterministic_supply_at(height: int) -> int:
    """Σ block subsidy from 0..height using the real ITC emission formula."""
    return total_supply_at(height)


@router.get("/stats/network")
async def network_stats():
    rpc = BlockchainRPC(get_rpc())
    info = await rpc.get_blockchain_info()
    mining = await rpc.get_mining_info()
    network = await rpc.get_network_info()
    redis = get_redis()
    mempool_raw = await redis.get(Keys.MEMPOOL_SUMMARY)
    mempool_summary = json.loads(mempool_raw) if mempool_raw else None

    return {
        "chain": info.get("chain"),
        "tip_height": info.get("blocks"),
        "headers": info.get("headers"),
        "tip_hash": info.get("bestblockhash"),
        "difficulty": info.get("difficulty"),
        "median_time": info.get("mediantime"),
        "verification_progress": info.get("verificationprogress"),
        "size_on_disk": info.get("size_on_disk"),
        "pruned": info.get("pruned", False),
        "warnings": info.get("warnings"),
        "hashps_120": mining.get("networkhashps"),
        "tx_pool_size": mining.get("pooledtx"),
        "subversion": network.get("subversion"),
        "protocol_version": network.get("protocolversion"),
        "connections": network.get("connections"),
        "mempool": mempool_summary,
    }


@router.get("/stats/price")
async def price():
    p = await get_cached_price()
    if p is None:
        return {"available": False}
    return {"available": True, **p}


@router.get("/stats/supply")
async def supply():
    """Circulating ITC supply.

    Source priority:
      1. Fresh cached gettxoutsetinfo (≤ SUPPLY_CACHE_TTL old) — exact.
      2. Run gettxoutsetinfo now (slow, single-flight via lock) — exact.
      3. Deterministic Σ-subsidy fallback — fast, ignores burnt/unspendable.

    Returns a stable shape regardless of source so the UI can render
    immediately; `source` and `stale` flags let callers decide how to
    label it.
    """
    redis = get_redis()
    raw = await redis.get(Keys.SUPPLY_INFO)
    now = time.time()
    if raw:
        try:
            cached = json.loads(raw)
            age = now - float(cached.get("computed_at", 0))
            if age < SUPPLY_CACHE_TTL:
                cached["age_seconds"] = int(age)
                cached["stale"] = False
                return cached
        except (ValueError, TypeError):
            pass

    rpc_client = get_rpc()
    rpc = BlockchainRPC(rpc_client)

    # Single-flight gettxoutsetinfo
    async with _supply_lock:
        # Re-check cache inside the lock (another caller may have populated it)
        raw = await redis.get(Keys.SUPPLY_INFO)
        if raw:
            try:
                cached = json.loads(raw)
                age = now - float(cached.get("computed_at", 0))
                if age < SUPPLY_CACHE_TTL:
                    cached["age_seconds"] = int(age)
                    cached["stale"] = False
                    return cached
            except (ValueError, TypeError):
                pass

        try:
            info = await asyncio.wait_for(rpc.get_tx_out_set_info(), timeout=60)
            total_btc = float(info.get("total_amount", 0))
            circulating_sats = int(round(total_btc * 100_000_000))
            payload = {
                "circulating_sats": circulating_sats,
                "height": info.get("height"),
                "txouts": info.get("txouts"),
                "computed_at": now,
                "source": "gettxoutsetinfo",
                "stale": False,
                "age_seconds": 0,
            }
            await redis.set(Keys.SUPPLY_INFO, json.dumps(payload), ex=SUPPLY_CACHE_TTL * 4)
            return payload
        except (asyncio.TimeoutError, RPCError, Exception) as e:
            logger.warning("gettxoutsetinfo failed (%s); falling back to deterministic", e)
            try:
                tip = await rpc.get_block_count()
            except Exception:
                tip = 0
            payload = {
                "circulating_sats": _deterministic_supply_at(int(tip or 0)),
                "height": tip,
                "txouts": None,
                "computed_at": now,
                "source": "deterministic",
                "stale": True,
                "age_seconds": 0,
            }
            # Cache the fallback briefly so repeated failures don't hammer the node
            await redis.set(Keys.SUPPLY_INFO, json.dumps(payload), ex=60)
            return payload


@router.get("/hashrate")
async def hashrate():
    """Network hashrate — 120-block rolling average, in H/s."""
    rpc = BlockchainRPC(get_rpc())
    mining = await rpc.get_mining_info()
    hps = mining.get("networkhashps") or 0
    # Human-readable label
    if hps >= 1e18:
        label = f"{hps/1e18:.2f} EH/s"
    elif hps >= 1e15:
        label = f"{hps/1e15:.2f} PH/s"
    elif hps >= 1e12:
        label = f"{hps/1e12:.2f} TH/s"
    elif hps >= 1e9:
        label = f"{hps/1e9:.2f} GH/s"
    else:
        label = f"{hps:.0f} H/s"
    return {"hashrate": hps, "label": label, "window_blocks": 120}


@router.get("/difficulty")
async def difficulty():
    """Current proof-of-work difficulty."""
    rpc = BlockchainRPC(get_rpc())
    info = await rpc.get_blockchain_info()
    return {"difficulty": info.get("difficulty"), "tip_height": info.get("blocks")}


@router.get("/blockcount")
async def blockcount():
    """Current tip height as a plain integer — useful for scripts and widgets."""
    rpc = BlockchainRPC(get_rpc())
    height = await rpc.get_block_count()
    return height


@router.get("/circulatingsupply")
async def circulating_supply_plain():
    """Circulating supply in ITC as a plain number — compatible with
    CoinMarketCap / CoinGecko supply endpoint conventions."""
    redis = get_redis()
    raw = await redis.get(Keys.SUPPLY_INFO)
    now = time.time()
    if raw:
        try:
            cached = json.loads(raw)
            age = now - float(cached.get("computed_at", 0))
            if age < SUPPLY_CACHE_TTL:
                sats = cached.get("circulating_sats", 0)
                return round(sats / 1e8, 8)
        except (ValueError, TypeError):
            pass
    # Fall back to deterministic supply from tip height
    rpc = BlockchainRPC(get_rpc())
    try:
        tip = await rpc.get_block_count()
    except Exception:
        tip = 0
    return round(_deterministic_supply_at(int(tip or 0)) / 1e8, 8)


@router.get("/stats/indexer")
def indexer_status():
    """Synchronous endpoint — runs in FastAPI's threadpool so it bypasses
    the asyncio event loop entirely and always responds even when the
    indexer is saturating it.

    Falls back gracefully through three levels:
      1. Read the full status JSON from kv.
      2. If that row can't be read (lock or missing), read just
         vision:indexer:last_height and synthesise a status — better than
         lying with phase=starting which keeps the splash up forever.
      3. If even that fails, return phase=db_locked so the frontend knows
         this is contention, not a cold start.
    """
    import sqlite3
    from ..config import settings

    db_path = str(settings.SQLITE_DB_PATH)

    def _open():
        # isolation_level=None  → autocommit; matches sqlite_store.py.
        # timeout=10  → wait up to 10s on the SQLite busy handler before
        # giving up (was 2s, which is shorter than a typical indexer
        # apply_block batch and so produced spurious "starting" responses).
        c = sqlite3.connect(db_path, timeout=10, isolation_level=None)
        c.execute("PRAGMA busy_timeout=10000")
        return c

    # Level 1 — full status object
    try:
        conn = _open()
        try:
            cur = conn.execute(
                "SELECT value FROM kv WHERE key = ?", ("vision:indexer:status",)
            )
            row = cur.fetchone()
            if row and row[0]:
                return json.loads(row[0])
        finally:
            conn.close()
    except Exception:
        pass

    # Level 2 — synthesise from last_height alone
    try:
        conn = _open()
        try:
            cur = conn.execute(
                "SELECT value FROM kv WHERE key = ?",
                ("vision:indexer:last_height",),
            )
            row = cur.fetchone()
            if row and row[0]:
                last_h = int(row[0])
                return {
                    "phase": "syncing" if last_h > 0 else "starting",
                    "last_height": last_h,
                    "tip": last_h,
                    "degraded": True,
                }
        finally:
            conn.close()
    except Exception:
        pass

    # Level 3 — DB itself is unreachable / locked
    return {"phase": "db_locked", "last_height": 0, "tip": 0, "degraded": True}
