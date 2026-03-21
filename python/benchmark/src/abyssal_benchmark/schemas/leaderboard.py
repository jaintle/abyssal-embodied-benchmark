"""
schemas/leaderboard.py — Public leaderboard manifest schema (Phase A)

Defines the data model for the canonical leaderboard manifest consumed by the
web viewer and maintained by benchmark maintainers.

On disk: ``apps/web/public/data/leaderboard/leaderboard.json``

This schema mirrors ``packages/replay-schema/src/leaderboard.ts``.
Both must be kept in sync.

Usage::

    from abyssal_benchmark.schemas.leaderboard import (
        LeaderboardManifest,
        LeaderboardEntry,
    )
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

from .submission_metadata import SubmissionStatus


# ─── Leaderboard entry ────────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    """
    One row in the public leaderboard manifest.

    Each entry corresponds to a single verified or provisional submission.
    Rejected submissions are excluded from the public manifest entirely.
    """

    submission_id: str = Field(
        description="Unique submission id (kebab-case). Must match the submission bundle.",
    )
    display_name: str = Field(
        description="Human-readable name shown in the leaderboard UI.",
    )
    agent_id: str = Field(
        description="Short policy id, matches policyId in replay headers.",
    )
    team_name: str = Field(
        description="Team or lab name.",
    )
    status: SubmissionStatus = Field(
        description=(
            "Lifecycle status: "
            "'verified' = officially re-run, "
            "'provisional' = submitted but not yet re-run, "
            "'rejected' = excluded (should not appear in public manifest)."
        ),
    )
    benchmark_version: str = Field(
        description="Benchmark protocol version this entry was evaluated against.",
    )
    algorithm_family: str = Field(
        description="High-level algorithm family label.",
    )
    observation_type: str = Field(
        description="'standard' or 'uncertainty'.",
    )

    # ── Artifact paths ────────────────────────────────────────────────────────
    # Relative to the public data root (apps/web/public/data/).

    summary_path: str = Field(
        description=(
            "Relative path from the public data root to the aggregate_summary.json "
            "for this submission. Example: 'submissions/cautious-ppo-v2/summary.json'."
        ),
    )
    replay_path: str = Field(
        description=(
            "Relative path from the public data root to the replays directory "
            "for this submission. Example: 'submissions/cautious-ppo-v2/replays/'."
        ),
    )
    metadata_path: str = Field(
        description=(
            "Relative path from the public data root to the submission metadata.json. "
            "Example: 'submissions/cautious-ppo-v2/metadata.json'."
        ),
    )

    # ── Dates ─────────────────────────────────────────────────────────────────

    date_submitted: str = Field(
        description="ISO-8601 date of initial submission (e.g. '2026-03-21').",
    )
    date_verified: Optional[str] = Field(
        default=None,
        description=(
            "ISO-8601 date of verification. Null until status becomes 'verified'."
        ),
    )

    # ── Key metrics (denormalised for fast UI rendering) ──────────────────────

    clear_success_rate: Optional[float] = Field(
        default=None,
        description="Success rate on the 'clear' preset (0–1). Denormalised from summary.",
        ge=0.0,
        le=1.0,
    )
    heavy_success_rate: Optional[float] = Field(
        default=None,
        description="Success rate on the 'heavy' preset (0–1). Denormalised from summary.",
        ge=0.0,
        le=1.0,
    )
    repo_url: Optional[str] = Field(
        default=None,
        description="Public repository URL (optional, displayed in UI).",
    )
    paper_url: Optional[str] = Field(
        default=None,
        description="Paper or preprint URL (optional, displayed in UI).",
    )


# ─── Manifest ─────────────────────────────────────────────────────────────────

class LeaderboardManifest(BaseModel):
    """
    Root manifest consumed by the web leaderboard.

    Maintained by benchmark maintainers after each submission is processed.
    Do not include ``rejected`` entries in this file.
    """

    manifest_version: str = Field(
        description="Schema version for the manifest format itself. Currently '1.0'.",
    )
    benchmark_version: str = Field(
        description="Benchmark protocol version all listed entries are evaluated against.",
    )
    last_updated: str = Field(
        description="ISO-8601 date this manifest was last modified.",
    )
    entries: List[LeaderboardEntry] = Field(
        default_factory=list,
        description="All public (non-rejected) leaderboard entries, newest first.",
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def validate_leaderboard_manifest(path: Path) -> LeaderboardManifest:
    """Load and validate a leaderboard.json file."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    return LeaderboardManifest.model_validate(raw)
