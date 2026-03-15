"""
heuristic_agent.py — Goal-directed heuristic baseline (Phase 5)

A simple rule-based agent that steers toward the goal position using the
relative goal vector available in the observation.

Observation layout (from navigation_env.py):
    obs[0:2]  agent position  (x, z)
    obs[2:4]  agent velocity  (vx, vz)
    obs[4:6]  goal relative   (dx, dz) = goal_pos - agent_pos
    obs[6]    distance to goal
    obs[7]    timestep fraction
    obs[8:40] 8 nearest obstacles × 4 floats

Strategy
────────
The agent applies full thrust in the direction of the goal.  No obstacle
avoidance is implemented — this is intentionally simple to give a clean
"above-random, below-PPO" baseline.

The action is:
    direction = (dx, dz) / ||dx, dz||   (unit vector toward goal)
    action    = direction                (full thrust)

If the goal is already reached (dist ≈ 0), action is zero.
"""

from __future__ import annotations

import math

import numpy as np

from .base import BenchmarkAgent

# Observation index constants (mirrors navigation_env.py layout)
_IDX_GOAL_DX = 4
_IDX_GOAL_DZ = 5
_IDX_DIST = 6

_EPSILON = 1e-6  # avoid division by zero


class HeuristicAgent(BenchmarkAgent):
    """
    Goal-directed heuristic baseline.

    Drives full thrust toward the goal every step.  No obstacle avoidance.

    This agent is stateless.  ``reset()`` is a no-op.

    Parameters
    ----------
    policy_id:
        Human-readable identifier used in benchmark outputs.
    """

    def __init__(self, policy_id: str = "heuristic") -> None:
        self._policy_id = policy_id

    # ── BenchmarkAgent interface ───────────────────────────────────────────────

    def get_policy_id(self) -> str:
        return self._policy_id

    def reset(self) -> None:
        """Stateless — no-op."""

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """
        Return a thrust action directed at the goal.

        Args:
            obs:          1-D float32 observation array of shape (OBS_DIM,).
            deterministic: Ignored — behaviour is always deterministic.

        Returns:
            Action array of shape (2,) with values in [-1, 1].
        """
        dx = float(obs[_IDX_GOAL_DX])
        dz = float(obs[_IDX_GOAL_DZ])

        norm = math.sqrt(dx * dx + dz * dz)
        if norm < _EPSILON:
            return np.zeros(2, dtype=np.float32)

        return np.array([dx / norm, dz / norm], dtype=np.float32)
