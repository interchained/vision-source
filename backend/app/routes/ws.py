"""WebSocket endpoint for SDK / programmatic clients."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.events import get_event_bus
from ..sqlite_store import Keys, get_db as get_redis
from ..services.price import get_cached_price

router = APIRouter()


@router.websocket("/ws")
async def websocket(ws: WebSocket):
    await ws.accept()
    bus = get_event_bus()
    queue = await bus.subscribe()
    redis = get_redis()

    # Send snapshot
    try:
        tip_height = await redis.get(Keys.TIP_HEIGHT)
        tip_hash = await redis.get(Keys.TIP_HASH)
        mempool = await redis.get(Keys.MEMPOOL_SUMMARY)
        price = await get_cached_price()
        await ws.send_json(
            {
                "type": "snapshot",
                "data": {
                    "tip": {"height": int(tip_height) if tip_height else None, "hash": tip_hash},
                    "mempool": json.loads(mempool) if mempool else None,
                    "price": price,
                },
            }
        )
    except Exception:
        pass

    try:
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=15)
                await ws.send_json(msg)
            except asyncio.TimeoutError:
                await ws.send_json({"type": "ping", "data": {}})
    except WebSocketDisconnect:
        pass
    finally:
        await bus.unsubscribe(queue)
