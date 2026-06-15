"""Pool Operator Snapshot Rewards — snapshot runner.

Scans a block-height range on the ITC chain and, for every coinbase with a
recipient value > 0, checks whether that payout address was registered by an
operator on the treasury grants page. Each registered match earns a fixed ITC
grant (``reward_per_block``) computed with Decimal arithmetic only. Unregistered
coinbase recipients are ignored.

The reward program is intentionally *separate* from the block subsidy: it is a
snapshot-based airdrop of ``reward_per_block`` ITC for every block in which a
registered payout address (miner or node operator) appeared in the coinbase
within the snapshot's height range.
"""

from __future__ import annotations

import logging
from decimal import Decimal, ROUND_DOWN
from typing import Optional

from ..config import settings
from ..rpc.client import get_rpc
from ..rpc.methods import BlockchainRPC

logger = logging.getLogger(__name__)

_SATS = Decimal("0.00000001")


def to_8dp(value: Decimal) -> str:
    """Quantize a Decimal down to 8 dp and return its string form."""
    return str(value.quantize(_SATS, rounding=ROUND_DOWN))


def itc_str_to_sats(value: str) -> int:
    """Convert a decimal ITC string to integer satoshis (exact, no float)."""
    return int((Decimal(value) * Decimal(100_000_000)).quantize(Decimal("1"), rounding=ROUND_DOWN))


class SnapshotError(Exception):
    """Raised for invalid snapshot parameters (mapped to 400 by the route)."""


def _build_match_index(pools: list[dict]) -> tuple[dict[str, dict], list[dict]]:
    """Return (address→pool map, pools-with-tags list) for active pools only.

    Only addresses in this map are eligible for rewards: an operator earns a
    grant only for the payout address they registered on the treasury grants
    page (whether that address mined the block or ran a node)."""
    by_addr: dict[str, dict] = {}
    tagged: list[dict] = []
    for p in pools:
        if p.get("status") != "active":
            continue
        addr = (p.get("payout_address") or "").strip()
        if addr:
            by_addr[addr] = p
        tag = (p.get("coinbase_tag") or "").strip()
        if tag:
            tagged.append(p)
    return by_addr, tagged


async def prepare_snapshot(
    store,
    *,
    snapshot_name: str,
    start_height: int,
    end_height: int,
    reward_per_block: str,
    notes: Optional[str] = None,
    allow_duplicate: bool = False,
) -> dict:
    """Validate inputs and create a ``draft`` snapshot row, returning it.

    This is the *fast* half of snapshot creation: it does input validation, a
    single tip RPC call, the duplicate-range check, and one row insert. The
    heavy block scan happens afterwards in :func:`execute_snapshot`, which the
    route launches as a background task. Splitting the work this way lets the
    HTTP request return in well under a second (status ``draft``) instead of
    blocking for ~90s on a full-week scan and tripping the proxy's 502 timeout.

    Raises SnapshotError on invalid input and RPCError/RPCConnectionError if the
    node is unreachable (so connection problems still surface synchronously).
    """
    if start_height < 0 or end_height < 0:
        raise SnapshotError("Heights must be non-negative.")
    if end_height < start_height:
        raise SnapshotError("end_height must be >= start_height.")
    span = end_height - start_height + 1
    if span > settings.SNAPSHOT_MAX_SPAN:
        raise SnapshotError(
            f"Range too large ({span} blocks); max is {settings.SNAPSHOT_MAX_SPAN}."
        )

    # Validate reward rate as a clean Decimal, then canonicalise to 8dp so all
    # downstream math (per-pool totals, grand total, payouts) is computed from
    # the exact same quantised rate that we persist — no satoshi drift.
    try:
        rate = Decimal(reward_per_block)
    except Exception as e:  # noqa: BLE001
        raise SnapshotError(f"Invalid reward_per_block: {reward_per_block!r}") from e
    if rate < 0:
        raise SnapshotError("reward_per_block must be non-negative.")
    rate_str = to_8dp(rate)

    rpc = BlockchainRPC(get_rpc())
    tip = await rpc.get_block_count()
    if end_height > tip:
        raise SnapshotError(f"end_height {end_height} is beyond chain tip {tip}.")

    snap_data = {
        "snapshot_name": snapshot_name,
        "start_height": start_height,
        "end_height": end_height,
        "reward_per_block": rate_str,
        "total_blocks_scanned": 0,
        "total_blocks_matched": 0,
        "total_reward": "0.00000000",
        "status": "draft",
        "notes": notes,
    }
    if allow_duplicate:
        snapshot_id = await store.snapshot_create(snap_data)
    else:
        snapshot_id = await store.snapshot_create_guarded(snap_data)
        if snapshot_id is None:
            raise SnapshotError(
                f"A snapshot for height range {start_height}-{end_height} already exists."
            )

    snap = await store.snapshot_get(snapshot_id)
    return snap


