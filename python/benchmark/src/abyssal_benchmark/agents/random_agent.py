"""
random_agent.py — Random action baseline (Phase 5)

Samples uniformly from the full action space at every step.
Useful as a lower-bound baseline in benchmark comparisons.
"""

from __future__ import annotations

import numpy as np

from .base import BenchmarkAgent


class RandomAgent(BenchmarkAgent):
    """
    Uniformly-random action baseline.

    Actions are sampled independently from U(-1, 1) for each action dimension.
    The agent is stateless: ``reset()`` is a no-op.

    Parameters
    ----------
    seed:
        Random seed for reproducibility.  The seed is set on ``reset()``
        and on construction so that evaluations are deterministic.
    policy_id:
        Human-readable identifier used in benchmark outputs.
    """

    def __init__(self, seed: int = 0, policy_id: str = "random") -> None:
        self._seed = seed
        self._policy_id = policy_id
        self._rng = np.random.default_rng(seed)

    # ── BenchmarkAgent interface ───────────────────────────────────────────────

    def get_policy_id(self) -> str:
        return self._policy_id

    def reset(self) -> None:
        """Re-seed the RNG at the start of each episode for determinism."""
        self._rng = np.random.default_rng(self._seed)

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """
        Return a random action regardless of the observation.

        Args:
            obs:          Ignored.
            deterministic: Ignored — always samples.

        Returns:
            Action array of shape (2,) with values in [-1, 1].
        """
        return self._rng.uniform(-1.0, 1.0, size=(2,)).astype(np.float32)
