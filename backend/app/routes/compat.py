"""btc-rpc-explorer compatible API endpoints.

Adds routes that mirror the janoside/btc-rpc-explorer public API so that
existing bots, apps, and scripts built for that explorer work against Vision
without modification.

All routes are registered under /api (same prefix as the rest of Vision).
"""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Path

from ..rpc.client import RPCConnectionError, RPCError, get_rpc
from ..rpc.methods import BlockchainRPC
from ..services.mempool import build_mempool_summary, project_blocks
from ..sqlite_store import Keys, get_db as get_redis
from ..utils.emission import get_block_subsidy

router = APIRouter()
logger = logging.getLogger(__name__)

# ITC network constants
_DIFF_RETARGET_INTERVAL = 2016  # blocks between difficulty retargets
_TARGET_BLOCK_TIME = 60        # seconds (1 min target)


def _is_hash(s: str) -> bool:
    return len(s) == 64 and all(c in "0123456789abcdefABCDEF" for c in s)


# ---------------------------------------------------------------------------
# /api/blocks/tip/height
# ---------------------------------------------------------------------------


@router.get("/blocks/tip/height")
async def tip_height():
    """Returns the current best block height as a plain integer."""
    rpc = BlockchainRPC(get_rpc())
    redis = get_redis()
    try:
        height = await rpc.get_block_count()
        return height
    except Exception:
        h = await redis.get(Keys.TIP_HEIGHT)
        if h is not None:
            return int(h)
        raise HTTPException(503, "Chain tip unavailable")


# ---------------------------------------------------------------------------
# /api/block/header/:hashOrHeight
# ---------------------------------------------------------------------------


@router.get("/block/header/{hash_or_height}")
async def block_header(hash_or_height: str = Path(...)):
    """Block header fields (no transactions)."""
    rpc = BlockchainRPC(get_rpc())
    redis = get_redis()
    bhash: str
    if _is_hash(hash_or_height):
        bhash = hash_or_height
    else:
        try:
            height = int(hash_or_height)
        except ValueError:
            raise HTTPException(400, "Must be a block height or 64-char hex hash")
        cached = await redis.get(Keys.BLOCK_BY_HEIGHT.format(height=height))
        try:
            bhash = cached or await rpc.get_block_hash(height)
        except (RPCConnectionError, RPCError) as e:
            raise HTTPException(503, str(e)) from e

    try:
        b = await rpc.get_block(bhash, verbosity=1)
    except (RPCConnectionError, RPCError) as e:
        raise HTTPException(503, str(e)) from e

    tip_raw = await redis.get(Keys.TIP_HEIGHT)
    tip = int(tip_raw) if tip_raw else b.get("height", 0)
    confs = max(0, tip - b.get("height", tip) + 1)
    return {
        "hash": b.get("hash"),
        "height": b.get("height"),
        "version": b.get("version"),
        "previousblockhash": b.get("previousblockhash"),
        "merkleroot": b.get("merkleroot"),
        "time": b.get("time"),
        "mediantime": b.get("mediantime"),
        "bits": b.get("bits"),
        "difficulty": b.get("difficulty"),
        "nonce": b.get("nonce"),
        "size": b.get("size"),
        "weight": b.get("weight"),
        "tx_count": b.get("nTx"),
        "confirmations": confs,
        "nextblockhash": b.get("nextblockhash"),
        "chainwork": b.get("chainwork"),
    }


# ---------------------------------------------------------------------------
# /api/tx/volume/24h
# ---------------------------------------------------------------------------


@router.get("/tx/volume/24h")
async def tx_volume_24h():
    """Transaction count over the last 24 hours (derived from cached block data)."""
    redis = get_redis()
    tip_raw = await redis.get(Keys.TIP_HEIGHT)
    if not tip_raw:
        raise HTTPException(503, "Chain tip unavailable")
    tip = int(tip_raw)
    cutoff = time.time() - 86400
    tx_count = 0
    blocks_scanned = 0
    for h in range(tip, max(0, tip - 1440), -1):
        cached_hash = await redis.get(Keys.BLOCK_BY_HEIGHT.format(height=h))
        if not cached_hash:
            break
        cached = await redis.get(Keys.BLOCK_BY_HASH.format(hash=cached_hash))
        if not cached:
            break
        b = json.loads(cached)
        if b.get("time", 0) < cutoff:
            break
        tx_count += b.get("n_tx", 0)
        blocks_scanned += 1
    return {
        "transactions": tx_count,
        "blocks": blocks_scanned,
        "window_hours": 24,
    }


# ---------------------------------------------------------------------------
# /api/mining/hashrate  (alias — same data as /api/hashrate)
# ---------------------------------------------------------------------------


@router.get("/mining/hashrate")
async def mining_hashrate():
    """Network hashrate — 120-block rolling average (H/s)."""
    rpc = BlockchainRPC(get_rpc())
    mining = await rpc.get_mining_info()
    hps = mining.get("networkhashps") or 0
    if hps >= 1e18:
        label = f"{hps / 1e18:.2f} EH/s"
    elif hps >= 1e15:
        label = f"{hps / 1e15:.2f} PH/s"
    elif hps >= 1e12:
        label = f"{hps / 1e12:.2f} TH/s"
    elif hps >= 1e9:
        label = f"{hps / 1e9:.2f} GH/s"
    else:
        label = f"{hps:.0f} H/s"
    return {"hashrate": hps, "label": label, "window_blocks": 120}


