from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query

from ..models.token import TokenMeta
from ..sqlite_store import Keys, get_db as get_redis
from ..rpc.client import get_rpc
from ..rpc.tokens import TokenRPC

router = APIRouter()


@router.get("/tokens")
async def list_tokens(
    sort: str = Query("created", pattern="^(created|supply|transfers|name|symbol)$"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
    verified: bool | None = None,
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    redis = get_redis()
    raw = await redis.get(Keys.TOKEN_REGISTRY)
    if raw:
        tokens = json.loads(raw)
    else:
        rpc = TokenRPC(get_rpc())
        tokens = await rpc.all_tokens() or []

    # Normalize keys
    norm = []
    for t in tokens:
        tid = t.get("address") or t.get("id") or t.get("token_id") or ""
        norm.append(
            {
                "id": tid,
                "name": t.get("name", ""),
                "symbol": t.get("symbol", ""),
                "decimals": int(t.get("decimals", 0) or 0),
                "total_supply": str(t.get("totalSupply") or t.get("total_supply") or "0"),
                "creator": t.get("creator") or t.get("owner"),
                "created_height": t.get("createdHeight") or t.get("created_height"),
                "created_time": t.get("createdTime") or t.get("created_time"),
                "create_txid": t.get("createTxid") or t.get("create_txid"),
                "transfer_count": t.get("transferCount") or t.get("transfer_count") or 0,
                "verified": bool(t.get("verified", False)),
                "logo_url": t.get("logoUrl") or t.get("logo_url"),
            }
        )

    if verified is not None:
        norm = [t for t in norm if t["verified"] == verified]
    if q:
        ql = q.lower()
        norm = [t for t in norm if ql in t["name"].lower() or ql in t["symbol"].lower() or ql in t["id"].lower()]

    sort_keys = {
        "created": lambda t: t.get("created_time") or 0,
        "supply": lambda t: int(t.get("total_supply") or "0") if (t.get("total_supply") or "0").isdigit() else 0,
        "transfers": lambda t: int(t.get("transfer_count") or 0),
        "name": lambda t: (t.get("name") or "").lower(),
        "symbol": lambda t: (t.get("symbol") or "").lower(),
    }
    norm.sort(key=sort_keys[sort], reverse=(direction == "desc"))

    total = len(norm)
    page = norm[offset : offset + limit]
    return {"items": page, "total": total, "offset": offset, "limit": limit}


@router.get("/token/{token_id}", response_model=TokenMeta)
async def get_token(token_id: str):
    rpc = TokenRPC(get_rpc())
    try:
        meta = await rpc.token_meta(token_id)
    except Exception as e:
        raise HTTPException(404, f"Token not found: {e}") from e
    if not meta:
        raise HTTPException(404, "Token not found")
    try:
        supply = await rpc.token_total_supply(token_id)
    except Exception:
        supply = meta.get("totalSupply") or meta.get("total_supply") or "0"
    return TokenMeta(
        id=token_id,
        name=meta.get("name", ""),
        symbol=meta.get("symbol", ""),
        decimals=int(meta.get("decimals", 0) or 0),
        total_supply=str(supply),
        creator=meta.get("creator") or meta.get("owner"),
        created_height=meta.get("createdHeight") or meta.get("created_height"),
        created_time=meta.get("createdTime") or meta.get("created_time"),
        create_txid=meta.get("createTxid") or meta.get("create_txid"),
        transfer_count=meta.get("transferCount") or meta.get("transfer_count"),
        verified=bool(meta.get("verified", False)),
        logo_url=meta.get("logoUrl") or meta.get("logo_url"),
    )


@router.get("/token/{token_id}/history")
async def token_history(token_id: str, address: str | None = None, limit: int = Query(50, ge=1, le=500)):
    rpc = TokenRPC(get_rpc())
    history = await rpc.token_history(token_id, filter_addr=address)
    if not isinstance(history, list):
        history = []
    history = history[:limit]
    return {"items": history, "total": len(history)}


@router.get("/token/{token_id}/balance/{address}")
async def token_balance(token_id: str, address: str):
    rpc = TokenRPC(get_rpc())
    bal = await rpc.get_token_balance_of(token_id, address)
    return {"token_id": token_id, "address": address, "balance": str(bal)}
