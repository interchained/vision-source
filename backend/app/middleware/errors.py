"""Unified error envelope.

We follow the mempool.space / Etherscan-style convention: every error is a
JSON body with ``status`` and ``message`` (plus optional ``code`` and
``hint``). HTTP status codes still carry semantic meaning (404, 503, 429, etc).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..rpc.client import RPCConnectionError, RPCError

logger = logging.getLogger(__name__)


def error_payload(
    *,
    status_str: str = "error",
    message: str,
    code: Optional[str] = None,
    hint: Optional[str] = None,
    request_id: Optional[str] = None,
    extra: Optional[dict] = None,
) -> dict:
    body: dict[str, Any] = {"status": status_str, "message": message}
    if code:
        body["code"] = code
    if hint:
        body["hint"] = hint
    if request_id:
        body["request_id"] = request_id
    if extra:
        body.update(extra)
    return body


def register_exception_handlers(app) -> None:
    @app.exception_handler(RPCConnectionError)
    async def rpc_conn_handler(request: Request, exc: RPCConnectionError):
        rid = request.headers.get("x-request-id", str(uuid.uuid4()))
        logger.error("RPC unreachable on %s: %s", request.url.path, exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_payload(
                message="Backend cannot reach the ITC node RPC.",
                code="rpc_unreachable",
                hint="Check ITC_RPC_HOST/PORT/USER/PASS in your environment.",
                request_id=rid,
            ),
        )

    @app.exception_handler(RPCError)
    async def rpc_err_handler(request: Request, exc: RPCError):
        rid = request.headers.get("x-request-id", str(uuid.uuid4()))
        # Map Bitcoin Core RPC error codes to HTTP statuses. The default for
        # any unmapped RPC error is 400 (not 502), because the node DID
        # respond — it just rejected the call. A true gateway failure is
        # raised separately as RPCConnectionError above. This guarantees the
        # user always sees the node's real error message instead of an opaque
        # 502 that browsers strip the body from.
        http_status = status.HTTP_400_BAD_REQUEST
        if exc.code == -5:
            lookup_methods = {"getblock", "getrawtransaction", "getblockhash",
                              "getblockheader", "gettransaction"}
            if exc.method in lookup_methods:
                http_status = status.HTTP_404_NOT_FOUND
        elif exc.code == -28:
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE  # warming up
        elif exc.code == -32601:
            http_status = status.HTTP_501_NOT_IMPLEMENTED  # method not found
        return JSONResponse(
            status_code=http_status,
            content=error_payload(
                message=exc.message,
                code=f"rpc_{exc.code}",
                hint=exc.method,
                request_id=rid,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        rid = request.headers.get("x-request-id", str(uuid.uuid4()))
        # Pydantic v2 embeds the raw exception object under each error's ``ctx``
        # (e.g. ``ctx={"error": ValueError(...)}``), which json.dumps can't
        # serialize — left as-is it turns a 422 into a 500. Stringify any
        # non-JSON-native ``ctx`` values so the real validation message survives.
        safe_details = []
        for err in exc.errors():
            err = dict(err)
            ctx = err.get("ctx")
            if isinstance(ctx, dict):
                err["ctx"] = {
                    k: (v if isinstance(v, (str, int, float, bool, type(None))) else str(v))
                    for k, v in ctx.items()
                }
            safe_details.append(err)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_payload(
                message="Invalid request",
                code="validation_error",
                request_id=rid,
                extra={"details": safe_details},
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException):
        rid = request.headers.get("x-request-id", str(uuid.uuid4()))
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(
                message=str(exc.detail) if exc.detail else "Request failed",
                code=f"http_{exc.status_code}",
                request_id=rid,
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        rid = request.headers.get("x-request-id", str(uuid.uuid4()))
        logger.exception("Unhandled exception on %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content=error_payload(
                message="Internal server error",
                code="internal",
                request_id=rid,
            ),
        )
