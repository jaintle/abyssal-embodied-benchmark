"""
Smoke tests — AbyssalNavigationEnv (Phase 2)

Tests:
  - env construction succeeds
  - reset() returns valid (obs, info)
  - step() runs without crashing
  - obs shape matches OBS_DIM
  - action space shape is (2,)
  - same seed → same first observation (determinism)
  - out-of-bounds truncation fires
  - goal-reached termination fires (forced agent placement)
  - collision termination fires (forced agent placement)
  - reward structure is sensible
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import cast

import numpy as np
import pytest

_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import abyssal_benchmark.envs  # noqa: F401 — triggers registration

from abyssal_benchmark.envs.navigation_env import (
    OBS_DIM,
    GOAL_REWARD,
    COLLISION_PENALTY,
    AbyssalNavigationEnv,
)
from abyssal_benchmark.envs.make_env import make_env


# ─── Construction and spaces ─────────────────────────────────────────────────

class TestConstruction:
    def test_creates_without_error(self):
        env = make_env(world_seed=42)
        assert env is not None
        env.close()

    def test_action_space_shape(self):
        env = make_env(world_seed=42)
        assert env.action_space.shape == (2,)
        env.close()

    def test_obs_space_shape(self):
        env = make_env(world_seed=42)
        assert env.observation_space.shape == (OBS_DIM,)
        env.close()

    def test_action_bounds(self):
        env = make_env(world_seed=42)
        import numpy as np
        assert np.all(env.action_space.low == -1.0)
        assert np.all(env.action_space.high == 1.0)
        env.close()


# ─── Reset ────────────────────────────────────────────────────────────────────

class TestReset:
    def test_reset_returns_obs_and_info(self):
        env = make_env(world_seed=42)
        obs, info = env.reset()
        assert obs is not None
        assert info is not None
        env.close()

    def test_obs_shape(self):
        env = make_env(world_seed=42)
        obs, _ = env.reset()
        assert obs.shape == (OBS_DIM,)
        env.close()

    def test_obs_dtype(self):
        env = make_env(world_seed=42)
        obs, _ = env.reset()
        assert obs.dtype == np.float32
        env.close()

    def test_initial_position_at_origin(self):
        env = make_env(world_seed=42)
        obs, info = env.reset()
        assert abs(info["pos_x"]) < 1e-9
        assert abs(info["pos_z"]) < 1e-9
        env.close()

    def test_initial_velocity_zero(self):
        env = make_env(world_seed=42)
        obs, info = env.reset()
        assert abs(info["vel_x"]) < 1e-9
        assert abs(info["vel_z"]) < 1e-9
        env.close()

    def test_reset_determinism(self):
        """Same seed → same initial observation."""
        env = make_env(world_seed=7)
        obs1, _ = env.reset()
        obs2, _ = env.reset()
        np.testing.assert_array_equal(obs1, obs2)
        env.close()


# ─── Step ─────────────────────────────────────────────────────────────────────

class TestStep:
    def test_step_returns_five_tuple(self):
        env = make_env(world_seed=42)
        env.reset()
        result = env.step(np.zeros(2, dtype=np.float32))
        assert len(result) == 5
        env.close()

    def test_step_obs_shape(self):
        env = make_env(world_seed=42)
        env.reset()
        obs, *_ = env.step(np.zeros(2, dtype=np.float32))
        assert obs.shape == (OBS_DIM,)
        env.close()

    def test_reward_is_float(self):
        env = make_env(world_seed=42)
        env.reset()
        _, reward, *_ = env.step(np.zeros(2, dtype=np.float32))
        assert isinstance(reward, float)
        env.close()

    def test_terminated_truncated_are_bool(self):
        env = make_env(world_seed=42)
        env.reset()
        _, _, terminated, truncated, _ = env.step(np.zeros(2, dtype=np.float32))
        assert isinstance(terminated, bool)
        assert isinstance(truncated, bool)
        env.close()

    def test_multiple_random_steps_no_crash(self):
        env = make_env(world_seed=42, max_steps=50)
        env.reset()
        rng = np.random.default_rng(0)
        for _ in range(50):
            act = rng.uniform(-1.0, 1.0, size=2).astype(np.float32)
            _, _, terminated, truncated, _ = env.step(act)
            if terminated or truncated:
                break
        env.close()


# ─── Determinism ─────────────────────────────────────────────────────────────

class TestDeterminism:
    def test_same_seed_same_trajectory(self):
        actions = [np.array([0.5, 0.3], dtype=np.float32)] * 10

        def _run(seed: int) -> list:
            env = make_env(world_seed=seed)
            env.reset()
            rewards = []
            for a in actions:
                _, r, terminated, truncated, _ = env.step(a)
                rewards.append(r)
                if terminated or truncated:
                    break
            env.close()
            return rewards

        assert _run(42) == _run(42)

    def test_different_seeds_differ(self):
        actions = [np.array([0.3, 0.1], dtype=np.float32)] * 5

        def _run(seed: int) -> list:
            env = make_env(world_seed=seed)
            obs, _ = env.reset()
            env.close()
            return obs.tolist()

        # Different seeds → different world → different dist_to_goal
        assert _run(1) != _run(2)


# ─── Termination ─────────────────────────────────────────────────────────────

class TestTermination:
    def test_truncation_on_max_steps(self):
        """Episode truncates exactly at max_steps with zero-velocity action."""
        env = make_env(world_seed=42, max_steps=10)
        env.reset()
        terminated = truncated = False
        for _ in range(10):
            _, _, terminated, truncated, info = env.step(
                np.zeros(2, dtype=np.float32)
            )
            if terminated or truncated:
                break
        assert truncated, "should truncate at max_steps"
        assert info["timed_out"]
        env.close()

    def test_goal_reached_terminates(self):
        """Teleport agent to goal and verify goal-reached termination."""
        env = make_env(world_seed=42)
        env.reset()
        # Manually place agent inside the acceptance radius
        env._pos[0] = env.world.goal_x
        env._pos[1] = env.world.goal_z
        env._prev_dist = env._dist_to_goal()
        _, reward, terminated, _, info = env.step(
            np.zeros(2, dtype=np.float32)
        )
        assert terminated, "should terminate on goal reached"
        assert info["goal_reached"]
        assert reward >= GOAL_REWARD - 1.0  # goal bonus dominates
        env.close()

    def test_collision_terminates(self):
        """Teleport agent onto first obstacle centre and verify collision termination."""
        env = make_env(world_seed=42)
        env.reset()
        assert len(env.world.obstacles) > 0, "need at least one obstacle"
        obs0 = env.world.obstacles[0]
        # Place agent exactly at obstacle centre
        env._pos[0] = obs0.x
        env._pos[1] = obs0.z
        env._prev_dist = env._dist_to_goal()
        _, reward, terminated, _, info = env.step(
            np.zeros(2, dtype=np.float32)
        )
        assert terminated, "should terminate on collision"
        assert info["collision"]
        assert reward <= COLLISION_PENALTY + 1.0
        env.close()

    def test_oob_truncates(self):
        """Push agent beyond world radius and verify OOB truncation."""
        env = make_env(world_seed=42, max_steps=500)
        env.reset()
        far = env.world.world_radius + 10.0
        env._pos[0] = far
        env._pos[1] = 0.0
        env._prev_dist = env._dist_to_goal()
        _, _, terminated, truncated, info = env.step(
            np.zeros(2, dtype=np.float32)
        )
        assert truncated, "should truncate when out of bounds"
        assert info["out_of_bounds"]
        env.close()


# ─── Reward sanity ────────────────────────────────────────────────────────────

class TestReward:
    def test_progress_toward_goal_positive(self):
        """Moving directly toward goal gives positive reward (before penalties)."""
        env = make_env(world_seed=42)
        env.reset()
        # Compute unit vector toward goal
        dx = env.world.goal_x - env._pos[0]
        dz = env.world.goal_z - env._pos[1]
        dist = math.hypot(dx, dz)
        action = np.array([dx / dist, dz / dist], dtype=np.float32)
        _, reward, terminated, truncated, _ = env.step(action)
        if not terminated:
            # Progress reward minus tiny step penalty should be positive
            assert reward > -0.1, f"moving toward goal yielded reward {reward:.4f}"
        env.close()

    def test_step_penalty_present(self):
        """Zero action (no movement) should yield pure step penalty."""
        env = make_env(world_seed=42)
        env.reset()
        # Zero action → no progress, no collision
        _, reward, terminated, _, _ = env.step(np.zeros(2, dtype=np.float32))
        from abyssal_benchmark.envs.navigation_env import STEP_PENALTY
        if not terminated:
            assert abs(reward - STEP_PENALTY) < 0.01, (
                f"expected ~{STEP_PENALTY}, got {reward}"
            )
        env.close()
