from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class TxInput(BaseModel):
    txid: Optional[str] = None
    vout: Optional[int] = None
    scriptsig_hex: Optional[str] = None
    scriptsig_asm: Optional[str] = None
    sequence: Optional[int] = None
    txinwitness: Optional[List[str]] = None
    coinbase: Optional[str] = None
    prevout: Optional[dict] = None  # populated when we know it (value, address)


class TxOutput(BaseModel):
    n: int
    value_sats: int
    script_pubkey_hex: str
    script_pubkey_asm: Optional[str] = None
    script_pubkey_type: Optional[str] = None
    address: Optional[str] = None


class Transaction(BaseModel):
    txid: str
    hash: Optional[str] = None
    version: int
    locktime: int
    size: int
    vsize: int
    weight: Optional[int] = None
    fee_sats: Optional[int] = None
    fee_rate_sat_vbyte: Optional[float] = None
    block_hash: Optional[str] = None
    block_height: Optional[int] = None
    block_time: Optional[int] = None
    confirmations: Optional[int] = None
    in_mempool: bool = False
    is_coinbase: bool = False
    inputs: List[TxInput]
    outputs: List[TxOutput]
    raw_hex: Optional[str] = None
