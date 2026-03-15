"""
test_benchmark_runner.py — Phase 5 tests

Covers:
  - Agent interface compliance (RandomAgent, HeuristicAgent, PPOAgent)
  - BenchmarkRunner output structure and contents
  - Result bundle artifacts (files exist, CSV rows, JSON keys)
  - Identical seed protocol (all agents evaluated on same seeds)
  - Replay export (optional)
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
import pytest

from abyssal_benchmark.agents.base import BenchmarkAgent, AgentProtocol
from abyssal_benchmark.agents.random_agent import RandomAgent
from abyssal_benchmark.agents.heuristic_agent import HeuristicAgent
from abyssal_benchmark.eval.benchmark_runner import BenchmarkRunner, BENCHMARK_VERSION

# ─── Constants ────────────────────────────────────────────────────────────────

WORLD_SEED = 7
N_EPISODES = 3
MAX_STEPS = 30          # short for fast tests
BASE_EP_SEED = 500


# ─── Agent interface tests ────────────────────────────────────────────────────

class TestAgentInterface:
    def test_random_is_benchmark_agent(self):
        assert isinstance(RandomAgent(), BenchmarkAgent)

    def test_heuristic_is_benchmark_agent(self):
        assert isinstance(HeuristicAgent(), BenchmarkAgent)

    def test_random_satisfies_protocol(self):
        assert isinstance(RandomAgent(), AgentProtocol)

    def test_heuristic_satisfies_protocol(self):
        assert isinstance(HeuristicAgent(), AgentProtocol)

    def test_random_policy_id(self):
        assert RandomAgent(policy_id="r1").get_policy_id() == "r1"

    def test_heuristic_policy_id(self):
        assert HeuristicAgent(policy_id="h1").get_policy_id() == "h1"

    def test_random_action_shape(self):
        obs = np.zeros(40, dtype=np.float32)
        action = RandomAgent().predict(obs)
        assert action.shape == (2,)

    def test_random_action_in_range(self):
        obs = np.zeros(40, dtype=np.float32)
        for _ in range(50):
            action = RandomAgent().predict(obs)
            assert np.all(action >= -1.0) and np.all(action <= 1.0)

    def test_heuristic_action_shape(self):
        obs = np.zeros(40, dtype=np.float32)
        obs[4] = 3.0  # dx toward goal
        obs[5] = 4.0  # dz toward goal
        action = HeuristicAgent().predict(obs)
        assert action.shape == (2,)

    def test_heuristic_action_normalized(self):
        obs = np.zeros(40, dtype=np.float32)
        obs[4] = 3.0
        obs[5] = 4.0
        action = HeuristicAgent().predict(obs)
        norm = float(np.linalg.norm(action))
        assert abs(norm - 1.0) < 1e-5

    def test_heuristic_points_toward_goal(self):
        obs = np.zeros(40, dtype=np.float32)
        obs[4] = 1.0   # pure x direction
        obs[5] = 0.0
        action = HeuristicAgent().predict(obs)
        assert abs(action[0] - 1.0) < 1e-5
        assert abs(action[1]) < 1e-5

    def test_heuristic_zero_goal_dist(self):
        obs = np.zeros(40, dtype=np.float32)
        obs[4] = 0.0
        obs[5] = 0.0
        action = HeuristicAgent().predict(obs)
        assert np.all(action == 0.0)

    def test_random_reset_is_deterministic(self):
        """Same seed after reset → same first action."""
        agent = RandomAgent(seed=42)
        obs = np.zeros(40, dtype=np.float32)
        a1 = agent.predict(obs)
        agent.reset()
        a2 = agent.predict(obs)
        np.testing.assert_array_equal(a1, a2)


# ─── BenchmarkRunner tests ────────────────────────────────────────────────────

class TestBenchmarkRunner:
    @pytest.fixture
    def tmp_bundle(self, tmp_path):
        return tmp_path / "bundle"

    @pytest.fixture
    def agents(self):
        return [
            RandomAgent(seed=0, policy_id="random"),
            HeuristicAgent(policy_id="heuristic"),
        ]

    @pytest.fixture
    def runner(self):
        return BenchmarkRunner(
            world_seed=WORLD_SEED,
            n_episodes=N_EPISODES,
            max_steps=MAX_STEPS,
            base_episode_seed=BASE_EP_SEED,
            replay_seed=None,
            verbose=False,
        )

    def test_run_returns_one_summary_per_agent(self, runner, agents, tmp_bundle):
        summaries = runner.run(agents, tmp_bundle)
        assert len(summaries) == len(agents)

    def test_summary_agent_ids_match(self, runner, agents, tmp_bundle):
        summaries = runner.run(agents, tmp_bundle)
        ids = {s.agent_id for s in summaries}
        expected = {"random", "heuristic"}
        assert ids == expected

    def test_summary_n_episodes(self, runner, agents, tmp_bundle):
        summaries = runner.run(agents, tmp_bundle)
        for s in summaries:
            assert s.n_episodes == N_EPISODES

    def test_summary_rates_in_range(self, runner, agents, tmp_bundle):
        summaries = runner.run(agents, tmp_bundle)
        for s in summaries:
            assert 0.0 <= s.success_rate <= 1.0
            assert 0.0 <= s.collision_rate <= 1.0
            assert 0.0 <= s.timeout_rate <= 1.0
            assert 0.0 <= s.oob_rate <= 1.0

    def test_summary_rates_sum_to_one(self, runner, agents, tmp_bundle):
        summaries = runner.run(agents, tmp_bundle)
        for s in summaries:
            total = s.success_rate + s.collision_rate + s.timeout_rate + s.oob_rate
            assert abs(total - 1.0) < 1e-6

    def test_episodes_count_per_summary(self, runner, agents, tmp_bundle):
        summaries = runner.run(agents, tmp_bundle)
        for s in summaries:
            assert len(s.episodes) == N_EPISODES

    def test_identical_seeds_used(self, runner, agents, tmp_bundle):
        """All agents see the same episode seeds."""
        summaries = runner.run(agents, tmp_bundle)
        seed_lists = [
            tuple(e.episode_seed for e in s.episodes)
            for s in summaries
        ]
        assert all(sl == seed_lists[0] for sl in seed_lists), \
            "Episode seeds differ across agents — breaks identical seed protocol"


# ─── Artifact file tests ──────────────────────────────────────────────────────

class TestBundleArtifacts:
    @pytest.fixture
    def bundle_dir(self, tmp_path):
        agents = [
            RandomAgent(seed=0, policy_id="random"),
            HeuristicAgent(policy_id="heuristic"),
        ]
        runner = BenchmarkRunner(
            world_seed=WORLD_SEED,
            n_episodes=N_EPISODES,
            max_steps=MAX_STEPS,
            base_episode_seed=BASE_EP_SEED,
            verbose=False,
        )
        runner.run(agents, tmp_path / "bundle")
        return tmp_path / "bundle"

    def test_benchmark_config_exists(self, bundle_dir):
        assert (bundle_dir / "benchmark_config.json").exists()

    def test_aggregate_csv_exists(self, bundle_dir):
        assert (bundle_dir / "aggregate_summary.csv").exists()

    def test_aggregate_json_exists(self, bundle_dir):
        assert (bundle_dir / "aggregate_summary.json").exists()

    def test_per_episode_csv_exists(self, bundle_dir):
        assert (bundle_dir / "per_episode.csv").exists()

    def test_benchmark_config_keys(self, bundle_dir):
        with open(bundle_dir / "benchmark_config.json") as f:
            cfg = json.load(f)
        for key in ("benchmark_version", "world_seed", "episode_seeds",
                    "n_episodes", "max_steps", "agent_ids", "recorded_at"):
            assert key in cfg, f"Missing key: {key}"

    def test_benchmark_config_values(self, bundle_dir):
        with open(bundle_dir / "benchmark_config.json") as f:
            cfg = json.load(f)
        assert cfg["world_seed"] == WORLD_SEED
        assert cfg["n_episodes"] == N_EPISODES
        assert cfg["max_steps"] == MAX_STEPS
        assert cfg["benchmark_version"] == BENCHMARK_VERSION
        assert set(cfg["agent_ids"]) == {"random", "heuristic"}
        assert len(cfg["episode_seeds"]) == N_EPISODES

    def test_aggregate_csv_row_count(self, bundle_dir):
        with open(bundle_dir / "aggregate_summary.csv") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == 2  # one per agent

    def test_aggregate_csv_required_columns(self, bundle_dir):
        with open(bundle_dir / "aggregate_summary.csv") as f:
            reader = csv.DictReader(f)
            cols = set(reader.fieldnames or [])
        for col in ("agent_id", "success_rate", "collision_rate", "mean_reward",
                    "mean_final_dist", "n_episodes"):
            assert col in cols, f"Missing column: {col}"

    def test_per_episode_csv_row_count(self, bundle_dir):
        with open(bundle_dir / "per_episode.csv") as f:
            rows = list(csv.DictReader(f))
        # 2 agents × N_EPISODES episodes each
        assert len(rows) == 2 * N_EPISODES

    def test_per_episode_csv_required_columns(self, bundle_dir):
        with open(bundle_dir / "per_episode.csv") as f:
            reader = csv.DictReader(f)
            cols = set(reader.fieldnames or [])
        for col in ("agent_id", "episode_seed", "world_seed", "total_reward",
                    "steps", "goal_reached", "collision"):
            assert col in cols, f"Missing column: {col}"

    def test_aggregate_json_is_list(self, bundle_dir):
        with open(bundle_dir / "aggregate_summary.json") as f:
            data = json.load(f)
        assert isinstance(data, list)
        assert len(data) == 2


# ─── Replay export tests ──────────────────────────────────────────────────────

class TestReplayExport:
    def test_replay_files_created(self, tmp_path):
        """When replay_seed is set, one replay file per agent is written."""
        from abyssal_benchmark.utils.seeding import derive_seed
        ep_seed = derive_seed(BASE_EP_SEED, 0)

        agents = [HeuristicAgent(policy_id="heuristic")]
        runner = BenchmarkRunner(
            world_seed=WORLD_SEED,
            n_episodes=N_EPISODES,
            max_steps=MAX_STEPS,
            base_episode_seed=BASE_EP_SEED,
            replay_seed=ep_seed,
            verbose=False,
        )
        runner.run(agents, tmp_path / "bundle")

        replay_dir = tmp_path / "bundle" / "replays"
        assert replay_dir.exists()
        replay_files = list(replay_dir.glob("*.jsonl"))
        assert len(replay_files) == 1

    def test_replay_file_is_valid_jsonl(self, tmp_path):
        from abyssal_benchmark.utils.seeding import derive_seed
        ep_seed = derive_seed(BASE_EP_SEED, 0)

        agents = [HeuristicAgent(policy_id="heuristic")]
        runner = BenchmarkRunner(
            world_seed=WORLD_SEED,
            n_episodes=N_EPISODES,
            max_steps=MAX_STEPS,
            base_episode_seed=BASE_EP_SEED,
            replay_seed=ep_seed,
            verbose=False,
        )
        runner.run(agents, tmp_path / "bundle")

        replay_dir = tmp_path / "bundle" / "replays"
        replay_file = next(replay_dir.glob("*.jsonl"))
        lines = replay_file.read_text().strip().split("\n")
        # JSONL format: line 0 is a flat ReplayHeader JSON object (no "header" wrapper)
        # Lines 1+ are ReplayStep objects
        header_obj = json.loads(lines[0])
        assert "worldSeed" in header_obj, "Line 0 must be a ReplayHeader object"
        assert header_obj["worldSeed"] == WORLD_SEED
        assert "benchmarkVersion" in header_obj
        assert len(lines) > 1, "Replay must contain at least one step"
