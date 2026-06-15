"""Block enrichment: subsidy calculation, coinbase decoding, miner detection."""

from __future__ import annotations

from typing import Optional

from ..models.block import Block, CoinbaseDetail
from ..rpc.methods import BlockchainRPC
from ..utils.emission import get_block_subsidy
from ..utils.format import itc_to_sats
from .pool_detector import get_pool_detector

# Coinbase outputs require COINBASE_MATURITY confirmations before they can be spent.
COINBASE_MATURITY = 100


async def enrich_coinbase(rpc: BlockchainRPC, block: dict, tip_height: int) -> Optional[CoinbaseDetail]:
    txs = block.get("tx") or []
    if not txs:
        return None
    cb_tx = txs[0]
    if isinstance(cb_tx, str):
        cb_tx = await rpc.get_raw_transaction(cb_tx, verbose=True, blockhash=block.get("hash"))
        if not isinstance(cb_tx, dict):
            return None

    vin0 = (cb_tx.get("vin") or [{}])[0]
    if "coinbase" not in vin0:
        return None
    scriptsig_hex = vin0["coinbase"]
    try:
        raw = bytes.fromhex(scriptsig_hex)
        scriptsig_text = "".join(chr(b) if 32 <= b < 127 else "." for b in raw)
    except Exception:
        scriptsig_text = ""

    # Find first spendable output (skip OP_RETURN / nulldata)
    addr = None
    for vout in (cb_tx.get("vout") or []):
        spk = vout.get("scriptPubKey", {})
        if spk.get("type") in ("nulldata", "nonstandard"):
            continue
        addr = spk.get("address") or (spk.get("addresses") or [None])[0]
        if addr:
            break

    pool = get_pool_detector().detect(scriptsig_hex, addr)

    height = block.get("height", 0)
    total = sum(itc_to_sats(o["value"]) for o in (cb_tx.get("vout") or []))
    subsidy = get_block_subsidy(height)
    fee_reward = max(0, total - subsidy)

    confirmations = max(0, tip_height - height + 1)
    matured = confirmations >= COINBASE_MATURITY
    maturity = {
        "matured": matured,
        "confirmations": confirmations,
        "needed": COINBASE_MATURITY,
        "blocks_remaining": max(0, COINBASE_MATURITY - confirmations),
    }

    return CoinbaseDetail(
        address=addr,
        scriptsig_hex=scriptsig_hex,
        scriptsig_text=scriptsig_text,
        miner=pool,
        subsidy_sats=subsidy,
        fee_sats=fee_reward,
        total_sats=total,
        maturity=maturity,
    )


async def shape_block(rpc: BlockchainRPC, raw: dict, tip_height: int) -> Block:
    coinbase = await enrich_coinbase(rpc, raw, tip_height)
    txs_field = raw.get("tx") or []
    txids = [t if isinstance(t, str) else t.get("txid", "") for t in txs_field]
    return Block(
        height=raw.get("height", 0),
        hash=raw.get("hash", ""),
        confirmations=raw.get("confirmations", 0),
        version=raw.get("version", 0),
        version_hex=raw.get("versionHex", ""),
        merkleroot=raw.get("merkleroot", ""),
        time=raw.get("time", 0),
        mediantime=raw.get("mediantime"),
        nonce=raw.get("nonce", 0),
        bits=raw.get("bits", ""),
        difficulty=raw.get("difficulty", 0.0),
        chainwork=raw.get("chainwork"),
        n_tx=raw.get("nTx", len(txids)),
        previousblockhash=raw.get("previousblockhash"),
        nextblockhash=raw.get("nextblockhash"),
        size=raw.get("size", 0),
        strippedsize=raw.get("strippedsize"),
        weight=raw.get("weight"),
        coinbase=coinbase,
        txids=txids,
    )
