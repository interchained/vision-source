"""ITC block emission formula — direct port of the C++ GetBlockSubsidy."""
from __future__ import annotations

import math

_COIN = 100_000_000
_RAMP_UP_END = 259_200
_PEAK_END = 518_400
_DECAY_RATE = 0.0000038405
_MIN_REWARD = 0.10301990


def get_block_subsidy(height: int) -> int:
    """Return the block subsidy in satoshis for the given height."""
    if height <= _RAMP_UP_END:
        progress = height / _RAMP_UP_END
        reward = 0.678 + (1.5 * progress)
    elif height <= _PEAK_END:
        reward = 1.5
    else:
        reward = 1.10301990 * math.exp(-_DECAY_RATE * (height - _PEAK_END))

    if reward < _MIN_REWARD:
        reward = _MIN_REWARD

    return int(reward * _COIN)


def total_supply_at(tip: int) -> int:
    """Σ get_block_subsidy(h) for h in 0..tip (inclusive).

    Used as a fallback when gettxoutsetinfo is unavailable.
    Fast enough for 600k blocks (~50 ms in Python).
    """
    if tip < 0:
        return 0
    total = 0

    # Phase 1: ramp-up (0..ramp_up_end)
    end1 = min(tip, _RAMP_UP_END)
    for h in range(0, end1 + 1):
        progress = h / _RAMP_UP_END
        reward = 0.678 + (1.5 * progress)
        total += int(reward * _COIN)

    if tip <= _RAMP_UP_END:
        return total

    # Phase 2: flat peak (ramp_up_end+1..peak_end)
    end2 = min(tip, _PEAK_END)
    flat_blocks = end2 - _RAMP_UP_END
    total += flat_blocks * int(1.5 * _COIN)

    if tip <= _PEAK_END:
        return total

    # Phase 3: exponential decay (peak_end+1..tip)
    for h in range(_PEAK_END + 1, tip + 1):
        reward = 1.10301990 * math.exp(-_DECAY_RATE * (h - _PEAK_END))
        if reward < _MIN_REWARD:
            reward = _MIN_REWARD
        total += int(reward * _COIN)

    return total
