"""
schemas/submission_metadata.py — Submission metadata schema (Phase A)

Defines the Pydantic model for the ``metadata.json`` that every community
submission must include.

This schema mirrors ``packages/replay-schema/src/submissionMetadata.ts``.
Both must be kept in sync whenever fields are added or renamed.

On-disk format
--------------
A plain JSON file named ``metadata.json`` in the submission root::

    {
        "submission_name": "Cautious PPO v2",
        "submission_id": "cautious-ppo-v2",
        ...
    }

Validation
----------
Use :func:`validate_submission_metadata` to load and validate a file::

    from abyssal_benchmark.schemas.submission_metadata import (
        validate_submission_metadata,
    )
    meta = validate_submission_metadata(Path("submissions/my-agent/metadata.json"))

Or call the CLI script directly::

    python python/benchmark/scripts/validate_submission_metadata.py \\
        submissions/my-agent/metadata.json
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ─── Constants ────────────────────────────────────────────────────────────────

SUPPORTED_BENCHMARK_VERSIONS = {"1.0.0"}

AlgorithmFamily = Literal["ppo", "sac", "td3", "dqn", "diffusion", "heuristic", "other"]
ObservationType  = Literal["standard", "uncertainty"]
SubmissionStatus = Literal["provisional", "verified", "rejected"]


# ─── Schema ───────────────────────────────────────────────────────────────────

class SubmissionMetadata(BaseModel):
    """
    Canonical metadata for a community benchmark submission.

    All fields use snake_case to match the JSON file on disk.
    """

    # ── Identity ──────────────────────────────────────────────────────────────

    submission_name: str = Field(
        description="Human-readable name for this submission. Max 80 characters.",
        min_length=1,
        max_length=80,
    )
    submission_id: str = Field(
        description=(
            "Unique kebab-case identifier. Format: <agent-name>-v<N>. "
            "Used in artifact paths and leaderboard references."
        ),
        pattern=r"^[a-z0-9][a-z0-9\-]*[a-z0-9]$",
    )
    agent_id: str = Field(
        description=(
            "Short stable policy id. Must match the policyId field in all "
            "submitted replay headers. Kebab-case, no version suffix needed."
        ),
        pattern=r"^[a-z0-9][a-z0-9\-]*[a-z0-9]$",
    )

    # ── Authorship ────────────────────────────────────────────────────────────

    team_name: str = Field(description="Team or lab name.")
    author_name: str = Field(description="Primary contact full name.")
    contact: str = Field(description="Contact email address.")
    institution: Optional[str] = Field(
        default=None,
        description="Affiliated institution or company (optional).",
    )

    # ── Provenance ────────────────────────────────────────────────────────────

    repo_url: str = Field(
        description="URL to the public repository containing the adapter and training code.",
    )
    commit_hash: str = Field(
        description="Git commit hash of the adapter at the time of submission.",
        min_length=7,
    )
    paper_url: Optional[str] = Field(
        default=None,
        description="URL to an associated paper or preprint (optional).",
    )

    # ── Benchmark compatibility ───────────────────────────────────────────────

    benchmark_version: str = Field(
        description="Benchmark protocol version this submission targets. Must be '1.0.0'.",
    )

    @field_validator("benchmark_version")
    @classmethod
    def _check_benchmark_version(cls, v: str) -> str:
        if v not in SUPPORTED_BENCHMARK_VERSIONS:
            raise ValueError(
                f"benchmark_version '{v}' is not supported. "
                f"Supported: {sorted(SUPPORTED_BENCHMARK_VERSIONS)}"
            )
        return v

    # ── Algorithm characterisation ────────────────────────────────────────────

    algorithm_family: AlgorithmFamily = Field(
        description=(
            "High-level algorithm family. One of: "
            "ppo, sac, td3, dqn, diffusion, heuristic, other."
        ),
    )
    observation_type: ObservationType = Field(
        description=(
            "Observation space variant used. "
            "'standard' = 38-dim; 'uncertainty' = 41-dim (includes sensor confidence)."
        ),
    )
    training_notes: str = Field(
        description=(
            "Brief description of training procedure, environment config used, "
            "and any non-standard hyperparameters. Max 500 characters."
        ),
        max_length=500,
    )
    model_size: Optional[str] = Field(
        default=None,
        description="Approximate model size, e.g. '2.1 M params'. Optional.",
    )
    hardware_notes: Optional[str] = Field(
        default=None,
        description="Training hardware description, e.g. '1× RTX 3090, 4 h'. Optional.",
    )

    # ── Licensing ─────────────────────────────────────────────────────────────

    license: str = Field(
        description=(
            "SPDX license identifier for the adapter and associated weights, "
            "e.g. 'MIT', 'Apache-2.0', 'CC-BY-4.0'."
        ),
        min_length=2,
    )

    # ── Status ────────────────────────────────────────────────────────────────

    submission_status: SubmissionStatus = Field(
        description=(
            "Submission lifecycle status. "
            "Must be 'provisional' on initial submission. "
            "Only maintainers set 'verified' or 'rejected'."
        ),
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def validate_submission_metadata(path: Path) -> SubmissionMetadata:
    """
    Load and validate a ``metadata.json`` file.

    Args:
        path: Path to the ``metadata.json`` file.

    Returns:
        A validated :class:`SubmissionMetadata` instance.

    Raises:
        FileNotFoundError: if the file does not exist.
        json.JSONDecodeError: if the file is not valid JSON.
        pydantic.ValidationError: if the content fails schema validation.
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    return SubmissionMetadata.model_validate(raw)


def load_submission_metadata_dict(path: Path) -> dict:
    """Return the raw dict from a ``metadata.json`` without schema validation."""
    return json.loads(path.read_text(encoding="utf-8"))
