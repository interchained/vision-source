from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class MempoolSummary(BaseModel):
    tx_count: int
    vsize_total: int
    fee_total_sats: int
    fee_rate_min: float
    fee_rate_median: float
    fee_rate_max: float
    fee_categories: dict  # {"low": float, "medium": float, "high": float}
    fee_histogram: List[List[float]]  # [[fee_rate, vsize], ...]


class MempoolTx(BaseModel):
    txid: str
    fee_sats: int
    vsize: int
    fee_rate_sat_vbyte: float
    time: int
    descendant_count: Optional[int] = None
    descendant_size: Optional[int] = None


class ProjectedBlock(BaseModel):
    index: int  # 1 = next block, 2 = block after, etc.
    fee_rate_min: float
    fee_rate_median: float
    fee_rate_max: float
    vsize: int
    tx_count: int
    fees_sats: int
