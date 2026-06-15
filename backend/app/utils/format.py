"""Formatting helpers (sats <-> ITC, fee rate, byte sizes)."""

from __future__ import annotations

from decimal import Decimal, getcontext

getcontext().prec = 28
SATS_PER_ITC = Decimal("100000000")


def sats_to_itc(sats: int | str) -> str:
    return f"{Decimal(sats) / SATS_PER_ITC:.8f}"


def itc_to_sats(itc: str | float | Decimal) -> int:
    return int((Decimal(str(itc)) * SATS_PER_ITC).to_integral_value())


def fee_rate_sat_vbyte(fee_btc: float | str | Decimal, vsize: int) -> float:
    if vsize <= 0:
        return 0.0
    sats = int(Decimal(str(fee_btc)) * SATS_PER_ITC)
    return round(sats / vsize, 3)


def human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.2f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n:.2f} GB"
