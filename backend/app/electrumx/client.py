"""Async ElectrumX client over the Electrum protocol.

Handles addresses, UTXOs, and transaction history. We keep one persistent
connection with a request/response demultiplexer so concurrent callers can
share the socket without blocking.

ElectrumX uses ``script_hash`` as its address identifier, which is
``sha256(scriptPubKey)`` reversed. We accept user-facing addresses and convert
them via the helper in ``app.utils.address``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import ssl
from typing import Any, Dict, Optional

from ..config import settings

logger = logging.getLogger(__name__)


class ElectrumXError(Exception):
    """Raised when ElectrumX returns an error or the connection is unusable."""


class ElectrumXClient:
    """Persistent async TCP client for ElectrumX."""

    def __init__(self, host: str, port: int, tls: bool = False, timeout: int = 15):
        self.host = host
        self.port = port
        self.tls = tls
        self.timeout = timeout

        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._lock = asyncio.Lock()
        self._req_id = 0
        self._pending: Dict[int, asyncio.Future] = {}
        self._reader_task: Optional[asyncio.Task] = None
        self._closed = True

    async def _connect(self) -> None:
        ssl_ctx = ssl.create_default_context() if self.tls else None
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port, ssl=ssl_ctx),
                timeout=self.timeout,
            )
        except (asyncio.TimeoutError, OSError) as e:
            raise ElectrumXError(f"Cannot connect to ElectrumX {self.host}:{self.port}: {e}")
        self._closed = False
        self._reader_task = asyncio.create_task(self._read_loop())

        # Negotiate protocol version (required by some ElectrumX builds).
        # Use the unlocked send path — we already hold self._lock.
        try:
            await self._send_unlocked(
                "server.version", ["interchained-vision/0.1", "1.4"]
            )
        except ElectrumXError as e:
            logger.warning("ElectrumX server.version handshake warning: %s", e)

    async def _read_loop(self) -> None:
        assert self._reader is not None
        try:
            while not self._closed:
                line = await self._reader.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode())
                except json.JSONDecodeError:
                    logger.warning("ElectrumX: bad JSON line: %r", line)
                    continue

                req_id = msg.get("id")
                if req_id is None:
                    # Subscription notification — ignored for now (we poll).
                    continue
                future = self._pending.pop(req_id, None)
                if future and not future.done():
                    if "error" in msg and msg["error"]:
                        future.set_exception(ElectrumXError(str(msg["error"])))
                    else:
                        future.set_result(msg.get("result"))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("ElectrumX read loop error: %s", e)
        finally:
            await self._cleanup_after_disconnect()

    async def _cleanup_after_disconnect(self) -> None:
        self._closed = True
        for future in self._pending.values():
            if not future.done():
                future.set_exception(ElectrumXError("ElectrumX connection lost"))
        self._pending.clear()
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._reader = None
        self._writer = None

    async def _ensure_connected(self) -> None:
        async with self._lock:
            if self._closed or self._writer is None:
                await self._connect()

    async def _send_unlocked(self, method: str, params: Optional[list] = None) -> Any:
        """Send a JSON-RPC call assuming the connection is already established.

        The caller is responsible for ensuring ``_writer`` is alive — used
        from inside ``_connect`` while ``self._lock`` is already held.
        """
        assert self._writer is not None
        self._req_id += 1
        req_id = self._req_id
        payload = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or []}
        line = (json.dumps(payload) + "\n").encode()

        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[req_id] = future
        try:
            self._writer.write(line)
            await self._writer.drain()
            return await asyncio.wait_for(future, timeout=self.timeout)
        except asyncio.TimeoutError:
            self._pending.pop(req_id, None)
            raise ElectrumXError(f"ElectrumX timeout on {method}")
        except (ConnectionResetError, ConnectionError, BrokenPipeError, OSError) as e:
            self._pending.pop(req_id, None)
            self._closed = True
            raise ElectrumXError(f"ElectrumX connection error on {method}: {e}") from e

    async def _call(self, method: str, params: Optional[list] = None) -> Any:
        await self._ensure_connected()
        return await self._send_unlocked(method, params)

    async def close(self) -> None:
        self._closed = True
        if self._reader_task:
            self._reader_task.cancel()
        await self._cleanup_after_disconnect()

    # ── Public methods ──
    async def get_balance(self, script_hash: str) -> dict:
        return await self._call("blockchain.scripthash.get_balance", [script_hash])

    async def get_history(self, script_hash: str) -> list:
        return await self._call("blockchain.scripthash.get_history", [script_hash])

    async def get_mempool(self, script_hash: str) -> list:
        return await self._call("blockchain.scripthash.get_mempool", [script_hash])

    async def list_unspent(self, script_hash: str) -> list:
        return await self._call("blockchain.scripthash.listunspent", [script_hash])

    async def get_transaction(self, txid: str, verbose: bool = True) -> Any:
        return await self._call("blockchain.transaction.get", [txid, verbose])

    async def get_block_header(self, height: int) -> str:
        return await self._call("blockchain.block.header", [height])

    async def estimate_fee(self, blocks: int = 6) -> float:
        return await self._call("blockchain.estimatefee", [blocks])

    async def server_features(self) -> dict:
        return await self._call("server.features", [])

    async def ping(self) -> Any:
        return await self._call("server.ping", [])


# ── Singleton ──
_singleton: Optional[ElectrumXClient] = None


def get_electrumx() -> ElectrumXClient:
    global _singleton
    if _singleton is None:
        host, port = settings.electrumx_endpoint
        _singleton = ElectrumXClient(
            host=host,
            port=port,
            tls=settings.ELECTRUMX_TLS,
            timeout=settings.ELECTRUMX_TIMEOUT,
        )
    return _singleton


async def close_electrumx() -> None:
    global _singleton
    if _singleton is not None:
        await _singleton.close()
        _singleton = None
