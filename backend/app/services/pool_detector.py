"""Mining pool tagging.

Loads patterns from ``data/known_pools.json`` once and applies them to the
coinbase scriptSig (decoded to ASCII, ignoring non-printables) and the
coinbase output address.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from ..config import settings


class PoolDetector:
    def __init__(self):
        self._pools: list[dict] = []
        self.reload()

    def reload(self) -> None:
        self._pools = settings.load_known_pools()

    def _scriptsig_text(self, hex_script: str) -> str:
        try:
            raw = bytes.fromhex(hex_script)
        except Exception:
            return ""
        # Keep printable ASCII, drop the rest
        return "".join(chr(b) if 32 <= b < 127 else " " for b in raw)

    def detect(self, coinbase_scriptsig_hex: str, coinbase_address: Optional[str] = None) -> Optional[dict]:
        text = self._scriptsig_text(coinbase_scriptsig_hex)
        for pool in self._pools:
            tags = pool.get("tags", [])
            for tag in tags:
                if tag and tag in text:
                    return {
                        "name": pool.get("name", "Unknown"),
                        "url": pool.get("url", ""),
                        "color": pool.get("color", "#888"),
                        "matched_tag": tag,
                    }
            if coinbase_address:
                addrs = pool.get("addresses", [])
                if coinbase_address in addrs:
                    return {
                        "name": pool.get("name", "Unknown"),
                        "url": pool.get("url", ""),
                        "color": pool.get("color", "#888"),
                        "matched_address": coinbase_address,
                    }
        return None


_detector: Optional[PoolDetector] = None


def get_pool_detector() -> PoolDetector:
    global _detector
    if _detector is None:
        _detector = PoolDetector()
    return _detector
