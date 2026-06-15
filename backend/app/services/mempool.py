"""Mempool helpers: build summary, project upcoming blocks, derive fee categories."""

from __future__ import annotations

import statistics
from typing import List

from ..models.mempool import MempoolSummary, ProjectedBlock
from ..rpc.methods import BlockchainRPC
from ..utils.format import itc_to_sats

MAX_BLOCK_VSIZE = 1_000_000  # vbytes per block (segwit-adjusted)


def _categorize(values: List[float]) -> dict:
    if not values:
        return {"low": 0.0, "medium": 0.0, "high": 0.0}
    sv = sorted(values)
    return {
        "low": float(sv[len(sv) // 3]),
        "medium": float(sv[len(sv) * 2 // 3]),
        "high": float(sv[-1]),
    }


def _histogram(rates: List[float], vsizes: List[int], buckets: int = 30) -> list[list[float]]:
    if not rates:
        return []
    pairs = list(zip(rates, vsizes))
    pairs.sort(key=lambda p: p[0], reverse=True)
    if buckets >= len(pairs):
        return [[float(r), float(v)] for r, v in pairs]
    chunk = max(1, len(pairs) // buckets)
    out: list[list[float]] = []
    for i in range(0, len(pairs), chunk):
        slab = pairs[i : i + chunk]
        avg_rate = sum(r for r, _ in slab) / len(slab)
        sum_vsize = sum(v for _, v in slab)
        out.append([round(avg_rate, 3), float(sum_vsize)])
    return out


async def build_mempool_summary(rpc: BlockchainRPC) -> tuple[MempoolSummary, list[dict]]:
    raw = await rpc.get_raw_mempool(verbose=True)
    if not isinstance(raw, dict):
        return MempoolSummary(
            tx_count=0,
            vsize_total=0,
            fee_total_sats=0,
            fee_rate_min=0.0,
            fee_rate_median=0.0,
            fee_rate_max=0.0,
            fee_categories={"low": 0.0, "medium": 0.0, "high": 0.0},
            fee_histogram=[],
        ), []

    rates: list[float] = []
    vsizes: list[int] = []
    fees: list[int] = []
    txs: list[dict] = []
    for txid, info in raw.items():
        vsize = info.get("vsize", info.get("size", 0))
        fee_btc = info.get("fees", {}).get("base", info.get("fee", 0))
        fee_sats = itc_to_sats(fee_btc)
        rate = round(fee_sats / vsize, 3) if vsize else 0.0
        rates.append(rate)
        vsizes.append(vsize)
        fees.append(fee_sats)
        txs.append(
            {
                "txid": txid,
                "fee_sats": fee_sats,
                "vsize": vsize,
                "fee_rate_sat_vbyte": rate,
                "time": info.get("time", 0),
                "descendant_count": info.get("descendantcount"),
                "descendant_size": info.get("descendantsize"),
            }
        )

    summary = MempoolSummary(
        tx_count=len(txs),
        vsize_total=sum(vsizes),
        fee_total_sats=sum(fees),
        fee_rate_min=min(rates) if rates else 0.0,
        fee_rate_median=float(statistics.median(rates)) if rates else 0.0,
        fee_rate_max=max(rates) if rates else 0.0,
        fee_categories=_categorize(rates),
        fee_histogram=_histogram(rates, vsizes),
    )
    return summary, txs


def project_blocks(txs: list[dict], max_blocks: int = 8) -> List[ProjectedBlock]:
    """Pack mempool transactions into upcoming projected blocks by fee rate."""
    txs_sorted = sorted(txs, key=lambda t: t["fee_rate_sat_vbyte"], reverse=True)
    blocks: list[ProjectedBlock] = []
    cur_vsize = 0
    cur_rates: list[float] = []
    cur_fees = 0
    cur_count = 0
    idx = 1
    for t in txs_sorted:
        if idx > max_blocks:
            break
        if cur_vsize + t["vsize"] > MAX_BLOCK_VSIZE and cur_count > 0:
            blocks.append(
                ProjectedBlock(
                    index=idx,
                    fee_rate_min=min(cur_rates),
                    fee_rate_median=float(statistics.median(cur_rates)),
                    fee_rate_max=max(cur_rates),
                    vsize=cur_vsize,
                    tx_count=cur_count,
                    fees_sats=cur_fees,
                )
            )
            idx += 1
            cur_vsize = 0
            cur_rates = []
            cur_fees = 0
            cur_count = 0
        cur_vsize += t["vsize"]
        cur_rates.append(t["fee_rate_sat_vbyte"])
        cur_fees += t["fee_sats"]
        cur_count += 1
    if cur_count and idx <= max_blocks:
        blocks.append(
            ProjectedBlock(
                index=idx,
                fee_rate_min=min(cur_rates),
                fee_rate_median=float(statistics.median(cur_rates)),
                fee_rate_max=max(cur_rates),
                vsize=cur_vsize,
                tx_count=cur_count,
                fees_sats=cur_fees,
            )
        )
    return blocks
