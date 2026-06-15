"""RSS feed for new blocks."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response
from feedgen.feed import FeedGenerator

from ..config import settings
from ..sqlite_store import Keys, get_db as get_redis

router = APIRouter()


@router.get("/feed/blocks.xml")
async def blocks_feed(request: Request):
    site = str(request.base_url).rstrip("/")
    fg = FeedGenerator()
    fg.id(f"{site}/feed/blocks.xml")
    fg.title("Interchained Vision — New Blocks")
    fg.link(href=site, rel="alternate")
    fg.link(href=f"{site}/feed/blocks.xml", rel="self")
    fg.subtitle("Latest ITC blocks discovered on the Interchained network.")
    fg.language("en")

    redis = get_redis()
    # ZSET of recent blocks: hash -> height
    items = await redis.zrevrange(Keys.RECENT_BLOCKS, 0, 49, withscores=True)
    for bhash, height in items:
        cached = await redis.get(Keys.BLOCK_BY_HASH.format(hash=bhash))
        if not cached:
            continue
        b = json.loads(cached)
        fe = fg.add_entry()
        fe.id(f"urn:block:{bhash}")
        fe.title(f"Block #{int(height)}")
        fe.link(href=f"{site}/block/{int(height)}")
        fe.published(datetime.fromtimestamp(b.get("time", 0), tz=timezone.utc))
        fe.summary(
            f"Transactions: {b.get('n_tx')}, Size: {b.get('size')} B, Weight: {b.get('weight')}"
        )

    xml = fg.atom_str(pretty=True)
    return Response(content=xml, media_type="application/atom+xml")
