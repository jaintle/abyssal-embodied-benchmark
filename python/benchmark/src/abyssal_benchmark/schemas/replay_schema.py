"""
Replay Schema Contract — Phase 0 (Python mirror)

Mirrors packages/replay-schema/src/replaySchema.ts exactly.
Field names, types, and semantics must stay in sync with the TypeScript
definition. Replay files are newline-delimited JSON (JSONL):

    Line 0:    ReplayHeader  — one JSON object
    Lines 1…N: ReplayStep    — one JSON object per timestep

The in-memory representation is ReplayFile, which wraps both.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, List, Optional, Tuple

from pydantic import BaseModel, Field

# ─── Header ───────────────────────────────────────────────────────────────────


class ReplayHeader(BaseModel):
    """
    First record in every replay file.

    Records all metadata required to reproduce or compare an episode.
    """

    benchmarkVersion: str = Field(description="Semantic version of the benchmark contract (e.g. '0.1.0')")
    worldSeed: Annotated[int, Field(ge=0, description="Primary seed used to generate the world")]
    episodeSeed: Annotated[int, Field(ge=0, description="Per-episode seed for random event ordering")]
    policyId: str = Field(description="Identifier of the policy that produced this replay")
    envVersion: str = Field(description="Version string of the Gymnasium environment")
    recordedAt: str = Field(description="ISO-8601 UTC timestamp of when the episode was recorded")
    gitCommit: Optional[str] = Field(default=None, description="Git commit hash (optional, for audit)")


# ─── Step ─────────────────────────────────────────────────────────────────────

# 3-tuple of floats for positions / velocities / actions
Vec3 = Tuple[float, float, float]


class ReplayStep(BaseModel):
    """
    One record per environment timestep.

    Captures the full observable state transition at each step.
    """

    timestep: Annotated[int, Field(ge=0, description="Zero-based timestep index within the episode")]
    position: Vec3 = Field(description="Agent position in world coordinates [x, y, z]")
    velocity: Vec3 = Field(description="Agent velocity vector [vx, vy, vz] in m/s")
    reward: float = Field(description="Scalar reward received at this step")
    collisionFlag: bool = Field(description="Whether a collision was detected this step")
    doneFlag: bool = Field(description="Whether the episode terminated at or before this step")
    action: Optional[Vec3] = Field(
        default=None,
        description="Action taken by the agent [ax, ay, az]; optional for observation-only replays",
    )


# ─── Full Replay File ─────────────────────────────────────────────────────────


class ReplayFile(BaseModel):
    """
    In-memory representation of a complete replay.

    On disk this is JSONL:
        header (one JSON line) + steps (one JSON line each).
    """

    header: ReplayHeader
    steps: List[ReplayStep] = Field(default_factory=list)


# ─── Serialisation Helpers ────────────────────────────────────────────────────

def replay_to_jsonl(replay: ReplayFile) -> str:
    """
    Serialise a ReplayFile to JSONL string.

    The header is line 0; each subsequent line is one ReplayStep.
    """
    lines: list[str] = [replay.header.model_dump_json()]
    for step in replay.steps:
        lines.append(step.model_dump_json())
    return "\n".join(lines)


def replay_from_jsonl(text: str) -> ReplayFile:
    """
    Deserialise a JSONL string back to ReplayFile.

    Raises:
        ValueError: if text is empty or malformed.
        pydantic.ValidationError: if schema validation fails.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        raise ValueError("JSONL text is empty")
    header = ReplayHeader.model_validate(json.loads(lines[0]))
    steps = [ReplayStep.model_validate(json.loads(line)) for line in lines[1:]]
    return ReplayFile(header=header, steps=steps)


def replay_to_jsonl_file(replay: ReplayFile, path: Path) -> None:
    """Write a ReplayFile to a JSONL file on disk."""
    path.write_text(replay_to_jsonl(replay), encoding="utf-8")


def replay_from_jsonl_file(path: Path) -> ReplayFile:
    """Read a ReplayFile from a JSONL file on disk."""
    return replay_from_jsonl(path.read_text(encoding="utf-8"))


# ─── Validation Helpers ───────────────────────────────────────────────────────

def validate_replay_file(data: dict) -> ReplayFile:
    """
    Validate a raw dictionary against the ReplayFile schema.

    The dict must have shape: { "header": {...}, "steps": [{...}, ...] }

    Raises:
        pydantic.ValidationError: if validation fails, with structured
            field-level error messages.

    Returns:
        A validated ReplayFile instance.
    """
    return ReplayFile.model_validate(data)
