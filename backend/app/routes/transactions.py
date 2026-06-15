from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException

from ..models.transaction import Transaction
from ..sqlite_store import Keys, get_db as get_redis
from ..rpc.client import get_rpc, RPCConnectionError, RPCError
from ..rpc.methods import BlockchainRPC
from ..services.transactions import build_transaction

router = APIRouter()

# Maximum seconds to spend fetching a transaction (parallel prevout fetching
# means even large transactions complete in a few seconds normally).
TX_FETCH_TIMEOUT = 25


@router.get("/tx/{txid}", response_model=Transaction)
async def get_transaction(txid: str):
    if len(txid) != 64:
        raise HTTPException(400, "txid must be a 64-character hex string")
    redis = get_redis()
    cached = await redis.get(Keys.TX_BY_TXID.format(txid=txid))
    if cached:
        return json.loads(cached)
    rpc = BlockchainRPC(get_rpc())
    try:
        tx = await asyncio.wait_for(build_transaction(rpc, txid), timeout=TX_FETCH_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(504, "Transaction fetch timed out — node is busy")
    except RPCConnectionError as e:
        raise HTTPException(503, f"Node unreachable: {e}") from e
    except RPCError as e:
        raise HTTPException(503, f"Node error: {e}") from e
    if tx is None:
        raise HTTPException(404, "Transaction not found")
    if tx.confirmations and tx.confirmations > 0:
        await redis.set(Keys.TX_BY_TXID.format(txid=txid), tx.model_dump_json(), ex=300)
    return tx


@router.post("/tx/broadcast")
async def broadcast(payload: dict):
    """Broadcast a raw transaction. Body: {"hex": "..."}"""
    hex_tx = payload.get("hex")
    if not hex_tx or not isinstance(hex_tx, str):
        raise HTTPException(400, "Missing 'hex' string in body")
    rpc = BlockchainRPC(get_rpc())
    txid = await rpc.send_raw_transaction(hex_tx)
    return {"txid": txid}
