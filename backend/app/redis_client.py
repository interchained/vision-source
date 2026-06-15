"""Async Redis client singleton."""

from __future__ import annotations

import redis.asyncio as redis_async

from .config import settings

_pool: redis_async.ConnectionPool | None = None
_client: redis_async.Redis | None = None


def get_redis() -> redis_async.Redis:
    """Return a singleton async Redis client."""
    global _pool, _client
    if _client is None:
        _pool = redis_async.ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=64,
        )
        _client = redis_async.Redis(connection_pool=_pool)
    return _client


async def close_redis() -> None:
    global _pool, _client
    if _client is not None:
        await _client.aclose()
        _client = None
    if _pool is not None:
        await _pool.aclose()
        _pool = None


# ── Key namespace constants ──
class Keys:
    TIP_HEIGHT = "vision:tip:height"
    TIP_HASH = "vision:tip:hash"
    TIP_BLOCK_JSON = "vision:tip:block"
    BLOCK_BY_HEIGHT = "vision:block:height:{height}"  # hash
    BLOCK_BY_HASH = "vision:block:hash:{hash}"        # JSON
    TX_BY_TXID = "vision:tx:{txid}"                   # JSON
    RECENT_BLOCKS = "vision:recent:blocks"            # ZSET (height -> hash)
    RECENT_TXS = "vision:recent:txs"                  # ZSET (timestamp -> txid)
    MEMPOOL_SUMMARY = "vision:mempool:summary"        # JSON
    MEMPOOL_TXS = "vision:mempool:txs"                # ZSET (fee_rate -> txid)
    MEMPOOL_FEE_HISTOGRAM = "vision:mempool:fee_hist" # JSON
    NETWORK_STATS = "vision:stats:network"            # JSON
    PRICE_ITC_USD = "vision:price:itc_usd"            # JSON
    INDEXER_LAST_HEIGHT = "vision:indexer:last_height"
    INDEXER_STATUS = "vision:indexer:status"          # JSON
    EVENT_STREAM = "vision:events"                    # PubSub channel
    ADDRESS_STATS = "vision:address:{addr}:stats"     # JSON
    ADDRESS_TXS = "vision:address:{addr}:txs"         # ZSET (height -> txid)
    SPECIAL_ADDRESSES = "vision:special_addresses"    # SET
    TOKEN_REGISTRY = "vision:tokens:registry"         # JSON list
    TOKEN_META = "vision:token:{id}:meta"             # JSON
    TOKEN_HISTORY = "vision:token:{id}:history"       # JSON list
    POOL_DETECTOR_PATTERNS = "vision:pools:patterns"  # JSON
    RATE_LIMIT = "vision:rl:{ip}:{minute}"            # counter
    WEBHOOK_SUBSCRIBERS = "vision:webhooks"           # SET of JSON
    SEARCH_RECENT = "vision:search:recent"            # LIST
