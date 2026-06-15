from __future__ import annotations

import json

from fastapi import APIRouter, Query

from ..sqlite_store import Keys, get_db as get_redis
from ..rpc.client import get_rpc
from ..rpc.methods import BlockchainRPC
from ..services.mempool import build_mempool_summary, project_blocks

router = APIRouter()


async def _summary_and_txs():
    redis = get_redis()
    cached_summary = await redis.get(Keys.MEMPOOL_SUMMARY)
    cached_txs = await redis.get("vision:mempool:txs:top")
    if cached_summary and cached_txs:
        return json.loads(cached_summary), json.loads(cached_txs)
    rpc = BlockchainRPC(get_rpc())
    summary, txs = await build_mempool_summary(rpc)
    return summary.model_dump(), txs


@router.get("/mempool/summary")
async def summary():
    s, _ = await _summary_and_txs()
    return s


@router.get("/mempool/txs")
async def list_txs(limit: int = Query(50, ge=1, le=500)):
    _, txs = await _summary_and_txs()
    return {"items": txs[:limit], "total": len(txs)}


@router.get("/mempool/projected")
async def projected(blocks: int = Query(8, ge=1, le=20)):
    _, txs = await _summary_and_txs()
    proj = project_blocks(txs, max_blocks=blocks)
    return {"items": [p.model_dump() for p in proj]}
