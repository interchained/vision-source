"""Token deployer routes.

The user-supplied WIF key is forwarded directly to the ITC node RPC's
``createtoken`` method (see itsl.py for the canonical pattern). Vision never
persists the key to disk or to Redis.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models.token import TokenDeployRequest, TokenDeployResponse
from ..rpc.client import get_rpc, RPCError
from ..rpc.tokens import TokenRPC

router = APIRouter()
logger = logging.getLogger(__name__)


class FeeEstimateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    symbol: str = Field(..., min_length=1, max_length=16)
    decimals: int = Field(..., ge=0, le=18)
    amount: str


class FeeEstimateResponse(BaseModel):
    estimated_fee_sats: int
    estimated_vbytes: int
    fee_per_vbyte: int
    note: str


# Default per the chain config (10M sats / vbyte); the node may override.
DEFAULT_FEE_PER_VBYTE = 10_000_000
ESTIMATED_CREATE_VBYTES = 250


@router.post("/deploy/estimate", response_model=FeeEstimateResponse)
async def estimate_fee(req: FeeEstimateRequest):
    fee = DEFAULT_FEE_PER_VBYTE * ESTIMATED_CREATE_VBYTES
    return FeeEstimateResponse(
        estimated_fee_sats=fee,
        estimated_vbytes=ESTIMATED_CREATE_VBYTES,
        fee_per_vbyte=DEFAULT_FEE_PER_VBYTE,
        note="Estimate based on default chain create_fee_per_vbyte. Actual fee is set by the node and shown in the broadcast result.",
    )


@router.post("/deploy", response_model=TokenDeployResponse)
async def deploy_token(req: TokenDeployRequest):
    if not req.wif_key:
        raise HTTPException(400, "wif_key is required for client-supplied signing")
    rpc = TokenRPC(get_rpc())
    try:
        result = await rpc.create_token(
            amount=req.amount,
            name=req.name,
            symbol=req.symbol,
            decimals=req.decimals,
            witness=req.witness,
            wif_key=req.wif_key,
        )
    except RPCError as e:
        logger.error(
            "createtoken RPC error: code=%s message=%r name=%r symbol=%r decimals=%s amount=%r",
            e.code, e.message, req.name, req.symbol, req.decimals, req.amount,
        )
        raise  # re-raise so the error middleware formats and returns it

    if isinstance(result, dict):
        txid = result.get("txid") or result.get("hash") or ""
        logger.info("Token deployed: txid=%s name=%r symbol=%r", txid, req.name, req.symbol)
        return TokenDeployResponse(
            txid=txid,
            token_id=result.get("token_id") or result.get("address"),
            raw=result,
        )
    if isinstance(result, str):
        logger.info("Token deployed: txid=%s name=%r symbol=%r", result, req.name, req.symbol)
        return TokenDeployResponse(txid=result)
    raise HTTPException(502, "Unexpected RPC response shape from createtoken")
