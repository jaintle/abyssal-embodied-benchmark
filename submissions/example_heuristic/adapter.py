"""
adapter.py — Goal-Directed Heuristic Baseline (example submission)

This is the simplest possible benchmark-compliant agent:
- No model weights.
- Drives full thrust toward the goal using the relative goal vector
  available in the standard 38-dim observation.
- No obstacle avoidance.

This submission serves two purposes:
1. A realistic example of a complete, runnable submission bundle.
2. An above-random speed upper-bound baseline for comparison.

Observation layout (standard 38-dim, indices used here):
    obs[4]  goal direction dx (normalised)
    obs[5]  goal direction dz (normalised)
    obs[6]  distance to goal (normalised)

Action space:
    float32 (2,) in [-1, 1]
    [0]: thrust (positive = forward)
    [1]: yaw    (positive = rotate right)
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from abyssal_benchmark.agents.base import BenchmarkAgent


# Observation indices
_IDX_GOAL_DX = 4
_IDX_GOAL_DZ = 5
_EPSILON = 1e-6


class Adapter(BenchmarkAgent):
    """
    Goal-directed heuristic adapter.

    Strategy: project the 2-D goal direction vector (dx, dz) onto the
    action space — full thrust in the direction of the goal, no yaw
    control beyond what the environment handles implicitly.
    """

    def get_policy_id(self) -> str:
        return "example-heuristic"

    def load(self, model_dir: Path) -> None:
        """No model weights — heuristic requires no loading."""
        pass

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        dx = float(obs[_IDX_GOAL_DX])
        dz = float(obs[_IDX_GOAL_DZ])

        norm = math.sqrt(dx * dx + dz * dz)
        if norm < _EPSILON:
            return np.zeros(2, dtype=np.float32)

        # Return normalised direction vector as action (thrust + yaw)
        return np.array([dx / norm, dz / norm], dtype=np.float32)

    def reset(self) -> None:
        """Stateless — no-op."""
        pass
