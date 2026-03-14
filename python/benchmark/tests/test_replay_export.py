"""
Smoke tests — replay export (Phase 3)

Tests:
  - record_episode() returns a valid ReplayFile
  - header fields match the episode configuration
  - steps are non-empty
  - step fields obey schema constraints
  - position/velocity are Vec3 (3-tuples of floats)
  - action is Vec3 with Y=0 (2-D → 3-D mapping)
  - validate_replay_file() accepts the exported payload
  - export_episode() writes a readable JSONL file
  - JSONL round-trip recovers the full replay
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest

_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import abyssal_benchmark.envs  # noqa: F401 — triggers registration

from abyssal_benchmark.eval.replay_export import record_episode, export_episode
from abyssal_benchmark.schemas.replay_schema import (
    validate_replay_file,
    replay_from_jsonl_file,
)


# ─── Minimal stub policy ──────────────────────────────────────────────────────

class ZeroPolicy:
    """Always returns a zero action — deterministic, reaches max_steps."""

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        return np.zeros(2, dtype=np.float32)


# ─── Helpers ──────────────────────────────────────────────────────────────────

_WORLD_SEED = 42
_EP_SEED = 0
_MAX_STEPS = 10
_POLICY_ID = "zero-policy"


def _record() -> object:
    """Run a short episode and return the ReplayFile."""
    return record_episode(
        policy=ZeroPolicy(),
        world_seed=_WORLD_SEED,
        episode_seed=_EP_SEED,
        max_steps=_MAX_STEPS,
        policy_id=_POLICY_ID,
    )


# ─── Header tests ─────────────────────────────────────────────────────────────

class TestReplayHeader:
    def test_returns_replay_file(self):
        replay = _record()
        # Import here to avoid circular issues in test discovery
        from abyssal_benchmark.schemas.replay_schema import ReplayFile
        assert isinstance(replay, ReplayFile)

    def test_header_world_seed(self):
        replay = _record()
        assert replay.header.worldSeed == _WORLD_SEED

    def test_header_episode_seed(self):
        replay = _record()
        assert replay.header.episodeSeed == _EP_SEED

    def test_header_policy_id(self):
        replay = _record()
        assert replay.header.policyId == _POLICY_ID

    def test_header_benchmark_version(self):
        replay = _record()
        assert replay.header.benchmarkVersion == "0.1.0"

    def test_header_recorded_at_is_string(self):
        replay = _record()
        assert isinstance(replay.header.recordedAt, str)
        assert len(replay.header.recordedAt) > 0


# ─── Steps tests ──────────────────────────────────────────────────────────────

class TestReplaySteps:
    def test_steps_non_empty(self):
        replay = _record()
        assert len(replay.steps) > 0

    def test_steps_count_leq_max_steps(self):
        replay = _record()
        assert len(replay.steps) <= _MAX_STEPS

    def test_timesteps_monotone(self):
        replay = _record()
        ts = [s.timestep for s in replay.steps]
        assert ts == list(range(len(ts)))

    def test_position_is_vec3(self):
        replay = _record()
        for step in replay.steps:
            assert len(step.position) == 3
            assert all(isinstance(v, float) for v in step.position)

    def test_velocity_is_vec3(self):
        replay = _record()
        for step in replay.steps:
            assert len(step.velocity) == 3
            assert all(isinstance(v, float) for v in step.velocity)

    def test_action_is_vec3(self):
        replay = _record()
        for step in replay.steps:
            assert step.action is not None
            assert len(step.action) == 3

    def test_position_y_is_zero(self):
        """2-D env maps Y=0 always."""
        replay = _record()
        for step in replay.steps:
            assert step.position[1] == 0.0

    def test_velocity_y_is_zero(self):
        replay = _record()
        for step in replay.steps:
            assert step.velocity[1] == 0.0

    def test_action_y_is_zero(self):
        replay = _record()
        for step in replay.steps:
            assert step.action[1] == 0.0

    def test_done_flag_only_on_last_step(self):
        """doneFlag should be True only at the final step."""
        replay = _record()
        for step in replay.steps[:-1]:
            assert not step.doneFlag, f"doneFlag True before last step at ts={step.timestep}"
        assert replay.steps[-1].doneFlag

    def test_reward_is_float(self):
        replay = _record()
        for step in replay.steps:
            assert isinstance(step.reward, float)


# ─── Schema validation ────────────────────────────────────────────────────────

class TestSchemaValidation:
    def test_validate_replay_file_accepts(self):
        """validate_replay_file() must not raise on a recorded replay."""
        replay = _record()
        raw = {
            "header": replay.header.model_dump(),
            "steps": [s.model_dump() for s in replay.steps],
        }
        validated = validate_replay_file(raw)
        assert validated.header.worldSeed == _WORLD_SEED
        assert len(validated.steps) == len(replay.steps)


# ─── File I/O ─────────────────────────────────────────────────────────────────

class TestFileIO:
    def test_export_writes_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "replay.jsonl"
            replay = export_episode(
                policy=ZeroPolicy(),
                output_path=out,
                world_seed=_WORLD_SEED,
                episode_seed=_EP_SEED,
                max_steps=_MAX_STEPS,
                policy_id=_POLICY_ID,
            )
            assert out.exists()
            assert out.stat().st_size > 0

    def test_jsonl_roundtrip(self):
        """Writing then reading must recover identical header and step count."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "replay.jsonl"
            original = export_episode(
                policy=ZeroPolicy(),
                output_path=out,
                world_seed=_WORLD_SEED,
                episode_seed=_EP_SEED,
                max_steps=_MAX_STEPS,
                policy_id=_POLICY_ID,
            )
            recovered = replay_from_jsonl_file(out)
            assert recovered.header.worldSeed == original.header.worldSeed
            assert recovered.header.episodeSeed == original.header.episodeSeed
            assert len(recovered.steps) == len(original.steps)

    def test_jsonl_step_values_preserved(self):
        """First step position must survive JSONL round-trip."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out = Path(tmpdir) / "replay.jsonl"
            original = export_episode(
                policy=ZeroPolicy(),
                output_path=out,
                world_seed=_WORLD_SEED,
                episode_seed=_EP_SEED,
                max_steps=_MAX_STEPS,
                policy_id=_POLICY_ID,
            )
            recovered = replay_from_jsonl_file(out)
            assert recovered.steps[0].position == pytest.approx(
                original.steps[0].position
            )
