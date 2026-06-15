"""IP-based rate limiting using Redis as the counter store."""

from __future__ import annotations

import time

from fastapi import Request, status
from fastapi.responses import JSONResponse

from ..config import settings
from ..sqlite_store import Keys, get_db as get_redis
from .errors import error_payload


async def rate_limit_middleware(request: Request, call_next):
    # Don't rate-limit health checks or static assets
    if request.url.path in ("/health", "/", "/api/health"):
        return await call_next(request)

    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    minute_bucket = int(time.time()) // 60
    key = Keys.RATE_LIMIT.format(ip=client_ip, minute=minute_bucket)

    redis = get_redis()
    try:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, 65)
    except Exception:
        # If Redis is down, don't block requests
        return await call_next(request)

    if count > settings.RATE_LIMIT_PER_MIN:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content=error_payload(
                message=f"Rate limit exceeded ({settings.RATE_LIMIT_PER_MIN} req/min).",
                code="rate_limited",
                hint="Slow down or self-host your own Vision instance.",
                extra={"retry_after_seconds": 60 - (int(time.time()) % 60)},
            ),
            headers={"Retry-After": str(60 - (int(time.time()) % 60))},
        )

    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(settings.RATE_LIMIT_PER_MIN)
    response.headers["X-RateLimit-Remaining"] = str(max(0, settings.RATE_LIMIT_PER_MIN - count))
    return response
