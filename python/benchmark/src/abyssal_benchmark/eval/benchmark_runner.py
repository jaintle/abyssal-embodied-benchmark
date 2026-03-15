"""
benchmark_runner.py — Generic multi-agent benchmark runner (Phase 5)

Evaluates any number of agents that implement the BenchmarkAgent interface
on a fixed, identical set of episode seeds.  Produces a standardised result
bundle:

    <output_dir>/
        benchmark_config.json      — run parameters + agent ids
        aggregate_summary.csv      — one row per agent
        aggregate_summary.json     — same data, structured
        per_episode.csv            — one row per (agent_id, episode_seed)
        replays/                   — optional: one JSONL per agent (same seed)

Design
──────
- All agents run on the *identical* seed list.  Comparisons are only valid
  when world_seed, episode_seeds, and max_steps are held constant.
- No parallelism: episodes run sequentially for exact trajectory capture.
- replay_seed controls which episode gets exported as a JSONL replay.
  Set to None to skip replay export.
"""

from __future__ import annotations

import csv
import json
import math
import time
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Union

import numpy as np

from abyssal_benchmark.agents.base import BenchmarkAgent, AgentProtocol
from abyssal_benchmark.envs.make_env import make_env
from abyssal_benchmark.eval.replay_export import export_episode
from abyssal_benchmark.utils.io import get_git_commit, ensure_dir
from abyssal_benchmark.utils.seeding import derive_seed

# ─── Version ──────────────────────────────────────────────────────────────────

BENCHMARK_VERSION = "0.1.0"
ENV_VERSION = "0.1.0"

# ─── Per-episode result ───────────────────────────────────────────────────────


@dataclass
class BenchmarkEpisodeResult:
    agent_id: str
    episode_index: int
    episode_seed: int
    world_seed: int
    total_reward: float
    steps: int
    final_dist: float
    goal_reached: bool
    collision: bool
    timed_out: bool
    out_of_bounds: bool
    elapsed_seconds: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ─── Per-agent aggregate ──────────────────────────────────────────────────────


@dataclass
class AgentBenchmarkSummary:
    agent_id: str
    world_seed: int
    n_episodes: int
    env_version: str
    benchmark_version: str

    success_rate: float
    collision_rate: float
    timeout_rate: float
    oob_rate: float
    mean_reward: float
    std_reward: float
    mean_steps: float
    std_steps: float
    mean_final_dist: float
    std_final_dist: float

    episodes: List[BenchmarkEpisodeResult] = field(default_factory=list)

    def flat_dict(self) -> Dict[str, Any]:
        """Row dict for CSV/JSON (no nested episode list)."""
        d = asdict(self)
        d.pop("episodes", None)
        return d


# ─── Bundle config ────────────────────────────────────────────────────────────


@dataclass
class BenchmarkConfig:
    benchmark_version: str
    env_version: str
    world_seed: int
    episode_seeds: List[int]
    n_episodes: int
    max_steps: int
    agent_ids: List[str]
    recorded_at: str
    git_commit: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ─── Runner ───────────────────────────────────────────────────────────────────


