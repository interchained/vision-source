"""ITC/USD price oracle. Re-uses the existing iNEWS VWAP aggregator if configured."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

import httpx

from ..config import settings
from ..sqlite_store import Keys, get_db as get_redis

logger = logging.getLogger(__name__)


def _aggregate_markets(markets: list) -> Optional[dict]:
    """Compute a VWAP from the iNEWS markets feed.

    The feed returns one entry per exchange/pair. We treat USDT as USD
    (≈1:1) and combine native ITC and wrapped WITC pairs since they
    should track each other. BNB-quoted pairs are skipped (no USD anchor
    without a separate BNB/USD lookup).

    Strategy:
      1. Keep only entries quoted in USDT with a positive price.
      2. If any have positive volume, return Σ(price·vol)/Σ(vol) — true VWAP.
      3. Otherwise fall back to the median price across the surviving
         entries (robust to obvious outliers like a stale 0.04 ask).
    """
    if not isinstance(markets, list) or not markets:
        return None
    usable: list[tuple[float, float, str]] = []  # (price, vol, exchange)
    for m in markets:
        try:
            pair = str(m.get("pair") or "").upper()
            if not pair.endswith("/USDT"):
                continue
            base = pair.split("/")[0]
            if base not in ("ITC", "WITC"):
                continue
            price = float(m.get("price") or 0)
            vol = float(m.get("volume") or 0)
            if price <= 0:
                continue
            usable.append((price, vol, str(m.get("exchange") or "?")))
        except (TypeError, ValueError):
            continue
    if not usable:
        return None

    total_vol = sum(v for _, v, _ in usable)
    if total_vol > 0:
        vwap = sum(p * v for p, v, _ in usable) / total_vol
        method = "vwap"
    else:
        # Robust fallback: median of available prints
        prices = sorted(p for p, _, _ in usable)
        mid = len(prices) // 2
        vwap = prices[mid] if len(prices) % 2 else (prices[mid - 1] + prices[mid]) / 2
        method = "median"

    return {
        "price_usd": vwap,
        "method": method,
        "markets": [{"exchange": ex, "price": p, "volume": v} for p, v, ex in usable],
        "total_volume": total_vol,
    }


async def fetch_price() -> Optional[dict]:
    if not settings.PRICE_API_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(settings.PRICE_API_URL)
            r.raise_for_status()
            data = r.json()

        # Two supported shapes:
        #   1. List of market dicts (iNEWS /data/markets) → aggregate to VWAP
        #   2. Pre-aggregated dict with vwap/price + change_24h fields
        if isinstance(data, list):
            agg = _aggregate_markets(data)
            if agg is None:
                logger.warning("Price feed returned no usable USDT markets")
                return None
            return {
                "price_usd": float(agg["price_usd"]),
                "change_24h_pct": 0.0,  # markets feed has no 24h change
                "source": settings.PRICE_API_URL,
                "method": agg["method"],
                "markets_used": len(agg["markets"]),
                "total_volume": agg["total_volume"],
                "ts": int(asyncio.get_event_loop().time()),
            }

        return {
            "price_usd": float(data.get("vwap") or data.get("price") or 0),
            "change_24h_pct": float(data.get("change_24h") or data.get("change_24h_pct") or 0),
            "source": settings.PRICE_API_URL,
            "ts": int(asyncio.get_event_loop().time()),
        }
    except Exception as e:
        logger.warning("Price fetch failed: %s", e)
        return None


async def price_loop():
    redis = get_redis()
    while True:
        price = await fetch_price()
        if price:
            await redis.set(Keys.PRICE_ITC_USD, json.dumps(price), ex=120)
        await asyncio.sleep(settings.PRICE_REFRESH_SECONDS)


async def get_cached_price() -> Optional[dict]:
    redis = get_redis()
    raw = await redis.get(Keys.PRICE_ITC_USD)
    return json.loads(raw) if raw else None
