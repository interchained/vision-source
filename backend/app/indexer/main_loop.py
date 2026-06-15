"""The Vision indexer.

A single asyncio task that:

1. Polls the ITC node every ``INDEXER_TICK_SECONDS`` seconds.
2. Discovers new blocks (and reorgs up to ``REORG_DEPTH`` deep).
3. Caches block summaries + tip in Redis.
4. Polls mempool summary into Redis.
5. Polls token registry on a slower cadence.
6. Publishes ``block`` / ``mempool`` / ``token`` events to the in-process bus
   so SSE/WS clients get real-time updates.

Address indexing is *not* done here — addresses are served on-demand by the
ElectrumX client (see ``app.electrumx``). The exception is the configured
"special wallets" which are pre-warmed on startup.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Optional

from ..config import settings
from ..electrumx.client import ElectrumXError, get_electrumx
from ..models.block import BlockSummary
from ..sqlite_store import Keys, get_db as get_redis
from ..rpc.client import RPCConnectionError, RPCError, get_rpc


def _fmt_eta(seconds: float) -> str:
    if seconds <= 0 or seconds != seconds:  # NaN guard
        return "?"
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h{m:02d}m"
    if m:
        return f"{m}m{s:02d}s"
    return f"{s}s"


from ..rpc.methods import BlockchainRPC
from ..rpc.tokens import TokenRPC
from ..services.blocks import shape_block
from ..services.events import get_event_bus
from ..services.mempool import build_mempool_summary
from ..utils.address import address_to_script_hash, is_valid_address

logger = logging.getLogger(__name__)


class Indexer:
    def __init__(self):
        self._stop = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._mempool_task: Optional[asyncio.Task] = None
        self._registry_task: Optional[asyncio.Task] = None
        self._rpc_online = False

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._block_loop())
            self._mempool_task = asyncio.create_task(self._mempool_loop())
            self._registry_task = asyncio.create_task(self._registry_loop())

    async def stop(self) -> None:
        self._stop.set()
        for t in (self._task, self._mempool_task, self._registry_task):
            if t:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass

    @property
    def rpc_online(self) -> bool:
        return self._rpc_online

    async def warm_special_wallets(self) -> None:
        wallets = settings.load_special_wallets()
        redis = get_redis()
        await redis.delete(Keys.SPECIAL_ADDRESSES)
        for w in wallets:
            addr = w.get("address")
            if addr and is_valid_address(addr):
                await redis.sadd(Keys.SPECIAL_ADDRESSES, json.dumps(w))

    async def _set_status(self, **kwargs) -> None:
        redis = get_redis()
        existing = {}
        try:
            current = await redis.get(Keys.INDEXER_STATUS)
            if current:
                existing = json.loads(current)
        except Exception:
            pass
        existing.update(kwargs)
        await redis.set(Keys.INDEXER_STATUS, json.dumps(existing))

    async def _block_loop(self) -> None:
        rpc = BlockchainRPC(get_rpc())
        rpc_client = get_rpc()
        db = get_redis()
        bus = get_event_bus()

        logger.info("Block indexer started (batch=%d, tick=%ds)",
                    settings.INDEXER_BATCH_SIZE, settings.INDEXER_TICK_SECONDS)

        # Seed phase early so the mempool/registry loops gate themselves
        # before the first batch finishes.
        try:
            await self._set_status(phase="syncing")
        except Exception:
            pass

        progress_t0 = asyncio.get_event_loop().time()
        progress_h0: Optional[int] = None

        while not self._stop.is_set():
            try:
                tip = await rpc.get_block_count()
                self._rpc_online = True
                last_indexed_raw = await db.get(Keys.INDEXER_LAST_HEIGHT)
                start_height = settings.START_FROM_HEIGHT
                if last_indexed_raw:
                    start_height = int(last_indexed_raw) + 1

                # Reorg check: re-validate the last REORG_DEPTH blocks
                if last_indexed_raw and int(last_indexed_raw) > 0:
                    rolled_back_to = await self._reorg_check(rpc, int(last_indexed_raw))
                    if rolled_back_to is not None:
                        start_height = rolled_back_to + 1
                        logger.info("Reorg rollback: re-indexing from height %d", start_height)

                # Already caught up — keep status fresh so the UI splash
                # doesn't get stuck on "starting"/"syncing" between batches.
                if start_height > tip:
                    last_h = int(last_indexed_raw) if last_indexed_raw else tip
                    await self._set_status(
                        last_height=last_h,
                        tip=tip,
                        phase="live",
                    )

                # Catch up — fetch blocks in concurrent batches
                if start_height <= tip:
                    end = min(tip, start_height + settings.INDEXER_BATCH_SIZE - 1)
                    syncing = (end < tip - 10)

                    if progress_h0 is None:
                        progress_h0 = start_height - 1

                    max_h = await self._fetch_and_store_range(
                        rpc_client, rpc, db, start_height, end, tip, lite=syncing,
                    )

                    if max_h >= start_height:
                        # Update pointer & publish progress once per batch
                        await db.zremrangebyrank(Keys.RECENT_BLOCKS, 0, -201)
                        await db.set(Keys.INDEXER_LAST_HEIGHT, max_h)
                        phase = "syncing" if max_h < tip - 1 else "live"
                        await self._set_status(
                            last_height=max_h,
                            tip=tip,
                            phase=phase,
                        )
                        await bus.publish("sync", {
                            "last_height": max_h,
                            "tip": tip,
                            "phase": phase,
                            "progress": round(max_h / tip * 100, 2) if tip else 0,
                        })

                        # Periodic progress log (every ~5s of wall time)
                        now = asyncio.get_event_loop().time()
                        elapsed = now - progress_t0
                        if elapsed >= 5.0:
                            blocks_done = max_h - progress_h0
                            rate = blocks_done / elapsed if elapsed > 0 else 0
                            remaining = max(0, tip - max_h)
                            eta_s = (remaining / rate) if rate > 0 else 0
                            logger.info(
                                "Sync %d/%d (%.2f%%) %.1f blk/s, %d remaining, ETA %s",
                                max_h, tip,
                                (max_h / tip * 100) if tip else 0,
                                rate, remaining, _fmt_eta(eta_s),
                            )
                            progress_t0 = now
                            progress_h0 = max_h

                # Update tip cache regardless
                tip_hash = await rpc.get_best_block_hash()
                prev_tip_raw = await db.get(Keys.TIP_HEIGHT)
                prev_tip = int(prev_tip_raw) if prev_tip_raw else None
                try:
                    await db.set(Keys.TIP_HEIGHT, tip)
                    await db.set(Keys.TIP_HASH, tip_hash)
                except Exception as _tip_err:
                    logger.warning("Tip persist skipped (will retry next tick): %s", _tip_err)
                if prev_tip != tip:
                    try:
                        block_raw = await rpc.get_block(tip_hash, verbosity=1)
                        summary = BlockSummary(
                            height=tip,
                            hash=tip_hash,
                            time=block_raw.get("time", 0),
                            tx_count=block_raw.get("nTx", 0),
                            size=block_raw.get("size", 0),
                            weight=block_raw.get("weight"),
                        )
                        await bus.publish("block", summary.model_dump())
                    except Exception as e:
                        logger.warning("Tip block summary failed: %s", e)

            except RPCConnectionError as e:
                self._rpc_online = False
                await self._set_status(phase="rpc_offline")
                logger.warning("Block loop: RPC offline: %s", e)
                try:
                    await rpc_client.reconnect()
                except Exception:
                    pass
            except Exception as e:
                logger.exception("Indexer block loop error: %s", e)

            # During active sync, don't wait full tick — keep going
            try:
                # If we're caught up, wait the full tick. Else, very brief yield.
                last_raw = await db.get(Keys.INDEXER_LAST_HEIGHT)
                last_h = int(last_raw) if last_raw else 0
                tip_raw = await db.get(Keys.TIP_HEIGHT)
                tip_h = int(tip_raw) if tip_raw else 0
                if last_h >= tip_h - 1:
                    timeout = settings.INDEXER_TICK_SECONDS
                else:
                    timeout = 0.1
                await asyncio.wait_for(self._stop.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                pass

    async def _fetch_and_store_range(
        self,
        rpc_client,
        rpc: BlockchainRPC,
        db,
        start: int,
        end: int,
        tip: int,
        *,
        lite: bool,
    ) -> int:
        """Fetch and persist blocks ``start..end`` inclusive.

        Uses JSON-RPC batching for getblockhash, then concurrent getblock
        calls for the block bodies. Returns the highest height successfully
        stored (or ``start - 1`` if none stored).
        """
        # Batch fetch all block hashes in a single HTTP request. Connection
        # errors propagate so the outer loop transitions to rpc_offline;
        # other failures (parse, schema) also propagate — silently advancing
        # past missing blocks would corrupt the index.
        hash_results = await rpc_client.call_batch(
            [("getblockhash", [h]) for h in range(start, end + 1)]
        )

        heights = list(range(start, end + 1))
        # Walk heights in order and stop at the first hole — we must commit
        # contiguously, never past a missing block.
        valid_calls: list[tuple[int, str]] = []
        for h, res in zip(heights, hash_results):
            if isinstance(res, RPCError):
                # Likely a transient miss or "block height out of range" if
                # the chain reorged under us. Stop here, the next tick will
                # retry from this height.
                logger.warning("getblockhash(%d) failed, halting batch: %s", h, res)
                break
            valid_calls.append((h, res))

        if not valid_calls:
            return start - 1

        # Fetch full block JSONs concurrently. RPC pool is 16 — leave
        # headroom for the HTTP API and mempool loop.
        sem = asyncio.Semaphore(settings.INDEXER_FETCH_CONCURRENCY)

        async def fetch_one(h: int, bhash: str):
            async with sem:
                try:
                    if lite:
                        block_raw = await rpc.get_block(bhash, verbosity=1)
                        block_json = self._serialize_lite(h, bhash, block_raw)
                    else:
                        block_raw = await rpc.get_block(bhash, verbosity=2)
                        block = await shape_block(rpc, block_raw, tip)
                        block_json = block.model_dump_json()
                    return h, bhash, block_json, None
                except RPCConnectionError:
                    raise
                except Exception as e:
                    return h, bhash, None, e

        results = await asyncio.gather(*(fetch_one(h, bh) for h, bh in valid_calls))

        # Persist in height order; break at the first failure so the
        # pointer never advances past a hole.
        max_h = start - 1
        for h, bhash, block_json, err in sorted(results, key=lambda x: x[0]):
            if err is not None:
                logger.warning("Indexer halting at h=%d: fetch failed: %s", h, err)
                break
            try:
                await db.set(Keys.BLOCK_BY_HEIGHT.format(height=h), bhash)
                await db.set(Keys.BLOCK_BY_HASH.format(hash=bhash), block_json)
                await db.zadd(Keys.RECENT_BLOCKS, {bhash: h})
                max_h = h
            except Exception as e:
                # max_h does not advance, so the next tick retries from h.
                logger.warning("Indexer persist h=%d failed (will retry): %s", h, e)
                break

        return max_h

    @staticmethod
    def _serialize_lite(height: int, bhash: str, block_raw: dict) -> str:
        import json as _json
        return _json.dumps({
            "height": height,
            "hash": bhash,
            "confirmations": block_raw.get("confirmations", 0),
            "time": block_raw.get("time", 0),
            "n_tx": block_raw.get("nTx", 0),
            "size": block_raw.get("size", 0),
            "weight": block_raw.get("weight"),
            "difficulty": block_raw.get("difficulty", 0.0),
            "version": block_raw.get("version", 0),
            "merkleroot": block_raw.get("merkleroot", ""),
            "bits": block_raw.get("bits", ""),
            "nonce": block_raw.get("nonce", 0),
            "previousblockhash": block_raw.get("previousblockhash"),
            "nextblockhash": block_raw.get("nextblockhash"),
            "txids": block_raw.get("tx", []),
        })

    async def _fetch_block(self, rpc: BlockchainRPC, height: int, tip: int, *, lite: bool = False) -> tuple[str, str]:
        """Single-block fetch — kept for compatibility with on-demand callers."""
        bhash = await rpc.get_block_hash(height)
        if lite:
            block_raw = await rpc.get_block(bhash, verbosity=1)
            return bhash, self._serialize_lite(height, bhash, block_raw)
        block_raw = await rpc.get_block(bhash, verbosity=2)
        block = await shape_block(rpc, block_raw, tip)
        return bhash, block.model_dump_json()

    async def _index_height(self, rpc: BlockchainRPC, height: int, tip: int) -> None:
        """Kept for compatibility — single-block fallback."""
        bhash, block_json = await self._fetch_block(rpc, height, tip)
        db = get_redis()
        await db.set(Keys.BLOCK_BY_HEIGHT.format(height=height), bhash)
        await db.set(Keys.BLOCK_BY_HASH.format(hash=bhash), block_json)
        await db.zadd(Keys.RECENT_BLOCKS, {bhash: height})
        await db.zremrangebyrank(Keys.RECENT_BLOCKS, 0, -201)
        await db.set(Keys.INDEXER_LAST_HEIGHT, height)

    async def _reorg_check(self, rpc: BlockchainRPC, last_indexed: int) -> Optional[int]:
        """Validate the last REORG_DEPTH cached blocks against the chain.

        Returns the height to which the indexer was rolled back (so the caller
        can resume from ``rolled_back + 1``), or ``None`` if everything matched.
        """
        redis = get_redis()
        depth = min(settings.REORG_DEPTH, last_indexed)
        if depth <= 0:
            return None
        # Batch the on-chain hash lookups for efficiency.
        rpc_client = get_rpc()
        heights = [last_indexed - offset for offset in range(depth)]
        try:
            onchain = await rpc_client.call_batch([("getblockhash", [h]) for h in heights])
        except Exception as e:
            logger.warning("Reorg check batch failed: %s", e)
            return None

        for h, onchain_hash in zip(heights, onchain):
            if isinstance(onchain_hash, RPCError):
                continue
            cached_hash = await redis.get(Keys.BLOCK_BY_HEIGHT.format(height=h))
            if cached_hash and cached_hash != onchain_hash:
                logger.warning("Reorg detected at height %d: %s -> %s", h, cached_hash, onchain_hash)
                await redis.delete(Keys.BLOCK_BY_HEIGHT.format(height=h))
                await redis.delete(Keys.BLOCK_BY_HASH.format(hash=cached_hash))
                rollback_to = max(0, h - 1)
                await redis.set(Keys.INDEXER_LAST_HEIGHT, rollback_to)
                return rollback_to
        return None

    async def _mempool_loop(self) -> None:
        rpc = BlockchainRPC(get_rpc())
        redis = get_redis()
        bus = get_event_bus()
        while not self._stop.is_set():
            # Skip mempool polling during initial sync to free the event loop
            status_raw = await redis.get(Keys.INDEXER_STATUS)
            if status_raw:
                import json as _json
                _st = _json.loads(status_raw)
                if _st.get("phase") not in ("live",):
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=10)
                    except asyncio.TimeoutError:
                        pass
                    continue
            try:
                summary, txs = await build_mempool_summary(rpc)
                self._rpc_online = True
                await redis.set(Keys.MEMPOOL_SUMMARY, summary.model_dump_json(), ex=30)
                # Cache top-200 txs by fee rate
                top = sorted(txs, key=lambda t: t["fee_rate_sat_vbyte"], reverse=True)[:200]
                await redis.set("vision:mempool:txs:top", json.dumps(top), ex=30)
                await bus.publish("mempool", summary.model_dump())
            except RPCConnectionError:
                self._rpc_online = False
                try:
                    await rpc_client.reconnect()
                except Exception:
                    pass
            except Exception as e:
                logger.exception("Mempool loop error: %s", e)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=settings.INDEXER_TICK_SECONDS)
            except asyncio.TimeoutError:
                pass

    async def _registry_loop(self) -> None:
        token_rpc = TokenRPC(get_rpc())
        redis = get_redis()
        while not self._stop.is_set():
            # Skip registry polling during initial sync
            status_raw = await redis.get(Keys.INDEXER_STATUS)
            if status_raw:
                import json as _json
                _st = _json.loads(status_raw)
                if _st.get("phase") not in ("live",):
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=30)
                    except asyncio.TimeoutError:
                        pass
                    continue
            try:
                tokens = await token_rpc.all_tokens()
                if isinstance(tokens, list):
                    await redis.set(Keys.TOKEN_REGISTRY, json.dumps(tokens), ex=settings.TOKEN_REGISTRY_REFRESH_SECONDS * 4)
            except RPCConnectionError:
                try:
                    await rpc_client.reconnect()
                except Exception:
                    pass
            except RPCError as e:
                logger.warning("Token registry refresh failed: %s", e)
            except Exception as e:
                logger.exception("Token registry loop error: %s", e)
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=settings.TOKEN_REGISTRY_REFRESH_SECONDS
                )
            except asyncio.TimeoutError:
                pass


_indexer: Optional[Indexer] = None


def get_indexer() -> Indexer:
    global _indexer
    if _indexer is None:
        _indexer = Indexer()
    return _indexer