class BenchmarkRunner:
    """
    Evaluate multiple agents on an identical, fixed seed sequence.

    Parameters
    ----------
    world_seed:
        Seed for world geometry (identical across all agents and episodes).
    n_episodes:
        Number of evaluation episodes per agent.
    max_steps:
        Hard truncation limit per episode.
    base_episode_seed:
        Episode seeds are derived as ``derive_seed(base_episode_seed, i)``
        for i in 0..n_episodes-1.
    replay_seed:
        If given, export one JSONL replay per agent for the episode whose
        seed equals this value.  Must be one of the derived episode seeds.
        Pass None to skip replay export.
    verbose:
        Print per-episode progress lines if True.
    """

    def __init__(
        self,
        world_seed: int = 42,
        n_episodes: int = 20,
        max_steps: int = 500,
        base_episode_seed: int = 1000,
        replay_seed: Optional[int] = None,
        verbose: bool = True,
    ) -> None:
        self.world_seed = world_seed
        self.n_episodes = n_episodes
        self.max_steps = max_steps
        self.base_episode_seed = base_episode_seed
        self.replay_seed = replay_seed
        self.verbose = verbose

    def episode_seeds(self) -> List[int]:
        """Deterministic, reproducible list of per-episode seeds."""
        return [derive_seed(self.base_episode_seed, i) for i in range(self.n_episodes)]

    def run(
        self,
        agents: Sequence[Union[BenchmarkAgent, Any]],
        output_dir: Path,
    ) -> List[AgentBenchmarkSummary]:
        """
        Evaluate all agents and write a result bundle to *output_dir*.

        Args:
            agents:     List of BenchmarkAgent-compatible objects.
            output_dir: Directory for result artifacts (created if absent).

        Returns:
            List of AgentBenchmarkSummary, one per agent.
        """
        ensure_dir(output_dir)
        seeds = self.episode_seeds()
        agent_ids = [a.get_policy_id() for a in agents]

        # ── Config artifact ────────────────────────────────────────────────
        config = BenchmarkConfig(
            benchmark_version=BENCHMARK_VERSION,
            env_version=ENV_VERSION,
            world_seed=self.world_seed,
            episode_seeds=seeds,
            n_episodes=self.n_episodes,
            max_steps=self.max_steps,
            agent_ids=agent_ids,
            recorded_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            git_commit=get_git_commit(),
        )
        _write_json(config.to_dict(), output_dir / "benchmark_config.json")

        # ── Evaluate each agent ────────────────────────────────────────────
        summaries: List[AgentBenchmarkSummary] = []
        all_episodes: List[BenchmarkEpisodeResult] = []

        for agent in agents:
            summary = self._evaluate_agent(agent, seeds, output_dir)
            summaries.append(summary)
            all_episodes.extend(summary.episodes)

        # ── Aggregate artifacts ────────────────────────────────────────────
        self._write_aggregate(summaries, output_dir)
        self._write_per_episode(all_episodes, output_dir)

        return summaries

    # ── Private: evaluate one agent ───────────────────────────────────────────

    def _evaluate_agent(
        self,
        agent: Any,
        seeds: List[int],
        output_dir: Path,
    ) -> AgentBenchmarkSummary:
        policy_id = agent.get_policy_id()

        if self.verbose:
            print(
                f"\n── Agent: {policy_id}  "
                f"world_seed={self.world_seed}  "
                f"n_episodes={self.n_episodes}"
            )
            print(
                f"{'ep':>4}  {'seed':>10}  {'reward':>8}  {'steps':>5}  "
                f"{'final_dist':>10}  outcome"
            )
            print("─" * 62)

        episodes: List[BenchmarkEpisodeResult] = []

        for i, ep_seed in enumerate(seeds):
            agent.reset()
            result = self._run_episode(agent, policy_id, i, ep_seed)
            episodes.append(result)

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

            # Export replay if this episode matches replay_seed
            if self.replay_seed is not None and ep_seed == self.replay_seed:
                replay_dir = ensure_dir(output_dir / "replays")
                replay_path = replay_dir / f"replay_{policy_id}_seed_{ep_seed}.jsonl"
                if self.verbose:
                    print(f"  → exporting replay: {replay_path.name}")
                try:
                    export_episode(
                        policy=agent,
                        output_path=replay_path,
                        world_seed=self.world_seed,
                        episode_seed=ep_seed,
                        max_steps=self.max_steps,
                        policy_id=policy_id,
                        env_version=ENV_VERSION,
                    )
                except Exception as exc:  # noqa: BLE001
                    print(f"  [WARN] replay export failed: {exc}")

        if self.verbose:
            print("─" * 62)

        return self._aggregate(policy_id, episodes)

    def _run_episode(
        self,
        agent: Any,
        policy_id: str,
        episode_index: int,
        episode_seed: int,
    ) -> BenchmarkEpisodeResult:
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
            action = agent.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(action)
            total_reward += float(reward)
            steps += 1
            final_info = info
            if terminated or truncated:
                break

        env.close()
        elapsed = time.monotonic() - t0

        return BenchmarkEpisodeResult(
            agent_id=policy_id,
            episode_index=episode_index,
            episode_seed=episode_seed,
            world_seed=self.world_seed,
            total_reward=round(total_reward, 4),
            steps=steps,
            final_dist=round(float(final_info["dist_to_goal"]), 4),
            goal_reached=bool(final_info["goal_reached"]),
            collision=bool(final_info["collision"]),
            timed_out=bool(final_info["timed_out"]),
            out_of_bounds=bool(final_info["out_of_bounds"]),
            elapsed_seconds=round(elapsed, 3),
        )

    # ── Private: aggregation ──────────────────────────────────────────────────

    @staticmethod
    def _aggregate(
        policy_id: str,
        episodes: List[BenchmarkEpisodeResult],
    ) -> AgentBenchmarkSummary:
        n = len(episodes)
        rewards = [e.total_reward for e in episodes]
        steps_list = [float(e.steps) for e in episodes]
        dists = [e.final_dist for e in episodes]

        def _mean(xs: List[float]) -> float:
            return sum(xs) / len(xs) if xs else 0.0

        def _std(xs: List[float]) -> float:
            if len(xs) < 2:
                return 0.0
            m = _mean(xs)
            return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))

        return AgentBenchmarkSummary(
            agent_id=policy_id,
            world_seed=episodes[0].world_seed if episodes else 0,
            n_episodes=n,
            env_version=ENV_VERSION,
            benchmark_version=BENCHMARK_VERSION,
            success_rate=round(sum(1 for e in episodes if e.goal_reached) / n, 4),
            collision_rate=round(sum(1 for e in episodes if e.collision) / n, 4),
            timeout_rate=round(sum(1 for e in episodes if e.timed_out) / n, 4),
            oob_rate=round(sum(1 for e in episodes if e.out_of_bounds) / n, 4),
            mean_reward=round(_mean(rewards), 4),
            std_reward=round(_std(rewards), 4),
            mean_steps=round(_mean(steps_list), 2),
            std_steps=round(_std(steps_list), 2),
            mean_final_dist=round(_mean(dists), 4),
            std_final_dist=round(_std(dists), 4),
            episodes=episodes,
        )

    # ── Private: artifact writers ─────────────────────────────────────────────

    @staticmethod
    def _write_aggregate(
        summaries: List[AgentBenchmarkSummary],
        output_dir: Path,
    ) -> None:
        rows = [s.flat_dict() for s in summaries]
        # CSV
        _write_csv(rows, output_dir / "aggregate_summary.csv")
        # JSON array
        _write_json(rows, output_dir / "aggregate_summary.json")

    @staticmethod
    def _write_per_episode(
        episodes: List[BenchmarkEpisodeResult],
        output_dir: Path,
    ) -> None:
        rows = [e.to_dict() for e in episodes]
        _write_csv(rows, output_dir / "per_episode.csv")


# ─── File helpers ──────────────────────────────────────────────────────────────


def _write_json(data: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _write_csv(rows: List[Dict[str, Any]], path: Path) -> None:
    if not rows:
        path.touch()
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    # Collect all fieldnames across all rows (preserves insertion order in 3.7+)
    fieldnames: List[str] = []
    seen: set = set()
    for row in rows:
        for key in row:
            if key not in seen:
                fieldnames.append(key)
                seen.add(key)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
