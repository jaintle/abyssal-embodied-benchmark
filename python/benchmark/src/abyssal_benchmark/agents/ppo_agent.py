"""
PPO agent — Phase 3 / Phase 5

Thin wrapper around Stable-Baselines3 PPO that:

1. Accepts a ``make_env`` factory (allows different world/episode seeds).
2. Uses a tuned MLP policy config appropriate for the 40-dim structured
   observation.
3. Exposes ``train()``, ``save()``, ``load()``, and ``predict()`` in a
   minimal, benchmark-oriented API.
4. (Phase 5) Implements the BenchmarkAgent interface so it can be evaluated
   generically by BenchmarkRunner.

Design notes
────────────
- No image observations: MLP only.
- No Vectorized normalisation layer (VecNormalize) in V1; reward scale is
  already bounded, and we want replays to use raw rewards.
- Tensorboard logging is optional; set ``tensorboard_log`` to a path to
  enable it.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecMonitor

from .base import BenchmarkAgent

# ─── Defaults ─────────────────────────────────────────────────────────────────

DEFAULT_POLICY_KWARGS: Dict[str, Any] = {
    "net_arch": [256, 256],
    "activation_fn": None,  # Resolved lazily below to avoid importing torch at module load
}

DEFAULT_PPO_KWARGS: Dict[str, Any] = {
    "learning_rate": 3e-4,
    "n_steps": 2048,
    "batch_size": 64,
    "n_epochs": 10,
    "gamma": 0.99,
    "gae_lambda": 0.95,
    "clip_range": 0.2,
    "ent_coef": 0.005,
    "vf_coef": 0.5,
    "max_grad_norm": 0.5,
    "verbose": 1,
}


# ─── Agent ────────────────────────────────────────────────────────────────────

class PPOAgent(BenchmarkAgent):
    """
    PPO baseline agent for AbyssalNavigationEnv.

    Parameters
    ----------
    env_factory:
        Zero-argument callable that returns a fresh ``gym.Env``.  Called
        once (n_envs=1) to build the training VecEnv.
    policy_kwargs:
        Overrides for the SB3 MLP policy kwargs.
    ppo_kwargs:
        Overrides for SB3 PPO constructor kwargs.
    tensorboard_log:
        Optional path for tensorboard logs.
    seed:
        SB3 global seed (affects weight init and action sampling).
    """

    def __init__(
        self,
        env_factory: Callable[[], Any],
        policy_kwargs: Optional[Dict[str, Any]] = None,
        ppo_kwargs: Optional[Dict[str, Any]] = None,
        tensorboard_log: Optional[str] = None,
        seed: int = 0,
        policy_id: str = "ppo",
    ) -> None:
        import torch.nn as nn  # deferred to avoid hard startup cost

        self._policy_id = policy_id

        # Build policy kwargs, defaulting activation to Tanh
        pk = dict(DEFAULT_POLICY_KWARGS)
        pk["activation_fn"] = nn.Tanh
        if policy_kwargs:
            pk.update(policy_kwargs)

        # Build PPO kwargs
        kw = dict(DEFAULT_PPO_KWARGS)
        if ppo_kwargs:
            kw.update(ppo_kwargs)

        # Wrap env
        vec_env = DummyVecEnv([env_factory])
        vec_env = VecMonitor(vec_env)

        self._model = PPO(
            policy="MlpPolicy",
            env=vec_env,
            policy_kwargs=pk,
            tensorboard_log=tensorboard_log,
            seed=seed,
            **kw,
        )

    # ── BenchmarkAgent interface ───────────────────────────────────────────────

    def get_policy_id(self) -> str:
        """Return a stable policy identifier for leaderboard output."""
        return self._policy_id

    def reset(self) -> None:
        """No per-episode state — no-op."""

    # ── Training ──────────────────────────────────────────────────────────────

    def train(
        self,
        total_timesteps: int,
        reset_num_timesteps: bool = True,
        progress_bar: bool = False,
    ) -> "PPOAgent":
        """
        Run PPO training for *total_timesteps* environment steps.

        Returns ``self`` for chaining.
        """
        self._model.learn(
            total_timesteps=total_timesteps,
            reset_num_timesteps=reset_num_timesteps,
            progress_bar=progress_bar,
        )
        return self

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, path: Path) -> None:
        """Save model to *path* (SB3 appends ``.zip`` if missing)."""
        self._model.save(str(path))

    @classmethod
    def load(
        cls,
        path: Path,
        env_factory: Callable[[], Any],
        policy_id: str = "ppo",
    ) -> "PPOAgent":
        """
        Load a saved PPO model.

        Returns a ``PPOAgent`` instance whose ``_model`` is populated from
        the checkpoint.  The ``env_factory`` is used to rebuild the VecEnv
        so predict() and eval can run.
        """
        vec_env = DummyVecEnv([env_factory])
        vec_env = VecMonitor(vec_env)
        agent = object.__new__(cls)
        agent._model = PPO.load(str(path), env=vec_env)
        agent._policy_id = policy_id
        return agent

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict(
        self,
        obs: np.ndarray,
        deterministic: bool = True,
    ) -> np.ndarray:
        """
        Return the action for a single *obs* array.

        Args:
            obs:          Shape (OBS_DIM,) or (1, OBS_DIM).
            deterministic: Use mean action (True) or sample (False).

        Returns:
            Action array of shape (2,).
        """
        obs_2d = obs[np.newaxis] if obs.ndim == 1 else obs
        action, _ = self._model.predict(obs_2d, deterministic=deterministic)
        return action[0]

    # ── Introspection ─────────────────────────────────────────────────────────

    @property
    def model(self) -> PPO:
        """Direct access to the underlying SB3 PPO model."""
        return self._model

    def num_timesteps(self) -> int:
        """Return the total environment steps seen so far."""
        return self._model.num_timesteps