# ---------------------------------------------------------------------------
# /api/mining/diff-adj-estimate
# ---------------------------------------------------------------------------


@router.get("/mining/diff-adj-estimate")
async def diff_adj_estimate():
    """Estimated time and block height of the next difficulty retarget."""
    rpc = BlockchainRPC(get_rpc())
    info = await rpc.get_blockchain_info()
    height = info.get("blocks", 0)
    median_time = info.get("mediantime", int(time.time()))

    blocks_into_period = height % _DIFF_RETARGET_INTERVAL
    blocks_remaining = _DIFF_RETARGET_INTERVAL - blocks_into_period
    retarget_height = height + blocks_remaining

    # Estimate avg block time from mining info
    try:
        mining = await rpc.get_mining_info()
        hps = mining.get("networkhashps") or 0
        difficulty = info.get("difficulty", 1)
        # avg_block_time ≈ difficulty * 2^32 / hashrate  (for SHA256 chains)
        if hps > 0:
            avg_block_time = (difficulty * (2**32)) / hps
            avg_block_time = max(60, min(avg_block_time, 7200))
        else:
            avg_block_time = _TARGET_BLOCK_TIME
    except Exception:
        avg_block_time = _TARGET_BLOCK_TIME

    estimated_seconds = blocks_remaining * avg_block_time
    estimated_date = int(median_time + estimated_seconds)

    return {
        "blocksUntilRetarget": blocks_remaining,
        "retargetHeight": retarget_height,
        "estimatedRetargetDate": estimated_date,
        "averageBlockTime": round(avg_block_time, 1),
        "currentDifficulty": info.get("difficulty"),
        "retargetInterval": _DIFF_RETARGET_INTERVAL,
    }


# ---------------------------------------------------------------------------
# /api/mining/next-block
# /api/mining/next-block/txids
# /api/mining/next-block/includes/:txid
# ---------------------------------------------------------------------------


async def _next_block_data():
    redis = get_redis()
    cached_txs = await redis.get("vision:mempool:txs:top")
    if cached_txs:
        txs = json.loads(cached_txs)
    else:
        rpc = BlockchainRPC(get_rpc())
        _, txs = await build_mempool_summary(rpc)
    proj = project_blocks(txs, max_blocks=1)
    return proj[0].model_dump() if proj else None, txs


@router.get("/mining/next-block")
async def next_block():
    """Projected contents of the next block based on current mempool."""
    redis = get_redis()
    tip_raw = await redis.get(Keys.TIP_HEIGHT)
    tip = int(tip_raw) if tip_raw else 0
    block, _ = await _next_block_data()
    if block is None:
        return {"height": tip + 1, "tx_count": 0, "total_fees_sats": 0, "size": 0}
    return {
        "height": tip + 1,
        "tx_count": block.get("tx_count", 0),
        "total_fees_sats": block.get("total_fees_sats", 0),
        "size": block.get("size", 0),
        "fee_rate_min": block.get("fee_rate_min"),
        "fee_rate_max": block.get("fee_rate_max"),
    }


@router.get("/mining/next-block/txids")
async def next_block_txids():
    """TXIDs of transactions in the projected next block."""
    block, txs = await _next_block_data()
    if block is None:
        return {"txids": [], "total": 0}
    # project_blocks returns first N txs; return their txids
    rpc = BlockchainRPC(get_rpc())
    redis = get_redis()
    cached_txs_raw = await redis.get("vision:mempool:txs:top")
    if cached_txs_raw:
        all_txs = json.loads(cached_txs_raw)
    else:
        _, all_txs = await build_mempool_summary(rpc)
    # Sort by fee rate desc (same order as project_blocks) and take first tx_count
    tx_count = block.get("tx_count", 0)
    sorted_txs = sorted(
        all_txs, key=lambda t: t.get("fee_rate_sat_vbyte", 0), reverse=True
    )
    txids = [t["txid"] for t in sorted_txs[:tx_count] if "txid" in t]
    return {"txids": txids, "total": len(txids)}


@router.get("/mining/next-block/includes/{txid}")
async def next_block_includes(txid: str):
    """Whether a given txid is included in the projected next block."""
    block, _ = await _next_block_data()
    if block is None:
        return {"txid": txid, "included": False}
    redis = get_redis()
    cached_txs_raw = await redis.get("vision:mempool:txs:top")
    if not cached_txs_raw:
        return {"txid": txid, "included": False}
    all_txs = json.loads(cached_txs_raw)
    tx_count = block.get("tx_count", 0)
    sorted_txs = sorted(
        all_txs, key=lambda t: t.get("fee_rate_sat_vbyte", 0), reverse=True
    )
    txids_in_block = {t["txid"] for t in sorted_txs[:tx_count] if "txid" in t}
    return {"txid": txid, "included": txid in txids_in_block}


