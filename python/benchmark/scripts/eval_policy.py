#!/usr/bin/env python3
"""
eval_policy.py — Fixed-seed policy evaluation CLI (Phase 3)

Usage
─────
    python eval_policy.py --run-name RUN_NAME [OPTIONS]
    python eval_policy.py --model-path PATH [OPTIONS]

Options
───────
    --run-name      STR   Load model from results/runs/<run-name>/model.zip
    --model-path    PATH  Explicit path to model.zip (alternative to --run-name)
    --output-dir    PATH  Parent dir for run dirs  [default: <repo>/results/runs]
    --world-seed    INT   World seed for eval      [default: 42]
    --n-episodes    INT   Number of eval episodes  [default: 20]
    --max-steps     INT   Max steps per episode    [default: 500]
    --base-ep-seed  INT   Base episode seed        [default: 1000]
    --policy-id     STR   Policy label in outputs  [default: run-name or 'ppo']

Artefacts saved to the run directory (or next to model.zip):
    eval_summary.json
    summary.csv

Exit codes
──────────
    0 — evaluation completed
    1 — error
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ── Resolve src package ───────────────────────────────────────────────────────
_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import abyssal_benchmark.envs  # noqa: F401 — registers Gymnasium env

from abyssal_benchmark.agents.ppo_agent import PPOAgent
from abyssal_benchmark.envs.make_env import make_env
from abyssal_benchmark.eval.evaluate_policy import EvaluationHarness
from abyssal_benchmark.utils.config import RunDir, DEFAULT_RESULTS_DIR
from abyssal_benchmark.utils.io import write_summary_csv


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Evaluate a trained PPO policy")
    group = p.add_mutually_exclusive_group()
    group.add_argument("--run-name", type=str, default=None,
                       help="Run directory name under output-dir")
    group.add_argument("--model-path", type=Path, default=None,
                       help="Explicit path to model.zip")
    p.add_argument("--output-dir", type=Path, default=None,
                   help="Parent dir for run dirs")
    p.add_argument("--world-seed", type=int, default=42)
    p.add_argument("--n-episodes", type=int, default=20)
    p.add_argument("--max-steps", type=int, default=500)
    p.add_argument("--base-ep-seed", type=int, default=1000)
    p.add_argument("--policy-id", type=str, default=None,
                   help="Label written into eval_summary.json")
    return p.parse_args(argv[1:])


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    args = parse_args(argv)

    # ── Resolve model path and output directory ───────────────────────────────
    base = args.output_dir or DEFAULT_RESULTS_DIR

    if args.model_path:
        model_path = args.model_path.resolve()
        out_dir = model_path.parent
        policy_id = args.policy_id or "ppo"
    elif args.run_name:
        run = RunDir.open(base / args.run_name)
        model_path = run.model_path()
        out_dir = run.path
        policy_id = args.policy_id or args.run_name
    else:
        print("✗ Provide --run-name or --model-path", file=sys.stderr)
        return 1

    if not model_path.exists():
        print(f"✗ Model not found: {model_path}", file=sys.stderr)
        return 1

    print("── Abyssal Policy Evaluation ─────────────────────────────────────")
    print(f"   model_path     : {model_path}")
    print(f"   world_seed     : {args.world_seed}")
    print(f"   n_episodes     : {args.n_episodes}")
    print(f"   max_steps      : {args.max_steps}")
    print(f"   base_ep_seed   : {args.base_ep_seed}")
    print(f"   policy_id      : {policy_id}")

    # ── Load policy ───────────────────────────────────────────────────────────
    world_seed = args.world_seed
    max_steps = args.max_steps

    def env_factory():
        return make_env(world_seed=world_seed, max_steps=max_steps)

    print("\n── Loading model …")
    try:
        agent = PPOAgent.load(model_path, env_factory=env_factory)
    except Exception as exc:
        print(f"✗ Failed to load model: {exc}", file=sys.stderr)
        return 1

    # ── Run evaluation ────────────────────────────────────────────────────────
    print()
    harness = EvaluationHarness(
        world_seed=args.world_seed,
        n_episodes=args.n_episodes,
        max_steps=args.max_steps,
        base_episode_seed=args.base_ep_seed,
        policy_id=policy_id,
        verbose=True,
    )

    try:
        summary = harness.evaluate(agent)
    except Exception as exc:
        print(f"\n✗ Evaluation failed: {exc}", file=sys.stderr)
        return 1

    # ── Print aggregate ───────────────────────────────────────────────────────
    print(f"\n   success_rate   : {summary.success_rate:.1%}")
    print(f"   collision_rate : {summary.collision_rate:.1%}")
    print(f"   mean_reward    : {summary.mean_reward:.3f} ± {summary.std_reward:.3f}")
    print(f"   mean_steps     : {summary.mean_steps:.1f} ± {summary.std_steps:.1f}")
    print(f"   mean_final_dist: {summary.mean_final_dist:.2f} m ± {summary.std_final_dist:.2f}")

    # ── Save artefacts ────────────────────────────────────────────────────────
    eval_summary_path = out_dir / "eval_summary.json"
    summary_csv_path = out_dir / "summary.csv"

    # eval_summary.json — full detail
    d = summary.to_dict()
    # Convert EpisodeResult dataclasses to dicts for JSON serialisation
    d["episodes"] = [
        {k: v for k, v in ep.items()} if isinstance(ep, dict)
        else {
            "episode_index": ep.episode_index,
            "episode_seed": ep.episode_seed,
            "total_reward": ep.total_reward,
            "steps": ep.steps,
            "final_dist": ep.final_dist,
            "goal_reached": ep.goal_reached,
            "collision": ep.collision,
            "timed_out": ep.timed_out,
            "out_of_bounds": ep.out_of_bounds,
            "elapsed_seconds": ep.elapsed_seconds,
        }
        for ep in summary.episodes
    ]
    eval_summary_path.write_text(json.dumps(d, indent=2), encoding="utf-8")
    print(f"\n   eval_summary   : {eval_summary_path}")

    # summary.csv — flat per-episode rows for easy analysis
    rows = [
        {
            "run": policy_id,
            "world_seed": args.world_seed,
            "episode": ep.episode_index,
            "episode_seed": ep.episode_seed,
            "total_reward": ep.total_reward,
            "steps": ep.steps,
            "final_dist": ep.final_dist,
            "goal_reached": int(ep.goal_reached),
            "collision": int(ep.collision),
            "timed_out": int(ep.timed_out),
            "out_of_bounds": int(ep.out_of_bounds),
            "elapsed_seconds": ep.elapsed_seconds,
        }
        for ep in summary.episodes
    ]
    write_summary_csv(rows, summary_csv_path)
    print(f"   summary.csv    : {summary_csv_path}")

    print(f"\n✓ Evaluation complete — {args.n_episodes} episodes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
