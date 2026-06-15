"""Webhook subscriber registry + delivery."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from ..sqlite_store import Keys, get_db as get_redis
from ..services.events import get_event_bus

logger = logging.getLogger(__name__)
router = APIRouter()


class WebhookSub(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)
    events: list[str] = Field(default_factory=lambda: ["block"])
    secret: Optional[str] = None


@router.post("/webhooks")
async def add_webhook(sub: WebhookSub):
    redis = get_redis()
    sub_id = uuid4().hex
    record = {**sub.model_dump(), "id": sub_id}
    await redis.sadd(Keys.WEBHOOK_SUBSCRIBERS, json.dumps(record))
    return {"id": sub_id}


@router.delete("/webhooks/{sub_id}")
async def remove_webhook(sub_id: str):
    redis = get_redis()
    members = await redis.smembers(Keys.WEBHOOK_SUBSCRIBERS)
    for m in members:
        try:
            r = json.loads(m)
        except Exception:
            continue
        if r.get("id") == sub_id:
            await redis.srem(Keys.WEBHOOK_SUBSCRIBERS, m)
            return {"removed": True}
    raise HTTPException(404, "Subscription not found")


@router.get("/webhooks")
async def list_webhooks():
    redis = get_redis()
    members = await redis.smembers(Keys.WEBHOOK_SUBSCRIBERS)
    out = []
    for m in members:
        try:
            r = json.loads(m)
            out.append({"id": r.get("id"), "url": r.get("url"), "events": r.get("events")})
        except Exception:
            pass
    return {"items": out}


async def webhook_dispatcher_loop():
    """Background task that listens to the event bus and POSTs to subscribers."""
    bus = get_event_bus()
    queue = await bus.subscribe()
    redis = get_redis()
    async with httpx.AsyncClient(timeout=settings.WEBHOOK_TIMEOUT) as client:
        while True:
            msg = await queue.get()
            try:
                members = await redis.smembers(Keys.WEBHOOK_SUBSCRIBERS)
            except Exception:
                continue
            for m in members:
                try:
                    sub = json.loads(m)
                except Exception:
                    continue
                if msg["type"] not in sub.get("events", []):
                    continue
                payload = {"event": msg["type"], "data": msg["data"], "subscription_id": sub.get("id")}
                headers = {"Content-Type": "application/json"}
                if sub.get("secret"):
                    headers["X-Vision-Secret"] = sub["secret"]
                for attempt in range(settings.WEBHOOK_MAX_RETRIES):
                    try:
                        await client.post(sub["url"], json=payload, headers=headers)
                        break
                    except Exception as e:
                        logger.debug("Webhook delivery attempt %d failed: %s", attempt + 1, e)
                        await asyncio.sleep(2 ** attempt)
