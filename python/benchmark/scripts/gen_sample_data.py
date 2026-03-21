#!/usr/bin/env python3
"""
gen_sample_data.py — Generate sample replay JSONL files (Phase C)

Episode 1 per (submission, preset): copied directly from the canonical
benchmark run in apps/web/public/benchmark/ so the Replay Arena shows
the exact same trajectory as the homepage.

Episodes 2–5: synthetic but structurally valid trajectories that start
from the world-centre spawn and navigate toward the correct goal for
worldSeed=42, giving episode variety in the UI selector.

Usage:
    python python/benchmark/scripts/gen_sample_data.py

Output:
    apps/web/public/data/submissions/<id>/replays/<preset>/episode_000N.jsonl
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

# ─── Configuration ────────────────────────────────────────────────────────────

REPO_ROOT  = Path(__file__).parents[3]
DATA_ROOT  = REPO_ROOT / "apps/web/public/data"
BENCH_ROOT = REPO_ROOT / "apps/web/public/benchmark"

# Episode-1 source file: the canonical benchmark replay for each agent.
# Key = submission id, value = policyId used in the benchmark run filenames.
SUBMISSIONS = [
    {"id": "ppo-v1",         "agent_id": "ppo",           "bench_id": "ppo",         "noise": 0.18, "speed": 0.55},
    {"id": "cautious-ppo-v1","agent_id": "cautious",       "bench_id": "cautious_ppo","noise": 0.10, "speed": 0.45},
    {"id": "heuristic-v1",   "agent_id": "heuristic",      "bench_id": "heuristic",   "noise": 0.25, "speed": 0.60},
]

# Seed used for the canonical benchmark episode (matches sampleBenchmark.ts)
BENCH_EPISODE_SEED = 1338301409

PRESETS = {
    "clear": {"extra_noise": 0.0,  "max_steps": 500},
    "heavy": {"extra_noise": 0.18, "max_steps": 500},
}

N_EPISODES = 5
WORLD_SEED = 42
BASE_EP_SEED = 1000

# Goal derived from generateWorldSpec(42) — matches browser worldgen exactly.
# deriveGoalPosition(42, worldRadius=50) → XZ [-22.67, 26.07], Y=2.0
# Agent always spawns at world centre [0,0] on XZ (navigation_env.py default).
GOAL_XZ = [-22.67, 26.07]   # XZ plane only; env navigates in 2-D
GOAL_Y  = 2.0                # visual height for the 3-D goal marker
SPAWN_XZ = [0.0, 0.0]        # world-centre spawn (matches navigation_env.py)
SPAWN_Y  = 0.8               # AGENT_Y constant from AgentPlayback.tsx
GOAL_RADIUS = 1.5            # acceptance radius from worldSpec (acceptanceRadius: 1.5)

# Forward speed scale.  vel = cos(heading) * thrust * MAX_SPEED_MS (m/s).
# At thrust≈speed and MAX_SPEED_MS=5.0:
#   ppo (0.55):      ~2.75 m/s  →  ~0.275 m/step  → ~125 steps for 34.5 m
#   cautious (0.45): ~2.25 m/s  →  ~0.225 m/step  → ~153 steps
#   heuristic (0.60):~3.00 m/s  →  ~0.300 m/step  → ~115 steps
# All well within max_steps=500.  Heavy adds noise but agents still converge.
MAX_SPEED_MS = 5.0

STEP_DT = 0.1
BENCHMARK_VERSION = "1.0.0"
ENV_VERSION = "1.0.0"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _dist(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _norm(v: list[float]) -> list[float]:
    d = math.sqrt(sum(x ** 2 for x in v))
    return [x / d for x in v] if d > 1e-9 else [0.0, 0.0, 0.0]


def generate_episode(
    agent_id: str,
    world_seed: int,
    ep_seed: int,
    preset: str,
    speed: float,
    noise: float,
    extra_noise: float,
    max_steps: int,
) -> list[dict]:
    rng = random.Random(ep_seed)
    total_noise = noise + extra_noise

    # Agent always spawns at world centre — matches navigation_env.py default.
    # Heading initialised toward the actual goal.
    pos = [SPAWN_XZ[0], SPAWN_XZ[1]]   # [x, z] (2-D nav, as in Python env)
    heading = math.atan2(GOAL_XZ[1] - pos[1], GOAL_XZ[0] - pos[0])

    header = {
        "benchmarkVersion": BENCHMARK_VERSION,
        "worldSeed": world_seed,
        "episodeSeed": ep_seed,
        "policyId": agent_id,
        "envVersion": ENV_VERSION,
        "recordedAt": "2026-03-21T00:00:00Z",
        "gitCommit": None,
    }

    steps = []
    total_reward = 0.0

    for t in range(max_steps):
        d = math.sqrt((pos[0] - GOAL_XZ[0]) ** 2 + (pos[1] - GOAL_XZ[1]) ** 2)
        done = d < GOAL_RADIUS

        # Direction toward goal
        dx = GOAL_XZ[0] - pos[0]
        dz = GOAL_XZ[1] - pos[1]
        desired_heading = math.atan2(dz, dx)

        # Yaw error → torque
        yaw_err = math.atan2(
            math.sin(desired_heading - heading),
            math.cos(desired_heading - heading),
        )
        yaw_torque = max(-1.0, min(1.0, yaw_err * 2.0 + rng.gauss(0, total_noise * 0.5)))

        # Forward thrust ([-1, 1])
        thrust = speed + rng.gauss(0, total_noise * 0.3)
        thrust = max(-1.0, min(1.0, thrust))

        # Velocity: vel = cos/sin(heading) * thrust * MAX_SPEED_MS (m/s)
        # This avoids the old speed² term that made traversal impossibly slow.
        heading += yaw_torque * 0.15
        vel_x = math.cos(heading) * thrust * MAX_SPEED_MS
        vel_z = math.sin(heading) * thrust * MAX_SPEED_MS

        pos[0] += vel_x * STEP_DT + rng.gauss(0, total_noise * 0.05)
        pos[1] += vel_z * STEP_DT + rng.gauss(0, total_noise * 0.05)

        # Reward: proportional to distance reduction, minus collision penalty
        prev_d = d
        new_d = math.sqrt((pos[0] - GOAL_XZ[0]) ** 2 + (pos[1] - GOAL_XZ[1]) ** 2)
        reward = (prev_d - new_d) * 10.0
        collision = rng.random() < (total_noise * 0.08 * (1.0 - min(d / 10.0, 1.0)))
        if collision:
            reward -= 0.5
        if done:
            reward += 10.0

        total_reward += reward

        step = {
            "timestep": t,
            # 3-D position: x from pos[0], y constant at SPAWN_Y, z from pos[1]
            "position": [round(pos[0], 4), SPAWN_Y, round(pos[1], 4)],
            "velocity": [round(vel_x, 4), 0.0, round(vel_z, 4)],
            "reward": round(reward, 4),
            "collisionFlag": collision,
            "doneFlag": done,
            "action": [round(thrust, 4), 0.0, round(yaw_torque, 4)],
        }
        steps.append(step)

        if done:
            break

    return [header] + steps


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    import shutil

    total = 0
    for sub in SUBMISSIONS:
        for preset, p_cfg in PRESETS.items():
            for ep_i in range(1, N_EPISODES + 1):
                out = (
                    DATA_ROOT
                    / "submissions"
                    / sub["id"]
                    / "replays"
                    / preset
                    / f"episode_{ep_i:04d}.jsonl"
                )
                out.parent.mkdir(parents=True, exist_ok=True)

                if ep_i == 1:
                    # Episode 1 = exact canonical benchmark replay so the Replay
                    # Arena shows the same trajectory as the homepage.
                    src = (
                        BENCH_ROOT
                        / preset
                        / "replays"
                        / f"replay_{sub['bench_id']}_seed_{BENCH_EPISODE_SEED}.jsonl"
                    )
                    shutil.copy(src, out)
                    with open(out) as f:
                        n_steps = sum(1 for _ in f) - 1
                    print(f"  [REAL] {sub['id']}/{preset}/episode_0001.jsonl  ({n_steps} steps, copied from benchmark)")
                else:
                    # Episodes 2–5: synthetic, world-correct trajectories.
                    ep_seed = BASE_EP_SEED + (ep_i - 1) * 7919
                    records = generate_episode(
                        agent_id=sub["agent_id"],
                        world_seed=WORLD_SEED,
                        ep_seed=ep_seed,
                        preset=preset,
                        speed=sub["speed"],
                        noise=sub["noise"],
                        extra_noise=p_cfg["extra_noise"],
                        max_steps=p_cfg["max_steps"],
                    )
                    write_jsonl(out, records)
                    print(f"  [SYN]  {sub['id']}/{preset}/episode_{ep_i:04d}.jsonl  ({len(records)-1} steps)")
                total += 1

    print(f"\nGenerated {total} replay files in apps/web/public/data/submissions/")


if __name__ == "__main__":
    main()
