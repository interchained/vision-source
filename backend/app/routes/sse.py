from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from ..config import settings
from ..services.events import get_event_bus
from ..services.price import get_cached_price
from ..sqlite_store import Keys, get_db as get_redis

router = APIRouter()


@router.get("/sse")
async def sse(request: Request):
    bus = get_event_bus()
    queue = await bus.subscribe()
    redis = get_redis()

    async def stream():
        # Initial snapshot so the client can bootstrap immediately.
        try:
            tip_height = await redis.get(Keys.TIP_HEIGHT)
            tip_hash = await redis.get(Keys.TIP_HASH)
            mempool = await redis.get(Keys.MEMPOOL_SUMMARY)
            price = await get_cached_price()
            yield {
                "event": "snapshot",
                "data": json.dumps(
                    {
                        "tip": {
                            "height": int(tip_height) if tip_height else None,
                            "hash": tip_hash,
                        },
                        "mempool": json.loads(mempool) if mempool else None,
                        "price": price,
                    }
                ),
            }
        except Exception:
            pass

        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=settings.INDEXER_TICK_SECONDS * 2)
                    yield {"event": msg["type"], "data": json.dumps(msg["data"])}
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            await bus.unsubscribe(queue)

    return EventSourceResponse(stream())
