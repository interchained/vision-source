from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class TokenMeta(BaseModel):
    id: str
    name: str
    symbol: str
    decimals: int
    total_supply: Optional[str] = None
    creator: Optional[str] = None
    created_height: Optional[int] = None
    created_time: Optional[int] = None
    create_txid: Optional[str] = None
    transfer_count: Optional[int] = None
    verified: bool = False
    logo_url: Optional[str] = None


class TokenEvent(BaseModel):
    txid: str
    height: Optional[int] = None
    time: Optional[int] = None
    op: str  # CREATE | TRANSFER | APPROVE | TRANSFERFROM | INCREASE_ALLOWANCE | DECREASE_ALLOWANCE | BURN | MINT
    from_addr: Optional[str] = None
    to_addr: Optional[str] = None
    amount: Optional[str] = None
    memo: Optional[str] = None


class TokenDeployRequest(BaseModel):
    name: str
    symbol: str
    decimals: int
    amount: str
    wif_key: str
    witness: bool = True


class TokenDeployResponse(BaseModel):
    txid: str
    token_id: Optional[str] = None
    raw: Optional[dict] = None
