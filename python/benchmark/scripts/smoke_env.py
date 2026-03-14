#!/usr/bin/env python3
"""
smoke_env.py — Gymnasium environment smoke-run (Phase 2)

Usage:
    python smoke_env.py [--seed SEED] [--steps STEPS] [--max-steps MAX_STEPS]

Defaults:
    --seed      42
    --steps     25   (max random steps to execute)
    --max-steps 500  (env hard limit)

Exit codes:
    0 — smoke run completed without error
    1 — environment error

Prints compact per-step summaries and a final termination report.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# ── Resolve src package regardless of install state ───────────────────────────
_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import numpy as np  # noqa: E402

import abyssal_benchmark.envs  # triggers Gymnasium registration  # noqa: F401, E402
from abyssal_benchmark.envs.make_env import make_env  # noqa: E402
from abyssal_benchmark.envs.navigation_env import OBS_DIM  # noqa: E402


# ─── Formatting helpers ───────────────────────────────────────────────────────

def _fmt_pos(info: dict) -> str:
    return f"({info['pos_x']:+7.2f}, {info['pos_z']:+7.2f})"


def _fmt_vel(info: dict) -> str:
    return f"({info['vel_x']:+5.2f}, {info['vel_z']:+5.2f})"


def _termination_reason(info: dict) -> str:
    if info["goal_reached"]:
        return "GOAL REACHED"
    if info["collision"]:
        return "COLLISION"
    if info["timed_out"]:
        return "MAX STEPS"
    if info["out_of_bounds"]:
        return "OUT OF BOUNDS"
    return "STILL RUNNING"


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Abyssal benchmark env smoke-run")
    parser.add_argument("--seed", type=int, default=42, help="world seed")
    parser.add_argument("--steps", type=int, default=25, help="max steps to run")
    parser.add_argument("--max-steps", type=int, default=500, help="env episode limit")
    args = parser.parse_args(argv[1:])

    print(f"── Abyssal Navigation Smoke Run ──────────────────────────────────")
    print(f"   world_seed  : {args.seed}")
    print(f"   run_steps   : {args.steps}")
    print(f"   max_steps   : {args.max_steps}")

    # ── Build env ─────────────────────────────────────────────────────────
    try:
        env = make_env(
            world_seed=args.seed,
            episode_seed=0,
            max_steps=args.max_steps,
        )
    except Exception as exc:
        print(f"\n✗ Failed to create env: {exc}", file=sys.stderr)
        return 1

    w = env.world
    print(f"\n   world_radius        : {w.world_radius} m")
    print(f"   obstacles placed    : {len(w.obstacles)} / {w.spec.obstacles.count}")
    print(f"   goal position       : ({w.goal_x:.2f}, {w.goal_z:.2f})")
    print(f"   goal accept radius  : {w.goal_acceptance_radius} m")
    print(f"   obs_dim             : {OBS_DIM}")
    print(f"   action_dim          : {env.action_space.shape[0]}")

    # ── Reset ─────────────────────────────────────────────────────────────
    try:
        obs, info = env.reset()
    except Exception as exc:
        print(f"\n✗ reset() failed: {exc}", file=sys.stderr)
        return 1

    assert obs.shape == (OBS_DIM,), f"unexpected obs shape {obs.shape}"
    print(f"\n   reset OK  →  pos={_fmt_pos(info)}  dist_to_goal={info['dist_to_goal']:.2f} m")
    print()
    print(f"{'step':>4}  {'pos':>20}  {'vel':>14}  {'dist':>7}  {'reward':>8}  flags")
    print("─" * 78)

    # ── Random steps ──────────────────────────────────────────────────────
    rng = np.random.default_rng(seed=42)
    final_info = info
    terminated = truncated = False

    for step_i in range(args.steps):
        action = rng.uniform(-1.0, 1.0, size=2).astype(np.float32)

        try:
            obs, reward, terminated, truncated, info = env.step(action)
        except Exception as exc:
            print(f"\n✗ step() failed at step {step_i}: {exc}", file=sys.stderr)
            return 1

        flags = []
        if info["goal_reached"]:
            flags.append("GOAL")
        if info["collision"]:
            flags.append("COLL")
        if info["out_of_bounds"]:
            flags.append("OOB")

        flag_str = " ".join(flags) if flags else "—"
        print(
            f"{step_i+1:>4}  {_fmt_pos(info)}  {_fmt_vel(info)}"
            f"  {info['dist_to_goal']:>7.2f}  {reward:>+8.4f}  {flag_str}"
        )

        final_info = info
        if terminated or truncated:
            break

    # ── Summary ───────────────────────────────────────────────────────────
    print("─" * 78)
    reason = _termination_reason(final_info)
    still_running = not (terminated or truncated)

    if still_running:
        print(f"\n✓ Smoke run complete ({args.steps} steps, episode still running).")
    else:
        symbol = "✓" if final_info["goal_reached"] else "·"
        print(f"\n{symbol} Episode ended: {reason}  (step {final_info['step']})")

    env.close()
    print("\n✓ smoke_env: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
