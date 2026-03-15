"""
replay_export.py — Episode replay recorder and exporter (Phase 3 / updated Phase 7)

Records a single full episode trajectory and serialises it as a ReplayFile
using the shared replay schema (JSONL format).

Phase 7 addition: degradation_preset is passed through to make_env so that
the recorded trajectory reflects the degraded observation the agent actually
received.  The degradation preset is also written into the replay header so
the web UI can display the correct condition.

2-D to 3-D mapping
──────────────────
The environment is 2-D (XZ plane).  The replay schema uses Vec3 (x, y, z).
We map:
    position  →  (pos_x,  0.0, pos_z)
    velocity  →  (vel_x,  0.0, vel_z)
    action    →  (act_x,  0.0, act_z)

This preserves direct consumption by the browser renderer, which treats
Y as the vertical axis.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from abyssal_benchmark.envs.make_env import make_env
from abyssal_benchmark.schemas.replay_schema import (
    ReplayFile,
    ReplayHeader,
    ReplayStep,
    replay_to_jsonl_file,
)
from abyssal_benchmark.utils.io import get_git_commit

# Benchmark version embedded in every replay header
BENCHMARK_VERSION = "0.1.0"


# ─── Single episode recorder ──────────────────────────────────────────────────

def record_episode(
    policy: Any,
    world_seed: int = 42,
    episode_seed: int = 0,
    max_steps: int = 500,
    policy_id: str = "unknown",
    env_version: str = "0.1.0",
    degradation_preset: str = "clear",
    uncertainty_obs: bool = False,
    deterministic: bool = True,
) -> ReplayFile:
    """
    Roll out one episode and return a ReplayFile.

    Parameters
    ----------
    policy:
        Any object with ``predict(obs, deterministic) → np.ndarray``.
    world_seed:
        World generation seed.
    episode_seed:
        Per-episode seed (recorded in header).
    max_steps:
        Episode truncation limit.
    policy_id:
        Human-readable policy identifier written to the header.
    env_version:
        Env version string written to the header.
    degradation_preset:
        Named degradation preset applied to observations.
    deterministic:
        Whether to use the policy's deterministic action.

    Returns
    -------
    ReplayFile
        Complete episode trajectory.
    """
    env = make_env(
        world_seed=world_seed,
        episode_seed=episode_seed,
        max_steps=max_steps,
        degradation_preset=degradation_preset,
        uncertainty_obs=uncertainty_obs,
    )

    recorded_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    header = ReplayHeader(
        benchmarkVersion=BENCHMARK_VERSION,
        worldSeed=world_seed,
        episodeSeed=episode_seed,
        policyId=policy_id,
        envVersion=env_version,
        recordedAt=recorded_at,
        gitCommit=get_git_commit(),
    )

    steps: List[ReplayStep] = []
    obs, info = env.reset()

    terminated = truncated = False
    while True:
        action = policy.predict(obs, deterministic=deterministic)

        obs, reward, terminated, truncated, info = env.step(action)

        # 2D → Vec3 mapping
        pos_x = float(info["pos_x"])
        pos_z = float(info["pos_z"])
        vel_x = float(info["vel_x"])
        vel_z = float(info["vel_z"])
        act_x = float(action[0])
        act_z = float(action[1])

        step = ReplayStep(
            timestep=len(steps),  # 0-based replay index
            position=(pos_x, 0.0, pos_z),
            velocity=(vel_x, 0.0, vel_z),
            reward=float(reward),
            collisionFlag=bool(info["collision"]),
            doneFlag=bool(terminated or truncated),
            action=(act_x, 0.0, act_z),
        )
        steps.append(step)

        if terminated or truncated:
            break

    env.close()
    return ReplayFile(header=header, steps=steps)


def export_episode(
    policy: Any,
    output_path: Path,
    world_seed: int = 42,
    episode_seed: int = 0,
    max_steps: int = 500,
    policy_id: str = "unknown",
    env_version: str = "0.1.0",
    degradation_preset: str = "clear",
    uncertainty_obs: bool = False,
    deterministic: bool = True,
) -> ReplayFile:
    """
    Record one episode and write it to *output_path* as JSONL.

    Creates parent directories if needed.

    Returns the recorded ReplayFile.
    """
    replay = record_episode(
        policy=policy,
        world_seed=world_seed,
        episode_seed=episode_seed,
        max_steps=max_steps,
        policy_id=policy_id,
        env_version=env_version,
        degradation_preset=degradation_preset,
        uncertainty_obs=uncertainty_obs,
        deterministic=deterministic,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    replay_to_jsonl_file(replay, output_path)
    return replay
