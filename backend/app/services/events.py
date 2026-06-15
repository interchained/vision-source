"""In-process pub/sub for SSE and WebSocket clients.

Events are also mirrored to a Redis pub/sub channel so multiple backend
instances behind a load balancer can share the firehose.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Set

from ..sqlite_store import Keys, get_db as get_redis

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._subscribers.add(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue) -> None:
        async with self._lock:
            self._subscribers.discard(q)

    async def publish(self, event_type: str, data: Any) -> None:
        msg = {"type": event_type, "data": data}
        # Local fanout
        async with self._lock:
            stale = []
            for q in self._subscribers:
                try:
                    q.put_nowait(msg)
                except asyncio.QueueFull:
                    stale.append(q)
            for q in stale:
                self._subscribers.discard(q)
        # Cross-instance fanout via Redis pub/sub
        try:
            redis = get_redis()
            await redis.publish(Keys.EVENT_STREAM, json.dumps(msg))
        except Exception as e:
            logger.debug("Event publish to redis failed: %s", e)


_bus = EventBus()


def get_event_bus() -> EventBus:
    return _bus
