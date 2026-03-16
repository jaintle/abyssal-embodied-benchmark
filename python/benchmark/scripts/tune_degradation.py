#!/usr/bin/env python3
"""
tune_degradation.py — Phase 9: Degradation preset calibration utility.

Runs a trained PPO agent across a grid of heavy-preset candidate values,
printing a calibration table and recommending the candidate whose PPO success
rate is closest to the target range (default 30–50%).

Usage
─────
    python scripts/tune_degradation.py --model-path PATH [OPTIONS]

Options
───────
    --model-path   PATH   Trained PPO model (.zip)                   [REQUIRED]
    --world-seed   INT    World seed                                  [default: 42]
    --n-episodes   INT    Episodes per candidate                      [default: 10]
    --max-steps    INT    Max steps per episode                       [default: 500]
    --target-lo    FLOAT  Lower bound of PPO success target (0-1)     [default: 0.30]
    --target-hi    FLOAT  Upper bound of PPO success target (0-1)     [default: 0.50]
    --output       PATH   Write calibration table as JSON to this path [optional]

Calibration grid (hard-coded — edit CANDIDATE_GRID below to change):
    Scans visibility ranges and noise scales while keeping dropout at 0.10.
    The grid is designed to straddle the current "heavy" preset values
    (vis=8, noise=5) from both sides.

Exit codes
──────────
    0 — calibration complete (recommendation printed)
    1 — error (missing model, env failure, etc.)

Example
───────
    python scripts/tune_degradation.py \\
        --model-path ../../results/runs/demo-20260315-182713-ppo/model.zip \\
        --n-episodes 10

Output example
──────────────
    Calibration table (PPO success rate under candidate heavy presets)
    ─────────────────────────────────────────────────────────────────
    vis   noise  drop   success   timeout  reward   in-target?
    ────  ─────  ────   ───────   ───────  ──────   ──────────
    14.0   1.5   0.10    80.0%     20.0%   +48.3      NO  (above)
    12.0   2.5   0.10    50.0%     50.0%   +41.2      YES
    10.0   3.0   0.10    30.0%     70.0%   +31.7      YES
     8.0   3.5   0.10    10.0%     90.0%   +26.8      NO  (below)
     8.0   5.0   0.20    10.0%     90.0%   +26.5      NO  (below) [CURRENT]

    Recommendation:
      visibilityRange : 12.0  (current: 8.0)
      noiseScale      : 2.5   (current: 5.0)
      dropoutProb     : 0.10  (current: 0.20)
      PPO success     : 50.0% (target: 30–50%)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

# ── Resolve src package ───────────────────────────────────────────────────────
_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import abyssal_benchmark.envs  # noqa: F401 — registers Gymnasium env

from abyssal_benchmark.agents.ppo_agent import PPOAgent
from abyssal_benchmark.envs.make_env import make_env
from abyssal_benchmark.schemas.world_spec import DegradationSpec, DEGRADATION_PRESETS
import abyssal_benchmark.schemas.world_spec as _world_spec_module

# ─── Calibration grid ─────────────────────────────────────────────────────────
#
# Each entry: (visibilityRange, noiseScale, dropoutProb, label)
#
# The grid spans from "too easy" → "too hard" so the target 30-50% PPO success
# range can be bracketed.  Adjust entries as needed, then re-run.
#
# Current baseline "heavy" (vis=8, noise=5, drop=0.2) is the last entry
# marked [CURRENT] — it gives PPO ~10% success.  The calibration goal is to
# find candidates that land PPO at 30–50%.

CANDIDATE_GRID: List[Tuple[float, float, float, str]] = [
    # (visibilityRange, noiseScale, dropoutProb, label)
    #
    # Previous run found a sharp jump: vis=14/noise=2.0→13%, vis=12/noise=2.5→80%.
    # This grid densely fills that gap to locate the 30-50% band.
    # Also includes two candidates in the vis=9/noise=3.x region (another area
    # of interest from the first run).
    (14.0, 2.00, 0.10, "[prev: 13%]"),   # lower bound of gap
    (13.5, 2.10, 0.10, ""),
    (13.0, 2.20, 0.10, ""),
    (12.5, 2.30, 0.10, ""),
    (12.0, 2.50, 0.10, "[prev: 80%]"),   # upper bound of gap
    ( 9.0, 3.20, 0.12, ""),              # vis=9 region
    ( 9.0, 3.50, 0.15, "[prev: 27%]"),   # prev closest to target
    ( 8.0, 5.00, 0.20, "[CURRENT]"),     # current heavy (baseline)
]

# ─── CLI ──────────────────────────────────────────────────────────────────────


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Calibrate degradation heavy preset")
    p.add_argument("--model-path", type=Path, required=True,
                   help="Path to trained PPO model.zip")
    p.add_argument("--world-seed", type=int, default=42,
                   help="World seed (default: 42)")
    p.add_argument("--n-episodes", type=int, default=10,
                   help="Episodes per candidate (default: 10)")
    p.add_argument("--max-steps", type=int, default=500,
                   help="Max env steps per episode (default: 500)")
    p.add_argument("--target-lo", type=float, default=0.30,
                   help="Lower PPO success-rate target (default: 0.30)")
    p.add_argument("--target-hi", type=float, default=0.50,
                   help="Upper PPO success-rate target (default: 0.50)")
    p.add_argument("--output", type=Path, default=None,
                   help="Write calibration table as JSON to this file")
    return p.parse_args(argv[1:])


# ─── Single-candidate evaluation ─────────────────────────────────────────────


@dataclass
class CandidateResult:
    vis: float
    noise: float
    dropout: float
    label: str
    success_rate: float
    timeout_rate: float
    collision_rate: float
    oob_rate: float
    mean_reward: float
    n_episodes: int
    elapsed_s: float


def evaluate_candidate(
    model_path: Path,
    vis: float,
    noise: float,
    dropout: float,
    world_seed: int,
    n_episodes: int,
    max_steps: int,
    base_seed: int = 2000,
) -> CandidateResult:
    """Run PPO agent for n_episodes under the given degradation candidate.

    We temporarily patch DEGRADATION_PRESETS["heavy"] so the env sees our
    candidate values when constructed with degradation_preset="heavy".
    The original spec is restored after each candidate regardless of errors.
    """
    import numpy as np

    candidate_spec = DegradationSpec(
        preset="heavy",
        turbidity=0.70,
        visibilityRange=vis,
        causticIntensity=0.30,
        noiseScale=noise,
        dropoutProb=dropout,
    )

    # Patch the module-level dict so the env constructor reads our values.
    _original_heavy = _world_spec_module.DEGRADATION_PRESETS["heavy"]
    _world_spec_module.DEGRADATION_PRESETS["heavy"] = candidate_spec

    def env_factory():
        return make_env(
            world_seed=world_seed,
            max_steps=max_steps,
            degradation_preset="heavy",
        )

    try:
        agent = PPOAgent.load(model_path, env_factory=env_factory)
        env = env_factory()

        successes = 0
        timeouts = 0
        collisions = 0
        oobs = 0
        rewards: list[float] = []

        t0 = time.perf_counter()

        for ep_idx in range(n_episodes):
            ep_seed = (base_seed + ep_idx * 37 + world_seed * 13) & 0x7FFF_FFFF
            obs, _ = env.reset(seed=ep_seed)
            total_reward = 0.0
            done = False

            while not done:
                action = agent.predict(obs)
                obs, reward, terminated, truncated, info = env.step(action)
                total_reward += float(reward)
                done = terminated or truncated

            rewards.append(total_reward)
            if info.get("goal_reached"):
                successes += 1
            elif info.get("timed_out"):
                timeouts += 1
            elif info.get("collision"):
                collisions += 1
            elif info.get("out_of_bounds"):
                oobs += 1

        env.close()
        elapsed = time.perf_counter() - t0

        return CandidateResult(
            vis=vis,
            noise=noise,
            dropout=dropout,
            label="",
            success_rate=successes / n_episodes,
            timeout_rate=timeouts / n_episodes,
            collision_rate=collisions / n_episodes,
            oob_rate=oobs / n_episodes,
            mean_reward=float(np.mean(rewards)),
            n_episodes=n_episodes,
            elapsed_s=elapsed,
        )
    finally:
        # Always restore the original heavy spec
        _world_spec_module.DEGRADATION_PRESETS["heavy"] = _original_heavy


# ─── Pretty-print table ───────────────────────────────────────────────────────


def print_table(
    results: List[CandidateResult],
    target_lo: float,
    target_hi: float,
    recommendation: Optional[CandidateResult],
) -> None:
    sep = "─" * 74
    print()
    print("  Calibration table  (PPO success rate under candidate heavy presets)")
    print("  " + sep)
    print(f"  {'vis':>5}  {'noise':>5}  {'drop':>4}  {'success':>8}  {'timeout':>8}  {'reward':>8}  {'in-target?'}")
    print("  " + sep)

    for r in results:
        in_target = target_lo <= r.success_rate <= target_hi
        flag_str = "  YES" if in_target else f"  NO  ({'above' if r.success_rate > target_hi else 'below'})"
        label_suffix = f"  {r.label}" if r.label else ""
        print(
            f"  {r.vis:>5.1f}  {r.noise:>5.1f}  {r.dropout:>4.2f}  "
            f"{r.success_rate*100:>7.1f}%  {r.timeout_rate*100:>7.1f}%  "
            f"{r.mean_reward:>+8.2f}  {flag_str}{label_suffix}"
        )

    print("  " + sep)
    print()
    print(f"  Target: PPO success ∈ [{target_lo*100:.0f}%, {target_hi*100:.0f}%]")
    print()

    if recommendation is None:
        print("  ✗  No candidate fell within the target range.")
        print("     Adjust CANDIDATE_GRID and re-run, or widen --target-lo/--target-hi.")
    else:
        print("  Recommendation:")
        print(f"    visibilityRange : {recommendation.vis:.1f}  (current: 8.0)")
        print(f"    noiseScale      : {recommendation.noise:.1f}  (current: 5.0)")
        print(f"    dropoutProb     : {recommendation.dropout:.2f}  (current: 0.20)")
        print(f"    PPO success     : {recommendation.success_rate*100:.1f}%"
              f"  (target: {target_lo*100:.0f}–{target_hi*100:.0f}%)")
        print()
        print("  Update world_spec.py DEGRADATION_PRESETS['heavy'] with these values,")
        print("  then re-run demo_train_and_benchmark.sh to generate refreshed artifacts.")
    print()


# ─── Main ─────────────────────────────────────────────────────────────────────


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if not args.model_path.exists():
        print(f"✗ Model not found: {args.model_path}", file=sys.stderr)
        return 1

    print()
    print("══════════════════════════════════════════════════════════════")
    print("  abyssal-embodied-benchmark  ·  Degradation Calibration")
    print("══════════════════════════════════════════════════════════════")
    print(f"  model_path  : {args.model_path}")
    print(f"  world_seed  : {args.world_seed}")
    print(f"  n_episodes  : {args.n_episodes}  (per candidate)")
    print(f"  target      : {args.target_lo*100:.0f}% – {args.target_hi*100:.0f}% PPO success")
    print(f"  candidates  : {len(CANDIDATE_GRID)}")
    print()

    results: List[CandidateResult] = []

    for idx, (vis, noise, dropout, label) in enumerate(CANDIDATE_GRID):
        print(f"  [{idx+1}/{len(CANDIDATE_GRID)}]  "
              f"vis={vis:.1f}  noise={noise:.1f}  dropout={dropout:.2f}  …", end="", flush=True)
        try:
            r = evaluate_candidate(
                model_path=args.model_path,
                vis=vis,
                noise=noise,
                dropout=dropout,
                world_seed=args.world_seed,
                n_episodes=args.n_episodes,
                max_steps=args.max_steps,
            )
            r.label = label
            results.append(r)
            print(f"  success={r.success_rate*100:.0f}%  ({r.elapsed_s:.1f}s)")
        except Exception as exc:
            print(f"  ERROR: {exc}")
            print(f"         Skipping candidate vis={vis}, noise={noise}, dropout={dropout}",
                  file=sys.stderr)

    if not results:
        print("✗ All candidates failed.  Cannot produce recommendation.", file=sys.stderr)
        return 1

    # ── Find best recommendation: in-target; prefer highest success rate
    in_target = [r for r in results if args.target_lo <= r.success_rate <= args.target_hi]
    recommendation: Optional[CandidateResult] = None
    if in_target:
        # Pick the one closest to the midpoint of the target range
        midpoint = (args.target_lo + args.target_hi) / 2.0
        recommendation = min(in_target, key=lambda r: abs(r.success_rate - midpoint))

    print_table(results, args.target_lo, args.target_hi, recommendation)

    # ── Write JSON output ────────────────────────────────────────────────────
    output_data = {
        "model_path": str(args.model_path),
        "world_seed": args.world_seed,
        "n_episodes_per_candidate": args.n_episodes,
        "target_lo": args.target_lo,
        "target_hi": args.target_hi,
        "candidates": [
            {
                "visibilityRange": r.vis,
                "noiseScale": r.noise,
                "dropoutProb": r.dropout,
                "label": r.label,
                "success_rate": r.success_rate,
                "timeout_rate": r.timeout_rate,
                "collision_rate": r.collision_rate,
                "mean_reward": r.mean_reward,
                "n_episodes": r.n_episodes,
                "in_target": args.target_lo <= r.success_rate <= args.target_hi,
            }
            for r in results
        ],
        "recommendation": {
            "visibilityRange": recommendation.vis,
            "noiseScale": recommendation.noise,
            "dropoutProb": recommendation.dropout,
            "success_rate": recommendation.success_rate,
        } if recommendation else None,
    }

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output_data, indent=2), encoding="utf-8")
        print(f"  Calibration table written: {args.output}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
