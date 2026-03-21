"""
test_submission_schemas.py — Tests for Phase A submission metadata and leaderboard schemas.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from abyssal_benchmark.schemas.submission_metadata import (
    SubmissionMetadata,
    validate_submission_metadata,
)
from abyssal_benchmark.schemas.leaderboard import (
    LeaderboardEntry,
    LeaderboardManifest,
    validate_leaderboard_manifest,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _valid_metadata_dict() -> dict:
    return {
        "submission_name": "Test Agent v1",
        "submission_id": "test-agent-v1",
        "agent_id": "test-agent",
        "team_name": "Test Lab",
        "author_name": "Alice Researcher",
        "contact": "alice@example.com",
        "repo_url": "https://github.com/example/test-agent",
        "commit_hash": "abc1234",
        "benchmark_version": "1.0.0",
        "algorithm_family": "ppo",
        "observation_type": "standard",
        "training_notes": "PPO baseline, 200k steps.",
        "license": "MIT",
        "submission_status": "provisional",
    }


def _valid_entry_dict() -> dict:
    return {
        "submission_id": "test-agent-v1",
        "display_name": "Test Agent",
        "agent_id": "test-agent",
        "team_name": "Test Lab",
        "status": "provisional",
        "benchmark_version": "1.0.0",
        "algorithm_family": "ppo",
        "observation_type": "standard",
        "summary_path": "submissions/test-agent-v1/summary.json",
        "replay_path": "submissions/test-agent-v1/replays/",
        "metadata_path": "submissions/test-agent-v1/metadata.json",
        "date_submitted": "2026-03-21",
    }


# ─── SubmissionMetadata ───────────────────────────────────────────────────────

class TestSubmissionMetadata:

    def test_valid_minimal(self):
        meta = SubmissionMetadata.model_validate(_valid_metadata_dict())
        assert meta.submission_id == "test-agent-v1"
        assert meta.agent_id == "test-agent"
        assert meta.benchmark_version == "1.0.0"
        assert meta.algorithm_family == "ppo"
        assert meta.submission_status == "provisional"

    def test_valid_with_optional_fields(self):
        d = _valid_metadata_dict()
        d["institution"] = "MIT"
        d["paper_url"] = "https://arxiv.org/abs/1234.5678"
        d["model_size"] = "2.1 M params"
        d["hardware_notes"] = "1× RTX 3090"
        meta = SubmissionMetadata.model_validate(d)
        assert meta.institution == "MIT"
        assert meta.model_size == "2.1 M params"

    def test_invalid_benchmark_version(self):
        d = _valid_metadata_dict()
        d["benchmark_version"] = "0.9.0"
        with pytest.raises(ValidationError, match="benchmark_version"):
            SubmissionMetadata.model_validate(d)

    def test_invalid_submission_id_uppercase(self):
        d = _valid_metadata_dict()
        d["submission_id"] = "TestAgent-v1"  # uppercase not allowed
        with pytest.raises(ValidationError):
            SubmissionMetadata.model_validate(d)

    def test_invalid_algorithm_family(self):
        d = _valid_metadata_dict()
        d["algorithm_family"] = "rainbow-dqn-v7"  # not in enum
        with pytest.raises(ValidationError):
            SubmissionMetadata.model_validate(d)

    def test_invalid_observation_type(self):
        d = _valid_metadata_dict()
        d["observation_type"] = "extended"  # not in enum
        with pytest.raises(ValidationError):
            SubmissionMetadata.model_validate(d)

    def test_invalid_status(self):
        d = _valid_metadata_dict()
        d["submission_status"] = "pending"  # not in enum
        with pytest.raises(ValidationError):
            SubmissionMetadata.model_validate(d)

    def test_uncertainty_observation_type(self):
        d = _valid_metadata_dict()
        d["observation_type"] = "uncertainty"
        meta = SubmissionMetadata.model_validate(d)
        assert meta.observation_type == "uncertainty"

    def test_verified_status(self):
        d = _valid_metadata_dict()
        d["submission_status"] = "verified"
        meta = SubmissionMetadata.model_validate(d)
        assert meta.submission_status == "verified"

    def test_submission_name_max_length(self):
        d = _valid_metadata_dict()
        d["submission_name"] = "x" * 81
        with pytest.raises(ValidationError):
            SubmissionMetadata.model_validate(d)

    def test_training_notes_max_length(self):
        d = _valid_metadata_dict()
        d["training_notes"] = "x" * 501
        with pytest.raises(ValidationError):
            SubmissionMetadata.model_validate(d)

    def test_missing_required_field(self):
        d = _valid_metadata_dict()
        del d["agent_id"]
        with pytest.raises(ValidationError):
            SubmissionMetadata.model_validate(d)


# ─── validate_submission_metadata (file-based) ────────────────────────────────

class TestValidateSubmissionMetadataFile:

    def test_template_metadata_valid(self, tmp_path: Path):
        """The TEMPLATE metadata.json must not have invalid enum values."""
        # The template uses placeholder strings in some fields, but status,
        # algorithm_family, and observation_type must be valid enum values.
        template_path = (
            Path(__file__).parents[4]
            / "submissions" / "TEMPLATE" / "metadata.json"
        )
        if not template_path.exists():
            pytest.skip("submissions/TEMPLATE/metadata.json not found")

        raw = json.loads(template_path.read_text())
        # The template has placeholder strings for some fields — we only check
        # that the enum fields parse correctly, not the full schema.
        assert raw["benchmark_version"] == "1.0.0"
        assert raw["algorithm_family"] in (
            "ppo", "sac", "td3", "dqn", "diffusion", "heuristic", "other"
        )
        assert raw["observation_type"] in ("standard", "uncertainty")
        assert raw["submission_status"] == "provisional"

    def test_validate_from_file(self, tmp_path: Path):
        d = _valid_metadata_dict()
        p = tmp_path / "metadata.json"
        p.write_text(json.dumps(d), encoding="utf-8")
        meta = validate_submission_metadata(p)
        assert meta.submission_id == "test-agent-v1"

    def test_file_not_found(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            validate_submission_metadata(tmp_path / "nonexistent.json")


# ─── LeaderboardManifest ──────────────────────────────────────────────────────

class TestLeaderboardManifest:

    def test_valid_manifest(self):
        manifest = LeaderboardManifest.model_validate({
            "manifest_version": "1.0",
            "benchmark_version": "1.0.0",
            "last_updated": "2026-03-21",
            "entries": [_valid_entry_dict()],
        })
        assert len(manifest.entries) == 1
        assert manifest.entries[0].submission_id == "test-agent-v1"

    def test_empty_entries(self):
        manifest = LeaderboardManifest.model_validate({
            "manifest_version": "1.0",
            "benchmark_version": "1.0.0",
            "last_updated": "2026-03-21",
            "entries": [],
        })
        assert manifest.entries == []

    def test_entry_with_metrics(self):
        d = _valid_entry_dict()
        d["clear_success_rate"] = 0.82
        d["heavy_success_rate"] = 0.44
        d["date_verified"] = "2026-03-22"
        d["status"] = "verified"
        entry = LeaderboardEntry.model_validate(d)
        assert entry.clear_success_rate == pytest.approx(0.82)
        assert entry.date_verified == "2026-03-22"

    def test_success_rate_out_of_range(self):
        d = _valid_entry_dict()
        d["clear_success_rate"] = 1.5  # > 1.0
        with pytest.raises(ValidationError):
            LeaderboardEntry.model_validate(d)

    def test_canonical_leaderboard_json(self):
        """The committed leaderboard.json must validate successfully."""
        manifest_path = (
            Path(__file__).parents[4]
            / "apps" / "web" / "public" / "data" / "leaderboard" / "leaderboard.json"
        )
        if not manifest_path.exists():
            pytest.skip("leaderboard.json not found")
        meta = validate_leaderboard_manifest(manifest_path)
        assert meta.benchmark_version == "1.0.0"
        assert len(meta.entries) > 0
