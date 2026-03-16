"""
evaluate_policy.py — Fixed-seed evaluation harness (Phase 3)

Runs N episodes with a fixed sequence of episode seeds, records per-episode
metrics, and returns an EvalSummary.

Design
──────
- World geometry is fixed (one world_seed).
- Each episode uses a different episode_seed drawn from a deterministic list
  so that evaluations are reproducible and comparable across policies.
- No vectorisation: episodes run sequentially for simplicity and exact
  trajectory capture.
- The policy must implement predict(obs) → action (numpy, shape (2,)).
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Callable, Dict, List, Optional, Protocol

import numpy as np

from abyssal_benchmark.envs.make_env import make_env
from abyssal_benchmark.utils.seeding import derive_seed


# ─── Policy Protocol ──────────────────────────────────────────────────────────

class Policy(Protocol):
    """Minimal interface expected of any policy passed to the harness."""

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        ...


# ─── Per-episode result ───────────────────────────────────────────────────────

@dataclass
class EpisodeResult:
    episode_index: int
    episode_seed: int
    total_reward: float
    steps: int
    final_dist: float          # distance to goal at episode end (m)
    goal_reached: bool
    collision: bool
    timed_out: bool
    out_of_bounds: bool
    elapsed_seconds: float


# ─── Aggregate summary ────────────────────────────────────────────────────────

@dataclass
class EvalSummary:
    world_seed: int
    n_episodes: int
    policy_id: str
    env_version: str

    # Aggregate statistics
    success_rate: float        # fraction of episodes where goal was reached
    collision_rate: float      # fraction of episodes with collision
    timeout_rate: float        # fraction truncated by max_steps
    oob_rate: float            # fraction truncated by out-of-bounds
    mean_reward: float
    std_reward: float
    mean_steps: float
    std_steps: float
    mean_final_dist: float
    std_final_dist: float

    # Per-episode details
    episodes: List[EpisodeResult] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # episodes list may be large — keep it but serialise compactly
        return d

    def flat_dict(self) -> Dict[str, Any]:
        """Flat dict for CSV writing (no nested episodes list)."""
        d = self.to_dict()
        d.pop("episodes", None)
        return d


# ─── Harness ──────────────────────────────────────────────────────────────────

class EvaluationHarness:
    """
    Runs fixed-seed evaluation episodes for a given policy.

    Parameters
    ----------
    world_seed:
        Seed used to build the navigation world.
    n_episodes:
        Number of evaluation episodes to run.
    max_steps:
        Hard truncation limit per episode.
    base_episode_seed:
        Episode seeds are derived as ``derive_seed(base_episode_seed, i)``
        for i in 0..n_episodes-1, giving a reproducible, distinct sequence.
    policy_id:
        Human-readable identifier recorded in the summary.
    env_version:
        Version string recorded in the summary.
    verbose:
        Print per-episode progress if True.
    """

    def __init__(
        self,
        world_seed: int = 42,
        n_episodes: int = 20,
        max_steps: int = 500,
        base_episode_seed: int = 1000,
        policy_id: str = "unknown",
        env_version: str = "1.0.0",
        verbose: bool = True,
    ) -> None:
        self.world_seed = world_seed
        self.n_episodes = n_episodes
        self.max_steps = max_steps
        self.base_episode_seed = base_episode_seed
        self.policy_id = policy_id
        self.env_version = env_version
        self.verbose = verbose

    def episode_seeds(self) -> List[int]:
        """Deterministic list of per-episode seeds."""
        return [derive_seed(self.base_episode_seed, i) for i in range(self.n_episodes)]

    def evaluate(self, policy: Policy) -> EvalSummary:
        """
        Run all episodes and return an EvalSummary.

        Args:
            policy: Any object with a ``predict(obs, deterministic=True)``
                    method returning a numpy action array of shape (2,).
        """
        seeds = self.episode_seeds()
        results: List[EpisodeResult] = []

        if self.verbose:
            print(f"── Evaluation  world_seed={self.world_seed}  "
                  f"n_episodes={self.n_episodes}  policy={self.policy_id}")
            print(f"{'ep':>4}  {'seed':>10}  {'reward':>8}  {'steps':>5}  "
                  f"{'final_dist':>10}  outcome")
            print("─" * 62)

        for i, ep_seed in enumerate(seeds):
            result = self._run_episode(i, ep_seed, policy)
            results.append(result)

            if self.verbose:
                outcome = (
                    "GOAL" if result.goal_reached
                    else "COLL" if result.collision
                    else "TOUT" if result.timed_out
                    else "OOB"
                )
                print(
                    f"{i:>4}  {ep_seed:>10}  {result.total_reward:>+8.2f}  "
                    f"{result.steps:>5}  {result.final_dist:>10.2f}  {outcome}"
                )

        if self.verbose:
            print("─" * 62)

        return self._aggregate(results)

    # ── Private helpers ───────────────────────────────────────────────────────

    def _run_episode(
        self,
        episode_index: int,
        episode_seed: int,
        policy: Policy,
    ) -> EpisodeResult:
        env = make_env(
            world_seed=self.world_seed,
            episode_seed=episode_seed,
            max_steps=self.max_steps,
        )

        t0 = time.monotonic()
        obs, info = env.reset()
        total_reward = 0.0
        steps = 0
        final_info = info
        terminated = truncated = False

        while True:
            action = policy.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(action)
            total_reward += float(reward)
            steps += 1
            final_info = info
            if terminated or truncated:
                break

        env.close()
        elapsed = time.monotonic() - t0

        return EpisodeResult(
            episode_index=episode_index,
            episode_seed=episode_seed,
            total_reward=total_reward,
            steps=steps,
            final_dist=float(final_info["dist_to_goal"]),
            goal_reached=bool(final_info["goal_reached"]),
            collision=bool(final_info["collision"]),
            timed_out=bool(final_info["timed_out"]),
            out_of_bounds=bool(final_info["out_of_bounds"]),
            elapsed_seconds=round(elapsed, 3),
        )

    def _aggregate(self, results: List[EpisodeResult]) -> EvalSummary:
        n = len(results)
        rewards = [r.total_reward for r in results]
        steps_list = [r.steps for r in results]
        dists = [r.final_dist for r in results]

        def _mean(xs: List[float]) -> float:
            return sum(xs) / len(xs) if xs else 0.0

        def _std(xs: List[float]) -> float:
            if len(xs) < 2:
                return 0.0
            m = _mean(xs)
            return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))

        return EvalSummary(
            world_seed=self.world_seed,
            n_episodes=n,
            policy_id=self.policy_id,
            env_version=self.env_version,
            success_rate=sum(1 for r in results if r.goal_reached) / n,
            collision_rate=sum(1 for r in results if r.collision) / n,
            timeout_rate=sum(1 for r in results if r.timed_out) / n,
            oob_rate=sum(1 for r in results if r.out_of_bounds) / n,
            mean_reward=_mean(rewards),
            std_reward=_std(rewards),
            mean_steps=_mean([float(s) for s in steps_list]),
            std_steps=_std([float(s) for s in steps_list]),
            mean_final_dist=_mean(dists),
            std_final_dist=_std(dists),
            episodes=results,
        )
