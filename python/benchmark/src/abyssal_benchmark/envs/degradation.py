"""
degradation.py — Observation degradation for robustness benchmarking (Phase 7)

Applies controlled perceptual noise to the structured observation vector
produced by AbyssalNavigationEnv.  Three named presets are supported:

    clear   — no corruption (baseline)
    mild    — moderate noise + reduced visibility range
    heavy   — strong noise + severe visibility limit + obstacle dropout

Design
──────
Because V1 uses structured state observations (not pixels), degradation is
applied at the feature level:

1. Gaussian noise on goal-relative position features (obs[4:6], obs[6]).
2. Gaussian noise on per-obstacle position features (obs[8::4], obs[9::4]).
3. Visibility masking: obstacle slots whose distance > visibilityRange are
   zeroed (the agent "cannot see" them).
4. Dropout: each remaining obstacle slot is independently zeroed with
   probability dropoutProb.

All randomness is seeded from (episode_seed, step) so runs are fully
reproducible under fixed seeds.

Determinism guarantee
─────────────────────
RNG is seeded as:  rng_seed = (episode_seed * 1_000_003 + step) & 0x7FFF_FFFF
This is cheap, collision-resistant, and keeps each step independent.
"""

from __future__ import annotations

import math
import numpy as np

from ..schemas.world_spec import DegradationSpec, DEGRADATION_PRESETS

# Indices into the 40-dim observation vector (mirrors navigation_env.py)
_IDX_GOAL_DX   = 4
_IDX_GOAL_DZ   = 5
_IDX_GOAL_DIST = 6
_N_OBS_OBSTACLES = 8
_OBS_BASE = 8   # first obstacle feature starts at index 8


def apply_observation_degradation(
    obs: np.ndarray,
    degradation: DegradationSpec,
    episode_seed: int,
    step: int,
) -> np.ndarray:
    """
    Return a degraded copy of *obs* according to *degradation*.

    Parameters
    ----------
    obs:
        Raw float32 observation from the environment (shape: (40,)).
    degradation:
        DegradationSpec for the active preset.
    episode_seed:
        Per-episode seed — used to derive the per-step RNG.
    step:
        Current environment step count.

    Returns
    -------
    np.ndarray — same shape and dtype as *obs*, with degradation applied.
        Returns the original array unchanged when preset == "clear".
    """
    if degradation.preset == "clear":
        return obs  # fast path — no allocation

    # Derive a per-step RNG for full determinism
    rng_seed = int((episode_seed * 1_000_003 + step) & 0x7FFF_FFFF)
    rng = np.random.default_rng(rng_seed)

    out = obs.copy()
    noise = degradation.noiseScale

    # ── 1. Goal-relative noise ────────────────────────────────────────────────
    if noise > 0.0:
        out[_IDX_GOAL_DX]   += float(rng.normal(0.0, noise))
        out[_IDX_GOAL_DZ]   += float(rng.normal(0.0, noise))
        # Distance feature is consistent with noisy goal position
        out[_IDX_GOAL_DIST] = math.sqrt(
            out[_IDX_GOAL_DX] ** 2 + out[_IDX_GOAL_DZ] ** 2
        )

    # ── 2. Per-obstacle noise, visibility mask, dropout ───────────────────────
    vis = degradation.visibilityRange
    drop_p = degradation.dropoutProb

    for i in range(_N_OBS_OBSTACLES):
        base = _OBS_BASE + i * 4
        dist = float(obs[base + 2])  # raw (pre-noise) distance for visibility check

        # Visibility mask: zero slot if obstacle is beyond visibility range
        if dist > 0.0 and dist > vis:
            out[base : base + 4] = 0.0
            continue

        # Dropout: randomly zero the slot with probability drop_p
        if drop_p > 0.0 and rng.random() < drop_p:
            out[base : base + 4] = 0.0
            continue

        # Gaussian noise on position features (rel_x, rel_z)
        if noise > 0.0:
            out[base]     += float(rng.normal(0.0, noise))
            out[base + 1] += float(rng.normal(0.0, noise))
            # Re-derive distance from noisy relative position
            out[base + 2] = max(
                0.0,
                math.sqrt(out[base] ** 2 + out[base + 1] ** 2),
            )
            # Radius is a physical measurement — no noise

    return out