async def execute_snapshot(store, snapshot_id: int) -> None:
    """Scan the block range of a ``draft`` snapshot and persist its results.

    Runs as a background task. On success the snapshot flips ``draft →
    generated`` with totals + per-pool entries written. On any error the
    snapshot is marked ``failed`` with the error stored in ``notes`` so the
    admin UI (which polls) can surface it instead of hanging forever.
    """
    try:
        snap = await store.snapshot_get(snapshot_id)
        if snap is None:
            logger.warning("execute_snapshot: snapshot #%s vanished before scan", snapshot_id)
            return
        start_height = int(snap["start_height"])
        end_height = int(snap["end_height"])
        rate_str = snap["reward_per_block"]
        rate = Decimal(rate_str)

        # The whole scan is served from the local index — NO RPC. (Batching
        # getblockhash over a week of heights tripped the node's nginx 413; the
        # address index already has every coinbase recipient we need.)
        #
        # Coverage guard: the address index must have reached end_height, or we'd
        # silently undercount recipients. Fail loudly instead.
        ai_last = await store.address_index_last_height()
        if ai_last < end_height:
            raise SnapshotError(
                f"Address index has only reached height {ai_last}; cannot snapshot "
                f"up to {end_height} yet. Let the indexer catch up and re-run."
            )

        # Only addresses operators registered on the treasury grants page are
        # eligible. by_addr is the active-registration set we match coinbase
        # recipients against; an unregistered recipient earns nothing.
        pools = await store.pool_list()
        by_addr, _tagged = _build_match_index(pools)

        rows, missing = await store.coinbase_reward_scan(start_height, end_height)
        if missing:
            preview = ", ".join(str(h) for h in missing[:10])
            raise SnapshotError(
                f"{len(missing)} block(s) in range are not fully indexed "
                f"(e.g. {preview}). The indexer may still be catching up."
            )

        scanned = end_height - start_height + 1

        # Aggregate per registered recipient address. A single block can credit
        # several coinbase recipients (e.g. miner + node operator); we keep only
        # those whose address an operator registered, collecting each
        # (address, block) pair once.
        per_addr: dict[str, dict] = {}     # address -> {blocks: [{height, hash}]}
        matched_blocks: set[int] = set()
        for r in rows:
            addr = r.get("address")
            if not addr or int(r.get("value", 0)) <= 0:
                continue
            if addr not in by_addr:
                continue  # unregistered coinbase recipient — not eligible
            height = r["height"]
            matched_blocks.add(height)
            bucket = per_addr.setdefault(addr, {"blocks": []})
            bucket["blocks"].append({"block_height": height, "block_hash": r.get("block_hash")})

        matched = len(matched_blocks)

        # Decimal totals + entry/block rows (one entry per recipient address).
        grand_total = Decimal("0")
        entry_rows: list[dict] = []
        block_rows: list[dict] = []
        for addr, bucket in per_addr.items():
            blocks = bucket["blocks"]
            count = len(blocks)
            if count == 0:
                continue
            pool = by_addr.get(addr)
            pool_id = pool["id"] if pool else None
            pool_name = pool.get("pool_name") if pool else addr
            coinbase_tag = (pool.get("coinbase_tag") or None) if pool else None
            addr_total = rate * Decimal(count)
            grand_total += addr_total
            entry_rows.append({
                "snapshot_id": snapshot_id,
                "pool_id": pool_id,
                "pool_name": pool_name,
                "payout_address": addr,
                "blocks_found": count,
                "reward_per_block": rate_str,
                "total_reward": to_8dp(addr_total),
                "status": "pending",
            })
            for b in blocks:
                block_rows.append({
                    "snapshot_id": snapshot_id,
                    "pool_id": pool_id,
                    "block_height": b["block_height"],
                    "block_hash": b["block_hash"],
                    "coinbase_tag_detected": coinbase_tag,
                    "payout_address": addr,
                    "reward_amount": rate_str,
                })

        await store.entries_insert_batch(entry_rows)
        await store.reward_blocks_insert_batch(block_rows)
        # Atomic compare-and-set: writes totals and flips draft→generated in one
        # commit, but only if the snapshot is still a draft. If an admin changed
        # the status during the scan (or it was deleted), bail without clobbering.
        finalized = await store.snapshot_finalize(
            snapshot_id,
            total_blocks_scanned=scanned,
            total_blocks_matched=matched,
            total_reward=to_8dp(grand_total),
        )
        if not finalized:
            # finalize is a compare-and-set on status='draft'. A False result
            # means the draft was deleted or its status changed mid-scan. If the
            # row is gone, the entries/blocks we just wrote are orphans (the
            # concurrent DELETE ran before our inserts) — scrub them. If the row
            # still exists, an admin changed its status: leave the results and
            # don't clobber that status.
            still = await store.snapshot_get(snapshot_id)
            if still is None:
                await store.snapshot_clear_results(snapshot_id)
                logger.warning(
                    "Snapshot #%s deleted during scan; cleared orphaned entries/blocks",
                    snapshot_id,
                )
            else:
                logger.warning(
                    "Snapshot #%s no longer 'draft' at finalize; leaving results, not overwriting status",
                    snapshot_id,
                )
            return

        logger.info(
            "Snapshot #%s [%d-%d]: scanned=%d matched=%d pools=%d total=%s ITC",
            snapshot_id, start_height, end_height,
            scanned, matched, len(entry_rows), to_8dp(grand_total),
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("Snapshot #%s scan failed: %s", snapshot_id, e)
        try:
            # Scrub any partial entries/blocks, then mark the draft failed so the
            # row carries no half-written results and the range stays re-runnable.
            await store.snapshot_clear_results(snapshot_id)
            await store.snapshot_mark_failed(snapshot_id, str(e)[:500] or "Snapshot scan failed.")
        except Exception:
            logger.exception("Failed to mark snapshot #%s as failed", snapshot_id)
