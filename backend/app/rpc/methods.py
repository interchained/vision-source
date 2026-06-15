"""Typed wrappers around the standard Bitcoin Core / ITC JSON-RPC methods.

These are the methods the explorer needs for blocks, transactions, mempool,
mining metrics, and network info. Anything address-history related is handled
by ElectrumX (see ``app.electrumx``), not here.
"""

from __future__ import annotations

from typing import Any, Optional

from .client import RPCClient


class BlockchainRPC:
    """Blockchain-domain RPC methods."""

    def __init__(self, client: RPCClient):
        self.c = client

    # ── Tip / blocks ──
    async def get_block_count(self) -> int:
        return await self.c.call("getblockcount")

    async def get_best_block_hash(self) -> str:
        return await self.c.call("getbestblockhash")

    async def get_block_hash(self, height: int) -> str:
        return await self.c.call("getblockhash", [height])

    async def get_block(self, block_hash: str, verbosity: int = 2) -> dict:
        # verbosity=2 => block with full tx data
        return await self.c.call("getblock", [block_hash, verbosity])

    async def get_block_header(self, block_hash: str, verbose: bool = True) -> dict:
        return await self.c.call("getblockheader", [block_hash, verbose])

    async def get_blockchain_info(self) -> dict:
        return await self.c.call("getblockchaininfo")

    # ── Transactions ──
    async def get_raw_transaction(self, txid: str, verbose: bool = True, blockhash: Optional[str] = None) -> Any:
        params = [txid, 1 if verbose else 0]
        if blockhash:
            params.append(blockhash)
        return await self.c.call("getrawtransaction", params)

    async def decode_raw_transaction(self, hex_tx: str) -> dict:
        return await self.c.call("decoderawtransaction", [hex_tx])

    # ── Mempool ──
    async def get_raw_mempool(self, verbose: bool = False) -> Any:
        return await self.c.call("getrawmempool", [verbose])

    async def get_mempool_info(self) -> dict:
        return await self.c.call("getmempoolinfo")

    async def get_mempool_entry(self, txid: str) -> dict:
        return await self.c.call("getmempoolentry", [txid])

    # ── Mining / network ──
    async def get_mining_info(self) -> dict:
        return await self.c.call("getmininginfo")

    async def get_network_hashps(self, blocks: int = 120, height: int = -1) -> float:
        return await self.c.call("getnetworkhashps", [blocks, height])

    async def get_difficulty(self) -> float:
        return await self.c.call("getdifficulty")

    async def get_network_info(self) -> dict:
        return await self.c.call("getnetworkinfo")

    async def get_peer_info(self) -> list:
        return await self.c.call("getpeerinfo")

    # ── Broadcasting ──
    async def send_raw_transaction(self, hex_tx: str) -> str:
        return await self.c.call("sendrawtransaction", [hex_tx])

    # ── Address scanning (on-demand only) ──
    async def scan_tx_out_set(self, action: str, descriptors: list) -> dict:
        return await self.c.call("scantxoutset", [action, descriptors])

    # ── Supply ──
    async def get_tx_out_set_info(self) -> dict:
        """Returns the canonical UTXO-set summary including total_amount
        (the actual circulating supply at the chain tip). This RPC scans
        the entire UTXO set and can take several seconds — callers should
        cache the result aggressively.
        """
        return await self.c.call("gettxoutsetinfo")
