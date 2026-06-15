"""Async JSON-RPC client for interchainedd.

Supports both the base RPC endpoint (for blockchain/mempool/network methods)
and the per-wallet endpoint (for ITSL token methods that require a loaded
wallet, mirroring the behavior of itc-tools/itsl.py).

The base URL is taken verbatim from settings (``rpc_base_url``) so that proxied
hosts that already include a scheme + port work without any extra plumbing.
"""

from __future__ import annotations

import base64
import logging
from typing import Any, Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class RPCError(Exception):
    """A JSON-RPC error raised by interchainedd."""

    def __init__(self, code: int, message: str, method: str = "", data: Any = None):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.method = method
        self.data = data


class RPCConnectionError(RPCError):
    """Raised when we cannot reach the RPC endpoint."""

    def __init__(self, message: str, method: str = ""):
        super().__init__(-32099, message, method)


class RPCClient:
    """Thin async wrapper around the ITC JSON-RPC interface."""

    def __init__(
        self,
        base_url: str,
        user: str,
        password: str,
        wallet_name: str = "",
        timeout: int = 30,
    ):
        self._base_url = base_url.rstrip("/")
        self.user = user
        self.password = password
        self.wallet_name = wallet_name
        self.timeout = timeout

        auth = base64.b64encode(f"{user}:{password}".encode()).decode()
        self._headers = {
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
        }
        self._req_id = 0
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def wallet_url(self) -> str:
        if self.wallet_name:
            return f"{self._base_url}/wallet/{self.wallet_name}"
        return self._base_url

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                headers=self._headers,
                limits=httpx.Limits(
                    max_connections=16,
                    max_keepalive_connections=8,
                ),
                http2=False,
            )
        return self._client

    async def reconnect(self) -> None:
        """Close the underlying HTTP client so a fresh connection is created
        on the next call. Called after RPCConnectionError to drop stale TCP
        sockets that keep the indexer permanently stuck in rpc_offline."""
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:
                pass
            finally:
                self._client = None

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def call(
        self,
        method: str,
        params: Optional[list] = None,
        *,
        use_wallet: bool = False,
    ) -> Any:
        """Issue a JSON-RPC call.

        Args:
            method: RPC method name (e.g. "getblockcount").
            params: list of positional parameters.
            use_wallet: if True, route to the /wallet/{name} URL.
        """
        url = self.wallet_url if use_wallet else self.base_url
        self._req_id += 1
        payload = {
            "jsonrpc": "1.0",
            "id": f"vision_{self._req_id}",
            "method": method,
            "params": params or [],
        }

        client = await self._ensure_client()
        try:
            resp = await client.post(url, json=payload)
        except httpx.ConnectError as e:
            raise RPCConnectionError(f"Cannot reach ITC RPC at {url}: {e}", method) from e
        except httpx.TimeoutException as e:
            raise RPCConnectionError(f"ITC RPC timeout: {e}", method) from e

        # Bitcoin Core returns 500 on RPC errors but with a JSON body containing the error
        try:
            data = resp.json()
        except ValueError:
            raise RPCError(resp.status_code, resp.text or "Non-JSON response", method)

        if data.get("error"):
            err = data["error"]
            raise RPCError(
                code=err.get("code", -1),
                message=err.get("message", "Unknown RPC error"),
                method=method,
                data=err,
            )
        return data.get("result")

    async def call_batch(
        self,
        calls: list[tuple[str, list]],
        *,
        use_wallet: bool = False,
    ) -> list[Any]:
        """Issue many JSON-RPC calls in a single HTTP request (JSON-RPC batch).

        Returns a list of results in the same order as ``calls``. If an
        individual call errors, its slot contains an :class:`RPCError`
        instance instead of a result (no exception is raised so a partial
        batch is still usable).
        """
        if not calls:
            return []
        url = self.wallet_url if use_wallet else self.base_url
        payload = []
        for method, params in calls:
            self._req_id += 1
            payload.append({
                "jsonrpc": "1.0",
                "id": f"vision_{self._req_id}",
                "method": method,
                "params": params or [],
            })

        client = await self._ensure_client()
        try:
            resp = await client.post(url, json=payload)
        except httpx.ConnectError as e:
            raise RPCConnectionError(f"Cannot reach ITC RPC at {url}: {e}", "batch") from e
        except httpx.TimeoutException as e:
            raise RPCConnectionError(f"ITC RPC timeout: {e}", "batch") from e

        try:
            data = resp.json()
        except ValueError:
            raise RPCError(resp.status_code, resp.text or "Non-JSON batch response", "batch")

        if not isinstance(data, list):
            # Some servers reject batch with a single error response.
            if isinstance(data, dict) and data.get("error"):
                err = data["error"]
                raise RPCError(err.get("code", -1), err.get("message", "Batch error"), "batch", err)
            raise RPCError(-1, f"Unexpected batch response type: {type(data).__name__}", "batch")

        # Restore order by id (the spec allows servers to reorder responses).
        by_id: dict[str, Any] = {}
        for item in data:
            rid = item.get("id")
            by_id[rid] = item

        out: list[Any] = []
        for sent in payload:
            item = by_id.get(sent["id"])
            if item is None:
                out.append(RPCError(-32603, f"Missing response for {sent['method']}", sent["method"]))
                continue
            if item.get("error"):
                err = item["error"]
                out.append(RPCError(
                    code=err.get("code", -1),
                    message=err.get("message", "Unknown RPC error"),
                    method=sent["method"],
                    data=err,
                ))
            else:
                out.append(item.get("result"))
        return out


# ── Singleton ──
_singleton: Optional[RPCClient] = None


def get_rpc() -> RPCClient:
    global _singleton
    if _singleton is None:
        _singleton = RPCClient(
            base_url=settings.rpc_base_url,
            user=settings.ITC_RPC_USER,
            password=settings.ITC_RPC_PASS,
            wallet_name=settings.ITC_WALLET_NAME,
            timeout=settings.ITC_RPC_TIMEOUT,
        )
    return _singleton


async def close_rpc() -> None:
    global _singleton
    if _singleton is not None:
        await _singleton.close()
        _singleton = None
