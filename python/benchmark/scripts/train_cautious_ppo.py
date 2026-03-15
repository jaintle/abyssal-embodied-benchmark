#!/usr/bin/env python3
"""
train_cautious_ppo.py — Cautious PPO baseline training (Phase 8)

Trains a PPO agent on AbyssalNavigationEnv with two safety-oriented changes
compared to the standard PPO baseline:

  1. ``uncertainty_obs=True`` — the env exposes a visibility quality scalar
     at obs[40].  The policy can learn to condition on this signal.
  2. ``CautiousRewardWrapper`` — adds a caution penalty that discourages
     large actions when visibility quality is low:

         r_total = r_env  −  caution_coeff × (1 − visibility_quality) × ‖a‖²

The resulting policy is expected to:
  - Take smaller actions under heavy degradation
  - Collide less (accepting higher timeout rates as a tradeoff)
  - Be more robust across degradation presets

NOTE: This is a benchmark baseline, not a novel algorithm.  The value of
this run is in producing a comparison point against standard PPO under the
benchmark's safety-performance tradeoff framing.

Usage
─────
    python train_cautious_ppo.py [OPTIONS]

Options
───────
    --world-seed      INT     World generation seed         [default: 42]
    --total-steps     INT     Total training timesteps      [default: 200_000]
    --run-name        STR     Run directory name            [default: cautious-ppo-<world_seed>]
    --output-dir      PATH    Parent dir for run dirs       [default: <repo>/results/runs]
    --max-steps       INT     Env max steps per episode     [default: 500]
    --degradation     STR     Training degradation preset   [default: clear]
    --caution-coeff   FLOAT   Caution penalty coefficient   [default: 0.3]
    --lr              FLOAT   Learning rate                 [default: 3e-4]
    --n-steps         INT     Rollout buffer size (PPO)     [default: 2048]
    --batch-size      INT     Mini-batch size (PPO)         [default: 64]
    --seed            INT     SB3 global seed               [default: 0]

Artefacts saved to results/runs/<run-name>/
    config.json
    model.zip
    train_summary.json
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
from abyssal_benchmark.agents.cautious_agent import CautiousAgent, CautiousRewardWrapper
from abyssal_benchmark.agents.ppo_agent import PPOAgent
from abyssal_benchmark.utils.config import RunDir
from abyssal_benchmark.utils.io import get_git_commit

ENV_VERSION = "0.1.0"


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Train cautious PPO baseline on AbyssalNavigationEnv (Phase 8)"
    )
    p.add_argument("--world-seed", type=int, default=42)
    p.add_argument("--total-steps", type=int, default=200_000)
    p.add_argument("--run-name", type=str, default=None)
    p.add_argument("--output-dir", type=Path, default=None)
    p.add_argument("--max-steps", type=int, default=500)
    p.add_argument(
        "--degradation", type=str, default="clear",
        choices=["clear", "mild", "heavy"],
        help="Degradation preset used during training (default: clear).",
    )
    p.add_argument(
        "--caution-coeff", type=float, default=0.3,
        help="Caution penalty coefficient α. Higher → more conservative policy.",
    )
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--n-steps", type=int, default=2048)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--seed", type=int, default=0)
    return p.parse_args(argv[1:])


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    args = parse_args(argv)

    run_name = args.run_name or f"cautious-ppo-{args.world_seed}"

    print("── Abyssal Cautious PPO Training ─────────────────────────────────")
    print(f"   run_name       : {run_name}")
    print(f"   world_seed     : {args.world_seed}")
    print(f"   total_steps    : {args.total_steps:,}")
    print(f"   max_steps/ep   : {args.max_steps}")
    print(f"   degradation    : {args.degradation}")
    print(f"   caution_coeff  : {args.caution_coeff}")
    print(f"   lr             : {args.lr}")
    print(f"   n_steps        : {args.n_steps}")
    print(f"   batch_size     : {args.batch_size}")
    print(f"   sb3_seed       : {args.seed}")
    print()
    print("   [uncertainty_obs=True: obs dim = 41 (includes visibility quality)]")
    print(f"   [CautiousRewardWrapper: penalty = {args.caution_coeff} × (1−vis) × ‖a‖²]")

    # ── Create run directory ──────────────────────────────────────────────────
    run = RunDir.create(run_name, output_dir=args.output_dir)
    print(f"\n   run_dir        : {run.path}")

    # ── Save config ───────────────────────────────────────────────────────────
    cfg = {
        "benchmark_version": "0.1.0",
        "phase": "8",
        "run_name": run_name,
        "agent_type": "cautious_ppo",
        "world_seed": args.world_seed,
        "total_timesteps": args.total_steps,
        "max_steps": args.max_steps,
        "training_degradation": args.degradation,
        "caution_coeff": args.caution_coeff,
        "uncertainty_obs": True,
        "learning_rate": args.lr,
        "n_steps": args.n_steps,
        "batch_size": args.batch_size,
        "sb3_seed": args.seed,
        "env_version": ENV_VERSION,
        "policy": "MlpPolicy",
        "net_arch": [256, 256],
        "obs_dim": 41,
    }
    run.save_config(cfg)
    print(f"   config saved   : {run.config_path()}")

    # ── Build env factory ─────────────────────────────────────────────────────
    world_seed = args.world_seed
    max_steps = args.max_steps
    degradation = args.degradation
    caution_coeff = args.caution_coeff

    def env_factory():
        env = make_env(
            world_seed=world_seed,
            max_steps=max_steps,
            degradation_preset=degradation,
            uncertainty_obs=True,
        )
        return CautiousRewardWrapper(env, caution_coeff=caution_coeff)

    # ── Build agent ───────────────────────────────────────────────────────────
    print("\n── Building Cautious PPO agent …")
    try:
        # CautiousAgent uses standard PPO training — the safety behaviour
        # emerges from the reward shaping and the uncertainty obs signal.
        ppo_agent = PPOAgent(
            env_factory=env_factory,
            ppo_kwargs={
                "learning_rate": args.lr,
                "n_steps": args.n_steps,
                "batch_size": args.batch_size,
                "verbose": 1,
            },
            seed=args.seed,
            policy_id="cautious_ppo",
        )
    except Exception as exc:
        print(f"\n✗ Failed to build agent: {exc}", file=sys.stderr)
        return 1

    # ── Train ─────────────────────────────────────────────────────────────────
    print(f"\n── Training for {args.total_steps:,} timesteps …\n")
    t0 = time.monotonic()
    try:
        ppo_agent.train(total_timesteps=args.total_steps, progress_bar=False)
    except Exception as exc:
        print(f"\n✗ Training failed: {exc}", file=sys.stderr)
        return 1
    elapsed = time.monotonic() - t0

    # ── Save model ────────────────────────────────────────────────────────────
    model_path = run.model_path()
    ppo_agent.save(model_path.with_suffix(""))
    print(f"\n   model saved    : {model_path}")

    # ── Save train summary ────────────────────────────────────────────────────
    train_summary = {
        "run_name": run_name,
        "agent_type": "cautious_ppo",
        "world_seed": args.world_seed,
        "training_degradation": args.degradation,
        "caution_coeff": args.caution_coeff,
        "uncertainty_obs": True,
        "obs_dim": 41,
        "total_timesteps_requested": args.total_steps,
        "total_timesteps_trained": ppo_agent.num_timesteps(),
        "elapsed_seconds": round(elapsed, 2),
        "git_commit": get_git_commit(),
        "env_version": ENV_VERSION,
    }
    run.save_json("train_summary.json", train_summary)
    print(f"   summary saved  : {run.train_summary_path()}")

    print(f"\n✓ Training complete in {elapsed:.1f}s")
    print(f"✓ Run dir: {run.path}")
    print()
    print("To evaluate:")
    print(f"  python scripts/run_benchmark.py \\")
    print(f"      --agents cautious_ppo:{run.model_path()} heuristic random \\")
    print(f"      --degradation-presets clear heavy \\")
    print(f"      --world-seed {args.world_seed}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
