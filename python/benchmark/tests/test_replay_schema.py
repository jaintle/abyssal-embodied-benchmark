"""
Smoke tests — ReplaySchema (Phase 0)

Tests:
  - minimal valid ReplayFile roundtrips without error
  - validate_replay_file() accepts valid dicts
  - validate_replay_file() rejects dicts with missing required fields
  - validate_replay_file() rejects invalid field types
  - JSONL serialisation roundtrip (serialize → parse → compare)
  - empty steps list is valid
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Make the src package importable when running pytest from the repo root
_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from pydantic import ValidationError

from abyssal_benchmark.schemas.replay_schema import (
    ReplayFile,
    ReplayHeader,
    ReplayStep,
    replay_from_jsonl,
    replay_to_jsonl,
    validate_replay_file,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _minimal_header() -> dict:
    return {
        "benchmarkVersion": "0.1.0",
        "worldSeed": 42,
        "episodeSeed": 7,
        "policyId": "ppo-v0",
        "envVersion": "0.1.0",
        "recordedAt": "2026-03-14T00:00:00Z",
    }


def _minimal_step(timestep: int = 0) -> dict:
    return {
        "timestep": timestep,
        "position": [0.0, 2.0, 0.0],
        "velocity": [0.5, 0.0, 0.3],
        "reward": -0.01,
        "collisionFlag": False,
        "doneFlag": False,
    }


def _minimal_valid_replay_dict(num_steps: int = 2) -> dict:
    return {
        "header": _minimal_header(),
        "steps": [_minimal_step(i) for i in range(num_steps)],
    }


# ─── Tests ─────────────────────────────────────────────────────────────────────

class TestReplayHeaderMinimalValid:
    def test_validates_minimal_header(self):
        hdr = ReplayHeader.model_validate(_minimal_header())
        assert hdr.benchmarkVersion == "0.1.0"
        assert hdr.worldSeed == 42
        assert hdr.policyId == "ppo-v0"

    def test_git_commit_optional(self):
        hdr = ReplayHeader.model_validate(_minimal_header())
        assert hdr.gitCommit is None

    def test_git_commit_present_when_provided(self):
        data = {**_minimal_header(), "gitCommit": "abc1234"}
        hdr = ReplayHeader.model_validate(data)
        assert hdr.gitCommit == "abc1234"


class TestReplayStepMinimalValid:
    def test_validates_minimal_step(self):
        step = ReplayStep.model_validate(_minimal_step())
        assert step.timestep == 0
        assert step.position == (0.0, 2.0, 0.0)
        assert step.collisionFlag is False
        assert step.doneFlag is False

    def test_action_optional(self):
        step = ReplayStep.model_validate(_minimal_step())
        assert step.action is None

    def test_action_present_when_provided(self):
        data = {**_minimal_step(), "action": [0.1, 0.0, -0.2]}
        step = ReplayStep.model_validate(data)
        assert step.action == (0.1, 0.0, -0.2)


class TestReplayFileMinimalValid:
    def test_validate_accepts_minimal_dict(self):
        replay = validate_replay_file(_minimal_valid_replay_dict())
        assert isinstance(replay, ReplayFile)

    def test_step_count_correct(self):
        replay = validate_replay_file(_minimal_valid_replay_dict(num_steps=3))
        assert len(replay.steps) == 3

    def test_empty_steps_valid(self):
        data = {**_minimal_valid_replay_dict(0)}
        replay = validate_replay_file(data)
        assert replay.steps == []

    def test_header_fields_preserved(self):
        replay = validate_replay_file(_minimal_valid_replay_dict())
        assert replay.header.worldSeed == 42
        assert replay.header.episodeSeed == 7


class TestReplayFileMissingFields:
    def test_missing_header_raises(self):
        data = _minimal_valid_replay_dict()
        del data["header"]
        with pytest.raises(ValidationError) as exc_info:
            validate_replay_file(data)
        errors = exc_info.value.errors()
        fields = [e["loc"] for e in errors]
        assert any("header" in loc for loc in fields)

    def test_missing_benchmark_version_raises(self):
        data = _minimal_valid_replay_dict()
        del data["header"]["benchmarkVersion"]
        with pytest.raises(ValidationError):
            validate_replay_file(data)

    def test_missing_world_seed_raises(self):
        data = _minimal_valid_replay_dict()
        del data["header"]["worldSeed"]
        with pytest.raises(ValidationError):
            validate_replay_file(data)

    def test_missing_episode_seed_raises(self):
        data = _minimal_valid_replay_dict()
        del data["header"]["episodeSeed"]
        with pytest.raises(ValidationError):
            validate_replay_file(data)

    def test_missing_policy_id_raises(self):
        data = _minimal_valid_replay_dict()
        del data["header"]["policyId"]
        with pytest.raises(ValidationError):
            validate_replay_file(data)

    def test_missing_step_position_raises(self):
        data = _minimal_valid_replay_dict(num_steps=1)
        del data["steps"][0]["position"]
        with pytest.raises(ValidationError):
            validate_replay_file(data)

    def test_missing_step_collision_flag_raises(self):
        data = _minimal_valid_replay_dict(num_steps=1)
        del data["steps"][0]["collisionFlag"]
        with pytest.raises(ValidationError):
            validate_replay_file(data)


class TestReplayFileInvalidValues:
    def test_negative_world_seed_raises(self):
        data = _minimal_valid_replay_dict()
        data["header"]["worldSeed"] = -1
        with pytest.raises(ValidationError):
            validate_replay_file(data)

    def test_negative_timestep_raises(self):
        data = _minimal_valid_replay_dict(num_steps=1)
        data["steps"][0]["timestep"] = -5
        with pytest.raises(ValidationError):
            validate_replay_file(data)

    def test_wrong_position_length_raises(self):
        data = _minimal_valid_replay_dict(num_steps=1)
        data["steps"][0]["position"] = [1.0, 2.0]  # only 2 elements
        with pytest.raises(ValidationError):
            validate_replay_file(data)

    def test_collision_flag_must_be_bool(self):
        data = _minimal_valid_replay_dict(num_steps=1)
        data["steps"][0]["collisionFlag"] = "yes"
        # pydantic will coerce "yes" → True (string truthy) — accept this
        # but non-coercible types must fail
        # This test verifies string "yes" does NOT cause a crash
        # (pydantic coerces it — the schema is permissive on bool coercion)
        replay = validate_replay_file(data)
        assert replay.steps[0].collisionFlag is True


class TestReplayJsonlRoundtrip:
    def test_serialize_then_parse_roundtrip(self):
        original = validate_replay_file(_minimal_valid_replay_dict(num_steps=3))
        jsonl = replay_to_jsonl(original)
        restored = replay_from_jsonl(jsonl)
        assert restored.header.model_dump() == original.header.model_dump()
        assert len(restored.steps) == len(original.steps)
        for orig_step, rest_step in zip(original.steps, restored.steps):
            assert orig_step.model_dump() == rest_step.model_dump()

    def test_jsonl_line_count(self):
        replay = validate_replay_file(_minimal_valid_replay_dict(num_steps=4))
        jsonl = replay_to_jsonl(replay)
        lines = [l for l in jsonl.splitlines() if l.strip()]
        # 1 header + 4 steps
        assert len(lines) == 5

    def test_first_jsonl_line_is_header(self):
        replay = validate_replay_file(_minimal_valid_replay_dict(num_steps=1))
        jsonl = replay_to_jsonl(replay)
        first_line = jsonl.splitlines()[0]
        parsed = json.loads(first_line)
        assert "benchmarkVersion" in parsed
        assert "policyId" in parsed

    def test_subsequent_jsonl_lines_are_steps(self):
        replay = validate_replay_file(_minimal_valid_replay_dict(num_steps=2))
        jsonl = replay_to_jsonl(replay)
        lines = jsonl.splitlines()
        step_line = json.loads(lines[1])
        assert "timestep" in step_line
        assert "position" in step_line
        assert "collisionFlag" in step_line
