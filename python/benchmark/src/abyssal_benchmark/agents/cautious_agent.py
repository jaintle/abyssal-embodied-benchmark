"""
cautious_agent.py — Cautious PPO baseline (Phase 8)

Design
──────
The cautious baseline is a standard PPO agent trained with two additions:

1. Uncertainty observation (uncertainty_obs=True on the env):
   The agent sees a visibility_quality scalar at obs[40] (range [0, 1]).
   This tells the policy how reliable its current perceptions are.

2. Caution reward shaping (via CautiousRewardWrapper):
   At training time, the reward is penalised for large actions taken under
   poor visibility:

     r_total = r_env  −  caution_coeff × (1 − visibility_quality) × ‖action‖²

   This teaches the policy to take smaller, more conservative actions when
   it cannot trust its sensors.

Benchmark interpretation
────────────────────────
This is a benchmark baseline, not a novel algorithm.  Its purpose is to
demonstrate a quantifiable safety-performance tradeoff:

  Standard PPO / heuristic:
    • High success rate in clear conditions
    • Aggressive action magnitudes
    • Sharp performance drop (collisions) under heavy degradation

  Cautious PPO:
    • Lower mean action magnitude (visible in metrics)
    • Lower collision rate under heavy degradation
    • May time out more often (accepts higher timeout rate for safety)
    • Weaker performance in clear conditions due to conservative behaviour

The gap between standard and cautious baselines is the tradeoff budget
that a more sophisticated algorithm could potentially close.

Artifact parity
───────────────
CautiousAgent saves/loads identically to PPOAgent.  Trained runs produce:
    config.json
    model.zip
    train_summary.json
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import numpy as np
import gymnasium as gym

from .base import BenchmarkAgent

# ─── Reward wrapper ───────────────────────────────────────────────────────────


class CautiousRewardWrapper(gym.Wrapper):
    """
    Gymnasium Wrapper: adds a caution penalty to reward during training.

    The penalty discourages large actions when visibility quality is low.
    It uses the visibility quality signal from obs[-1] (requires
    uncertainty_obs=True on the wrapped env).

    Parameters
    ----------
    env:
        A gym.Env with uncertainty_obs=True (obs dimension = 41).
    caution_coeff:
        Penalty coefficient α.  Higher values → more conservative policy.
        Default: 0.3.  Reasonable range: 0.1 – 0.8.
    """

    def __init__(self, env: gym.Env, caution_coeff: float = 0.3) -> None:
        super().__init__(env)
        self.caution_coeff = caution_coeff

    def step(self, action):  # type: ignore[override]
        obs, reward, terminated, truncated, info = self.env.step(action)
        # obs[-1] = visibility_quality when uncertainty_obs=True
        visibility = float(obs[-1]) if len(obs) > 40 else 1.0
        action_mag_sq = float(np.sum(np.asarray(action, dtype=np.float64) ** 2))
        caution_penalty = -self.caution_coeff * (1.0 - visibility) * action_mag_sq
        return obs, float(reward) + caution_penalty, terminated, truncated, info


# ─── Agent ────────────────────────────────────────────────────────────────────


class CautiousAgent(BenchmarkAgent):
    """
    Cautious PPO benchmark agent.

    Wraps a trained Stable-Baselines3 PPO model that was trained with:
      - uncertainty_obs=True (sees visibility quality at obs[40])
      - CautiousRewardWrapper (penalises large actions under poor visibility)

    At inference time, the model uses the full 41-dim observation and runs
    standard PPO prediction — no additional scaling is applied.  The
    conservative behaviour is fully encoded in the trained weights.

    Parameters
    ----------
    model:
        Loaded SB3 PPO model.  Must have been trained on a 41-dim obs space.
    policy_id:
        Stable identifier for leaderboard output.  Default: "cautious_ppo".
    """

    requires_uncertainty_obs: bool = True

    def __init__(self, model: Any, policy_id: str = "cautious_ppo") -> None:
        self._model = model
        self._policy_id = policy_id

    # ── BenchmarkAgent interface ───────────────────────────────────────────────

    def get_policy_id(self) -> str:
        return self._policy_id

    def reset(self) -> None:
        """No per-episode state — no-op."""

    def predict(
        self,
        obs: np.ndarray,
        deterministic: bool = True,
    ) -> np.ndarray:
        obs_2d = obs[np.newaxis] if obs.ndim == 1 else obs
        action, _ = self._model.predict(obs_2d, deterministic=deterministic)
        return action[0]

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, path: Path) -> None:
        """Save model to *path* (SB3 appends ``.zip`` if missing)."""
        self._model.save(str(path))

    @classmethod
    def load(
        cls,
        path: Path,
        env_factory: Callable[[], Any],
        policy_id: str = "cautious_ppo",
    ) -> "CautiousAgent":
        """
        Load a saved cautious PPO model.

        The *env_factory* must produce envs with uncertainty_obs=True so
        the loaded model's 41-dim observation space matches.
        """
        from stable_baselines3 import PPO
        from stable_baselines3.common.vec_env import DummyVecEnv, VecMonitor

        vec_env = DummyVecEnv([env_factory])
        vec_env = VecMonitor(vec_env)
        model = PPO.load(str(path), env=vec_env)
        return cls(model=model, policy_id=policy_id)

    def num_timesteps(self) -> int:
        return self._model.num_timesteps
