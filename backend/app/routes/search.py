"""Search disambiguation: returns all plausible matches for a query."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Query

from ..sqlite_store import Keys, get_db as get_redis
from ..rpc.client import RPCError, get_rpc
from ..rpc.methods import BlockchainRPC
from ..rpc.tokens import TokenRPC
from ..utils.address import is_valid_address

router = APIRouter()
logger = logging.getLogger(__name__)


def _is_hex64(s: str) -> bool:
    return len(s) == 64 and all(c in "0123456789abcdefABCDEF" for c in s)


def _is_int(s: str) -> bool:
    return s.isdigit()


@router.get("/search")
async def search(q: str = Query(..., min_length=1, max_length=128)):
    q = q.strip()
    matches: list[dict[str, Any]] = []
    rpc = BlockchainRPC(get_rpc())

    async def try_height():
        if not _is_int(q):
            return
        try:
            h = int(q)
            bhash = await rpc.get_block_hash(h)
            matches.append(
                {
                    "type": "block",
                    "label": f"Block #{h}",
                    "value": h,
                    "href": f"/block/{h}",
                    "subtitle": bhash,
                }
            )
        except Exception:
            pass

    async def try_blockhash():
        if not _is_hex64(q):
            return
        try:
            await rpc.get_block_header(q.lower(), verbose=True)
            matches.append(
                {"type": "block", "label": "Block hash match", "value": q, "href": f"/block/{q}"}
            )
        except Exception:
            pass

    async def try_txid():
        if not _is_hex64(q):
            return
        try:
            tx = await rpc.get_raw_transaction(q.lower(), verbose=True)
            if isinstance(tx, dict):
                matches.append(
                    {
                        "type": "tx",
                        "label": "Transaction match",
                        "value": q,
                        "href": f"/tx/{q}",
                        "subtitle": f"Block {tx.get('height', '?')}",
                    }
                )
        except Exception:
            pass

    async def try_address():
        # A structurally valid ITC address is always a match — no network call
        # needed here. Real balance/tx data lives on the address detail page.
        if not is_valid_address(q):
            return
        matches.append(
            {
                "type": "address",
                "label": "Address",
                "value": q,
                "href": f"/address/{q}",
                "subtitle": q[:20] + "…" if len(q) > 20 else q,
            }
        )

    async def try_token():
        ql = q.lower()
        try:
            redis = get_redis()
            raw = await redis.get(Keys.TOKEN_REGISTRY)
            if not raw:
                tokens = await TokenRPC(get_rpc()).all_tokens()
            else:
                tokens = json.loads(raw)
            for t in tokens or []:
                tid = (t.get("address") or t.get("id") or "").lower()
                if (
                    ql == tid
                    or ql == (t.get("symbol") or "").lower()
                    or ql in (t.get("name") or "").lower()
                ):
                    matches.append(
                        {
                            "type": "token",
                            "label": f"{t.get('name', '?')} ({t.get('symbol', '?')})",
                            "value": tid,
                            "href": f"/token/{tid}",
                            "subtitle": tid,
                        }
                    )
        except Exception as e:
            logger.debug("Token search error: %s", e)

    await asyncio.gather(try_height(), try_blockhash(), try_txid(), try_address(), try_token())

    # If the query was numeric and matches a height, present that first.
    matches.sort(key=lambda m: 0 if m["type"] == "block" and _is_int(q) else 1)
    return {"query": q, "matches": matches}
