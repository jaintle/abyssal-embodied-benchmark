"""Benchmark data contract schemas (world spec, replay, submissions, leaderboard)."""

from .world_spec import (
    BENCHMARK_VERSION,
    DegradationSpec,
    GoalSpec,
    ObstacleSpec,
    TerrainSpec,
    WorldSpec,
    generate_world_spec,
    validate_world_spec,
)
from .replay_schema import (
    ReplayFile,
    ReplayHeader,
    ReplayStep,
    replay_from_jsonl,
    replay_from_jsonl_file,
    replay_to_jsonl,
    replay_to_jsonl_file,
    validate_replay_file,
)
from .submission_metadata import (
    AlgorithmFamily,
    ObservationType,
    SubmissionMetadata,
    SubmissionStatus,
    validate_submission_metadata,
)
from .leaderboard import (
    LeaderboardEntry,
    LeaderboardManifest,
    validate_leaderboard_manifest,
)

__all__ = [
    # world_spec
    "BENCHMARK_VERSION",
    "TerrainSpec",
    "ObstacleSpec",
    "GoalSpec",
    "DegradationSpec",
    "WorldSpec",
    "generate_world_spec",
    "validate_world_spec",
    # replay_schema
    "ReplayHeader",
    "ReplayStep",
    "ReplayFile",
    "replay_to_jsonl",
    "replay_from_jsonl",
    "replay_to_jsonl_file",
    "replay_from_jsonl_file",
    "validate_replay_file",
    # submission_metadata
    "AlgorithmFamily",
    "ObservationType",
    "SubmissionMetadata",
    "SubmissionStatus",
    "validate_submission_metadata",
    # leaderboard
    "LeaderboardEntry",
    "LeaderboardManifest",
    "validate_leaderboard_manifest",
]
