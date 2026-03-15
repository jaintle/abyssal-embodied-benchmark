"""
make_env.py — Environment factory and Gymnasium registration

Provides a clean constructor path for creating AbyssalNavigationEnv instances
from a seed + config dict, and registers the env under a stable Gymnasium ID.

Registration
------------
Registered ID: "AbyssalNavigation-v0"

Usage::

    import gymnasium as gym
    import abyssal_benchmark.envs  # triggers registration

    env = gym.make("AbyssalNavigation-v0", world_seed=42)

Or via the factory directly::

    from abyssal_benchmark.envs.make_env import make_env

    env = make_env(world_seed=99, max_steps=300)
    env = make_env(world_seed=99, max_steps=300, degradation_preset="heavy")
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from .navigation_env import AbyssalNavigationEnv

# ─── Registration ─────────────────────────────────────────────────────────────

_REGISTERED = False

ENV_ID = "AbyssalNavigation-v0"
_ENTRY_POINT = (
    "abyssal_benchmark.envs.navigation_env:AbyssalNavigationEnv"
)


def register_envs() -> None:
    """
    Register AbyssalNavigation-v0 with Gymnasium.

    Safe to call multiple times — registration is idempotent.
    """
    global _REGISTERED
    if _REGISTERED:
        return

    import gymnasium as gym

    # Only register if not already present (handles hot-reload scenarios)
    if ENV_ID not in gym.envs.registry:
        gym.register(
            id=ENV_ID,
            entry_point=_ENTRY_POINT,
            max_episode_steps=None,  # controlled by env itself
        )
    _REGISTERED = True


# ─── Factory ──────────────────────────────────────────────────────────────────


def make_env(
    world_seed: int = 42,
    episode_seed: int = 0,
    max_steps: int = 500,
    env_version: str = "0.1.0",
    degradation_preset: str = "clear",
    uncertainty_obs: bool = False,
    config_overrides: Optional[Dict[str, Any]] = None,
) -> AbyssalNavigationEnv:
    """
    Construct an AbyssalNavigationEnv from a seed and optional config.

    This is the recommended entry point for scripts and training code.
    It ensures seeds are explicit, documented, and logged.

    Args:
        world_seed:          Procedural world seed (determines geometry).
        episode_seed:        Per-episode randomness seed.
        max_steps:           Hard step limit per episode.
        env_version:         Env contract version string for replay headers.
        degradation_preset:  Named degradation preset applied to observations.
                             One of "clear" (default), "mild", or "heavy".
        uncertainty_obs:     When True, append a visibility quality scalar
                             (obs[40]) to extend the obs from 40 → 41 dims.
                             Required for cautious_ppo agents. Default False.
        config_overrides:    Optional dict of additional kwargs forwarded to
                             AbyssalNavigationEnv.__init__.

    Returns:
        A fully initialised, non-reset AbyssalNavigationEnv.
    """
    kwargs: Dict[str, Any] = {
        "world_seed": world_seed,
        "episode_seed": episode_seed,
        "max_steps": max_steps,
        "env_version": env_version,
        "degradation_preset": degradation_preset,
        "uncertainty_obs": uncertainty_obs,
    }
    if config_overrides:
        kwargs.update(config_overrides)

    return AbyssalNavigationEnv(**kwargs)
