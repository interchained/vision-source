from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class AddressBalance(BaseModel):
    confirmed_sats: int
    unconfirmed_sats: int


class AddressStats(BaseModel):
    address: str
    valid: bool
    balance: AddressBalance
    tx_count: int
    label: Optional[str] = None
    is_special: bool = False
    first_seen_height: Optional[int] = None
    last_seen_height: Optional[int] = None
    electrumx_available: bool = True


class AddressTx(BaseModel):
    txid: str
    height: Optional[int] = None  # None for mempool
    fee_sats: Optional[int] = None


class AddressUtxo(BaseModel):
    txid: str
    vout: int
    height: Optional[int] = None
    value_sats: int


class AddressTokenBalance(BaseModel):
    token_id: str
    name: str
    symbol: str
    decimals: int
    balance: str  # raw integer in token base units
    verified: bool = False