# ---------------------------------------------------------------------------
# /api/mining/miner-summary
# ---------------------------------------------------------------------------


@router.get("/mining/miner-summary")
async def miner_summary(blocks: int = 144):
    """Breakdown of the last N blocks by miner (coinbase payout address)."""
    blocks = max(1, min(blocks, 1000))
    redis = get_redis()
    tip_raw = await redis.get(Keys.TIP_HEIGHT)
    if not tip_raw:
        raise HTTPException(503, "Chain tip unavailable")
    tip = int(tip_raw)

    counts: dict[str, int] = defaultdict(int)
    found = 0
    for h in range(tip, max(0, tip - blocks), -1):
        cached_hash = await redis.get(Keys.BLOCK_BY_HEIGHT.format(height=h))
        if not cached_hash:
            continue
        cached = await redis.get(Keys.BLOCK_BY_HASH.format(hash=cached_hash))
        if not cached:
            continue
        b = json.loads(cached)
        cb = b.get("coinbase") or {}
        addr = cb.get("address") or "unknown"
        counts[addr] += 1
        found += 1

    summary = [
        {
            "address": addr,
            "blocks": cnt,
            "percent": round(cnt / found * 100, 2) if found else 0,
        }
        for addr, cnt in sorted(counts.items(), key=lambda x: -x[1])
    ]
    return {
        "summary": summary,
        "blocks_scanned": found,
        "window_blocks": blocks,
        "tip_height": tip,
    }


# ---------------------------------------------------------------------------
# /api/mempool/fees
# ---------------------------------------------------------------------------


@router.get("/mempool/fees")
async def mempool_fees():
    """Fee rate estimates (sat/vbyte) for next-block, 3-block, and 6-block targets."""
    redis = get_redis()
    cached_txs_raw = await redis.get("vision:mempool:txs:top")
    if cached_txs_raw:
        txs = json.loads(cached_txs_raw)
    else:
        rpc = BlockchainRPC(get_rpc())
        _, txs = await build_mempool_summary(rpc)

    if not txs:
        return {
            "nextBlock": None,
            "threeBlocks": None,
            "sixBlocks": None,
            "minimum": None,
        }

    rates = sorted(
        [t.get("fee_rate_sat_vbyte", 0) for t in txs if t.get("fee_rate_sat_vbyte")],
        reverse=True,
    )
    total = len(rates)

    def _percentile(pct: float) -> float | None:
        if not rates:
            return None
        idx = max(0, min(int(total * pct / 100), total - 1))
        return round(rates[idx], 3)

    return {
        "nextBlock": _percentile(10),  # top 10% — virtually guaranteed next block
        "threeBlocks": _percentile(30),  # top 30%
        "sixBlocks": _percentile(50),  # median
        "minimum": round(rates[-1], 3) if rates else None,
        "units": "sat/vbyte",
    }


# ---------------------------------------------------------------------------
# /api/blockchain/coins
# ---------------------------------------------------------------------------


@router.get("/blockchain/coins")
async def blockchain_coins():
    """Coin supply information — circulating supply, halving schedule, subsidy."""
    redis = get_redis()
    rpc = BlockchainRPC(get_rpc())

    tip_raw = await redis.get(Keys.TIP_HEIGHT)
    try:
        tip = int(tip_raw) if tip_raw else await rpc.get_block_count()
    except Exception:
        tip = 0

    # Use cached supply if available
    raw = await redis.get(Keys.SUPPLY_INFO)
    circulating_sats = None
    if raw:
        try:
            cached = json.loads(raw)
            circulating_sats = cached.get("circulating_sats")
        except Exception:
            pass

    current_reward_sats = get_block_subsidy(tip)
    return {
        "halvings": False,
        "currentBlockReward": round(current_reward_sats / 1e8, 8),
        "currentBlockRewardSats": current_reward_sats,
        "circulatingSats": circulating_sats,
        "circulating": round(circulating_sats / 1e8, 8) if circulating_sats else None,
        "tipHeight": tip,
    }


# ---------------------------------------------------------------------------
# /api/blockchain/utxo-set
# ---------------------------------------------------------------------------


@router.get("/blockchain/utxo-set")
async def utxo_set():
    """UTXO set statistics (from cached gettxoutsetinfo)."""
    redis = get_redis()
    raw = await redis.get(Keys.SUPPLY_INFO)
    if raw:
        try:
            cached = json.loads(raw)
            return {
                "height": cached.get("height"),
                "txouts": cached.get("txouts"),
                "total_amount": round(cached.get("circulating_sats", 0) / 1e8, 8),
                "computed_at": cached.get("computed_at"),
                "source": cached.get("source"),
            }
        except Exception:
            pass
    raise HTTPException(
        503,
        "UTXO set info not yet available — call /api/stats/supply first to populate",
    )


# ---------------------------------------------------------------------------
# /api/blockchain/next-halving
# ---------------------------------------------------------------------------


@router.get("/blockchain/next-halving")
async def next_halving():
    """ITC has no halvings — block reward does not change."""
    return {"halvings": False, "message": "ITC has no halving schedule"}
