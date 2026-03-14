#!/usr/bin/env python3
"""
train_ppo.py — PPO baseline training (Phase 3)

Usage
─────
    python train_ppo.py [OPTIONS]

Options
───────
    --world-seed    INT   World generation seed       [default: 42]
    --total-steps   INT   Total training timesteps    [default: 200_000]
    --run-name      STR   Run directory name          [default: ppo-<world_seed>]
    --output-dir    PATH  Parent dir for run dirs     [default: <repo>/results/runs]
    --max-steps     INT   Env max steps per episode   [default: 500]
    --lr            FLOAT Learning rate               [default: 3e-4]
    --n-steps       INT   Rollout buffer size (PPO)   [default: 2048]
    --batch-size    INT   Mini-batch size (PPO)       [default: 64]
    --seed          INT   SB3 global seed             [default: 0]

Artefacts saved to results/runs/<run-name>/
    config.json
    model.zip
    train_summary.json

Exit codes
──────────
    0 — training completed successfully
    1 — error
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# ── Resolve src package ───────────────────────────────────────────────────────
_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import abyssal_benchmark.envs  # noqa: F401 — registers Gymnasium env

from abyssal_benchmark.envs.make_env import make_env
from abyssal_benchmark.agents.ppo_agent import PPOAgent
from abyssal_benchmark.utils.config import RunDir
from abyssal_benchmark.utils.io import get_git_commit

ENV_VERSION = "0.1.0"


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train PPO baseline on AbyssalNavigationEnv")
    p.add_argument("--world-seed", type=int, default=42, help="World generation seed")
    p.add_argument("--total-steps", type=int, default=200_000, help="Total training timesteps")
    p.add_argument("--run-name", type=str, default=None, help="Run dir name (default: ppo-<world_seed>)")
    p.add_argument("--output-dir", type=Path, default=None, help="Parent dir for run dirs")
    p.add_argument("--max-steps", type=int, default=500, help="Max steps per episode")
    p.add_argument("--lr", type=float, default=3e-4, help="PPO learning rate")
    p.add_argument("--n-steps", type=int, default=2048, help="PPO rollout n_steps")
    p.add_argument("--batch-size", type=int, default=64, help="PPO mini-batch size")
    p.add_argument("--seed", type=int, default=0, help="SB3 global seed")
    return p.parse_args(argv[1:])


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    args = parse_args(argv)

    run_name = args.run_name or f"ppo-{args.world_seed}"

    print("── Abyssal PPO Training ───────────────────────────────────────────")
    print(f"   run_name       : {run_name}")
    print(f"   world_seed     : {args.world_seed}")
    print(f"   total_steps    : {args.total_steps:,}")
    print(f"   max_steps/ep   : {args.max_steps}")
    print(f"   lr             : {args.lr}")
    print(f"   n_steps        : {args.n_steps}")
    print(f"   batch_size     : {args.batch_size}")
    print(f"   sb3_seed       : {args.seed}")

    # ── Create run directory ──────────────────────────────────────────────────
    run = RunDir.create(run_name, output_dir=args.output_dir)
    print(f"\n   run_dir        : {run.path}")

    # ── Save config ───────────────────────────────────────────────────────────
    cfg = {
        "benchmark_version": "0.1.0",
        "phase": "3",
        "run_name": run_name,
        "world_seed": args.world_seed,
        "total_timesteps": args.total_steps,
        "max_steps": args.max_steps,
        "learning_rate": args.lr,
        "n_steps": args.n_steps,
        "batch_size": args.batch_size,
        "sb3_seed": args.seed,
        "env_version": ENV_VERSION,
        "policy": "MlpPolicy",
        "net_arch": [256, 256],
    }
    run.save_config(cfg)
    print(f"   config saved   : {run.config_path()}")

    # ── Build env factory ─────────────────────────────────────────────────────
    world_seed = args.world_seed
    max_steps = args.max_steps

    def env_factory():
        return make_env(world_seed=world_seed, max_steps=max_steps)

    # ── Build agent ───────────────────────────────────────────────────────────
    print("\n── Building PPO agent …")
    try:
        agent = PPOAgent(
            env_factory=env_factory,
            ppo_kwargs={
                "learning_rate": args.lr,
                "n_steps": args.n_steps,
                "batch_size": args.batch_size,
                "verbose": 1,
            },
            seed=args.seed,
        )
    except Exception as exc:
        print(f"\n✗ Failed to build agent: {exc}", file=sys.stderr)
        return 1

    # ── Train ─────────────────────────────────────────────────────────────────
    print(f"\n── Training for {args.total_steps:,} timesteps …\n")
    t0 = time.monotonic()
    try:
        agent.train(total_timesteps=args.total_steps, progress_bar=False)
    except Exception as exc:
        print(f"\n✗ Training failed: {exc}", file=sys.stderr)
        return 1
    elapsed = time.monotonic() - t0

    # ── Save model ────────────────────────────────────────────────────────────
    model_path = run.model_path()
    agent.save(model_path.with_suffix(""))  # SB3 adds .zip
    print(f"\n   model saved    : {model_path}")

    # ── Save train summary ────────────────────────────────────────────────────
    train_summary = {
        "run_name": run_name,
        "world_seed": args.world_seed,
        "total_timesteps_requested": args.total_steps,
        "total_timesteps_trained": agent.num_timesteps(),
        "elapsed_seconds": round(elapsed, 2),
        "git_commit": get_git_commit(),
        "env_version": ENV_VERSION,
    }
    run.save_json("train_summary.json", train_summary)
    print(f"   summary saved  : {run.train_summary_path()}")

    # ── Done ──────────────────────────────────────────────────────────────────
    print(f"\n✓ Training complete in {elapsed:.1f}s")
    print(f"✓ Run dir: {run.path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
