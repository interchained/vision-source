"""Typed wrappers around the ITSL token RPC methods.

All token methods route through the /wallet/{name} URL prefix because
interchainedd requires a loaded wallet for signing operations. This mirrors
itc-tools/itsl.py exactly. Read-only methods (all_tokens, token_meta, etc.)
also work via the wallet endpoint and are kept consistent here.
"""

from __future__ import annotations

from typing import Any, List, Optional

from .client import RPCClient


def _b(value: bool) -> str:
    """The token RPCs accept lowercase string booleans, not JSON booleans."""
    return "true" if value else "false"


class TokenRPC:
    """ITSL token-domain RPC methods."""

    def __init__(self, client: RPCClient):
        self.c = client

    # ── Read-only ──
    async def all_tokens(self) -> List[dict]:
        # Chain-wide enumeration. MUST be called on the BASE RPC endpoint
        # (use_wallet=False) — when called via /wallet/{name} the node
        # filters the result to tokens that wallet has interacted with,
        # which is why the registry was previously showing only locally-
        # deployed tokens. The wallet-scoped variant is `my_tokens`.
        return await self.c.call("all_tokens", [], use_wallet=False)

    async def my_tokens(self, witness: bool = True) -> List[dict]:
        """Wallet-scoped: only tokens the loaded wallet has interacted with."""
        return await self.c.call("my_tokens", [_b(witness)], use_wallet=True)

    async def token_meta(self, token_id: str) -> dict:
        return await self.c.call("token_meta", [token_id], use_wallet=True)

    async def token_history(self, token_id: str, filter_addr: Optional[str] = None) -> list:
        params = [token_id]
        if filter_addr:
            params.append(filter_addr)
        return await self.c.call("token_history", params, use_wallet=True)

    async def token_total_supply(self, token_id: str) -> str:
        return await self.c.call("tokentotalsupply", [token_id], use_wallet=True)

    async def get_token_balance_of(self, token_id: str, address: str) -> str:
        return await self.c.call("gettokenbalanceof", [token_id, address], use_wallet=True)

    async def get_token_balance(
        self, token_id: str, witness: bool = False, address: Optional[str] = None
    ) -> str:
        params = [token_id, _b(witness)]
        if address:
            params.append(address)
        return await self.c.call("gettokenbalance", params, use_wallet=True)

    async def token_allowance(self, owner: str, spender: str, token_id: str) -> str:
        return await self.c.call("tokenallowance", [owner, spender, token_id], use_wallet=True)

    async def token_tx_memo(self, token_id: str, txid: str) -> str:
        return await self.c.call("token_tx_memo", [token_id, txid], use_wallet=True)

    async def get_signer_address(self) -> str:
        return await self.c.call("getsigneraddress", [], use_wallet=True)

    async def get_governance_balance(self) -> Any:
        return await self.c.call("getgovernancebalance", [], use_wallet=True)

    # ── Write / signing operations (require wallet WIF) ──
    async def create_token(
        self,
        amount: str,
        name: str,
        symbol: str,
        decimals: int,
        witness: bool = True,
        wif_key: Optional[str] = None,
    ) -> dict:
        # The createtoken RPC requires ALL numeric params as JSON strings
        # (verified by node response "JSON value is not a string as expected").
        # This matches the canonical itsl.py reference.
        params: list = [str(amount), name, symbol, str(decimals), _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("createtoken", params, use_wallet=True)

    async def token_transfer(
        self,
        to: str,
        token_id: str,
        amount: str,
        memo: str = "",
        witness: bool = True,
        wif_key: Optional[str] = None,
    ) -> dict:
        params: list = [to, token_id, str(amount), memo, _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("tokentransfer", params, use_wallet=True)

    async def token_transfer_from(
        self,
        from_addr: str,
        to: str,
        token_id: str,
        amount: str,
        memo: str = "",
        witness: bool = True,
        wif_key: Optional[str] = None,
    ) -> dict:
        params: list = [from_addr, to, token_id, str(amount), memo, _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("tokentransferfrom", params, use_wallet=True)

    async def token_approve(
        self,
        spender: str,
        token_id: str,
        amount: str,
        witness: bool = True,
        wif_key: Optional[str] = None,
    ) -> dict:
        params: list = [spender, token_id, str(amount), _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("tokenapprove", params, use_wallet=True)

    async def token_increase_allowance(
        self, spender: str, token_id: str, amount: str,
        witness: bool = True, wif_key: Optional[str] = None,
    ) -> dict:
        params: list = [spender, token_id, str(amount), _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("tokenincreaseallowance", params, use_wallet=True)

    async def token_decrease_allowance(
        self, spender: str, token_id: str, amount: str,
        witness: bool = True, wif_key: Optional[str] = None,
    ) -> dict:
        params: list = [spender, token_id, str(amount), _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("tokendecreaseallowance", params, use_wallet=True)

    async def token_burn(
        self, token_id: str, amount: str,
        witness: bool = True, wif_key: Optional[str] = None,
    ) -> dict:
        params: list = [token_id, str(amount), _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("tokenburn", params, use_wallet=True)

    async def token_mint(
        self, token_id: str, amount: str,
        witness: bool = True, wif_key: Optional[str] = None,
    ) -> dict:
        params: list = [token_id, str(amount), _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("tokenmint", params, use_wallet=True)

    async def token_transfer_ownership(
        self, token_id: str, new_owner: str,
        witness: bool = True, wif_key: Optional[str] = None,
    ) -> dict:
        params: list = [token_id, new_owner, _b(witness)]
        if wif_key:
            params.append(wif_key)
        return await self.c.call("tokentransferownership", params, use_wallet=True)
