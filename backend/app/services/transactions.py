"""Transaction building/processing helpers shared across routes."""

from __future__ import annotations

import asyncio
from typing import Optional

from ..models.transaction import Transaction, TxInput, TxOutput
from ..rpc.methods import BlockchainRPC
from ..utils.format import itc_to_sats


async def _fetch_prevout(rpc: BlockchainRPC, txid: str, vout_idx: int) -> Optional[dict]:
    """Fetch a single prevout. Returns None on any error."""
    try:
        prev_raw = await rpc.get_raw_transaction(txid, verbose=True)
        if not isinstance(prev_raw, dict):
            return None
        prev_vout = prev_raw["vout"][vout_idx]
        spk = prev_vout.get("scriptPubKey", {})
        return {
            "value_sats": itc_to_sats(prev_vout["value"]),
            "address": (
                spk.get("address")
                or (spk.get("addresses") or [None])[0]
            ),
            "script_type": spk.get("type"),
        }
    except Exception:
        return None


async def build_transaction(rpc: BlockchainRPC, txid: str) -> Optional[Transaction]:
    """Fetch a tx via getrawtransaction and shape it for the API."""
    raw = await rpc.get_raw_transaction(txid, verbose=True)
    if raw is None or isinstance(raw, str):
        return None

    is_coinbase = bool(raw.get("vin") and "coinbase" in raw["vin"][0])

    inputs: list[TxInput] = []

    if is_coinbase:
        v0 = raw["vin"][0]
        inputs.append(
            TxInput(
                coinbase=v0.get("coinbase"),
                sequence=v0.get("sequence"),
                txinwitness=v0.get("txinwitness"),
            )
        )
        total_in = 0
    else:
        vin = raw.get("vin", [])

        async def _none() -> None:
            return None

        # Fetch all prevout transactions in parallel instead of sequentially.
        prevouts = await asyncio.gather(
            *[
                _fetch_prevout(rpc, v["txid"], v["vout"])
                if v.get("txid") else _none()
                for v in vin
            ]
        )

        total_in = 0
        for v, prev in zip(vin, prevouts):
            if prev is not None:
                total_in += prev["value_sats"]
            inputs.append(
                TxInput(
                    txid=v.get("txid"),
                    vout=v.get("vout"),
                    scriptsig_hex=v.get("scriptSig", {}).get("hex"),
                    scriptsig_asm=v.get("scriptSig", {}).get("asm"),
                    sequence=v.get("sequence"),
                    txinwitness=v.get("txinwitness"),
                    prevout=prev,
                )
            )

    outputs: list[TxOutput] = []
    total_out = 0
    for o in raw.get("vout", []):
        value_sats = itc_to_sats(o["value"])
        total_out += value_sats
        spk = o.get("scriptPubKey", {})
        outputs.append(
            TxOutput(
                n=o["n"],
                value_sats=value_sats,
                script_pubkey_hex=spk.get("hex", ""),
                script_pubkey_asm=spk.get("asm"),
                script_pubkey_type=spk.get("type"),
                address=spk.get("address") or (spk.get("addresses") or [None])[0],
            )
        )

    fee_sats: Optional[int] = None
    fee_rate: Optional[float] = None
    if not is_coinbase and total_in > 0:
        fee_sats = max(0, total_in - total_out)
        vsize = raw.get("vsize", raw.get("size", 0))
        if vsize:
            fee_rate = round(fee_sats / vsize, 3)

    return Transaction(
        txid=raw["txid"],
        hash=raw.get("hash"),
        version=raw.get("version", 0),
        locktime=raw.get("locktime", 0),
        size=raw.get("size", 0),
        vsize=raw.get("vsize", raw.get("size", 0)),
        weight=raw.get("weight"),
        fee_sats=fee_sats,
        fee_rate_sat_vbyte=fee_rate,
        block_hash=raw.get("blockhash"),
        block_height=raw.get("height"),
        block_time=raw.get("blocktime") or raw.get("time"),
        confirmations=raw.get("confirmations"),
        in_mempool=raw.get("confirmations") is None or raw.get("confirmations", 0) == 0,
        is_coinbase=is_coinbase,
        inputs=inputs,
        outputs=outputs,
        raw_hex=raw.get("hex"),
    )
