"""
seeding.py — Deterministic seeding utilities

All benchmark runs must log and restore these seeds to guarantee
reproducibility. Every seed is an integer; no global state is used.
"""

from __future__ import annotations

import random
from typing import Callable, Dict

# ─── Uint32 mask ──────────────────────────────────────────────────────────────

_U32 = 0xFFFF_FFFF


# ─── Mulberry32 RNG ───────────────────────────────────────────────────────────


def make_rng(seed: int) -> Callable[[], float]:
    """
    Create a Mulberry32 pseudo-random number generator.

    Mirrors createRNG() in packages/worldgen/src/noise.ts exactly.
    Returns a zero-argument callable that yields floats in [0, 1).

    The algorithm:
        s  = (s + 0x6D2B79F5) & UINT32
        t  = imul32(s ^ (s >> 15),  1 | s)
        t  = (t + imul32(t ^ (t >> 7), 61 | t)) ^ t
        return ((t ^ (t >> 14)) & UINT32) / 0xFFFFFFFF

    Usage::

        rng = make_rng(42)
        x = rng()   # float in [0, 1)
    """
    state = [seed & _U32]

    def rng() -> float:
        s = (state[0] + 0x6D2B79F5) & _U32
        state[0] = s
        # imul32(a, b) = (a * b) & UINT32
        t = (s ^ (s >> 15)) * (1 | s) & _U32
        t = ((t + ((t ^ (t >> 7)) * (61 | t) & _U32)) ^ t) & _U32
        return ((t ^ (t >> 14)) & _U32) / 0xFFFFFFFF

    return rng


# ─── Deterministic child-seed derivation ─────────────────────────────────────


def derive_seed(parent_seed: int, salt: int) -> int:
    """
    Derive a child seed from a parent seed + a salt integer.

    Mirrors deriveChildSeed() in packages/worldgen/src/worldSpec.ts so that
    seeds computed in TypeScript and Python are identical for the same inputs.

    Args:
        parent_seed: Non-negative integer.
        salt:        Non-negative integer distinguishing child seeds.

    Returns:
        A non-negative integer in [0, 2**31).
    """
    a = ((parent_seed ^ (parent_seed >> 16)) * 0x45D9F3B) & _U32
    b = (a ^ (a >> 16)) * ((salt + 0x9E3779B9) & _U32) & _U32
    return ((b ^ (b >> 16)) & _U32) % (2**31)


# ─── Cross-library seeding ────────────────────────────────────────────────────


def seed_all(seed: int) -> Dict[str, int]:
    """
    Seed Python stdlib, NumPy, and PyTorch with derived child seeds.

    Uses three distinct child seeds to prevent accidental correlation between
    libraries that share an RNG state.

    Args:
        seed: Master seed integer (any non-negative value).

    Returns:
        Dict mapping library name → seed value used, for logging.
    """
    import numpy as np

    py_seed = derive_seed(seed, salt=0)
    np_seed = derive_seed(seed, salt=1) % (2**32)  # NumPy needs uint32
    torch_seed = derive_seed(seed, salt=2)

    random.seed(py_seed)
    np.random.seed(np_seed)

    try:
        import torch

        torch.manual_seed(torch_seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(torch_seed)
    except ImportError:
        pass  # torch is optional at seeding time

    return {
        "python": py_seed,
        "numpy": np_seed,
        "torch": torch_seed,
    }
