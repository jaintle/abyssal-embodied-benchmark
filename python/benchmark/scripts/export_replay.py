#!/usr/bin/env python3
"""
export_replay.py — Episode replay export CLI (Phase 3)

Records one or more deterministic episodes and writes them as JSONL replay
files compatible with the shared replay schema.

Usage
─────
    python export_replay.py --run-name RUN_NAME [OPTIONS]
    python export_replay.py --model-path PATH --output-dir PATH [OPTIONS]

Options
───────
    --run-name      STR   Load model from results/runs/<run-name>/model.zip
                          and save replays there.
    --model-path    PATH  Explicit path to model.zip
    --output-dir    PATH  Parent dir for run dirs  [default: <repo>/results/runs]
    --world-seed    INT   World seed               [default: 42]
    --n-replays     INT   Number of episodes to record [default: 3]
    --base-ep-seed  INT   Base seed for episode seeds  [default: 2000]
    --max-steps     INT   Max steps per episode        [default: 500]
    --policy-id     STR   Policy label in replay headers

Output files
────────────
    <run_dir>/replays/replay_seed_<N>.jsonl  for each episode seed N

Exit codes
──────────
    0 — export completed successfully
    1 — error
"""

from __future__ import annotations

import argparse
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
from abyssal_benchmark.eval.replay_export import export_episode
from abyssal_benchmark.utils.config import RunDir, DEFAULT_RESULTS_DIR
from abyssal_benchmark.utils.seeding import derive_seed


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export replay files from a trained policy")
    group = p.add_mutually_exclusive_group()
    group.add_argument("--run-name", type=str, default=None,
                       help="Run directory name under output-dir")
    group.add_argument("--model-path", type=Path, default=None,
                       help="Explicit path to model.zip")
    p.add_argument("--output-dir", type=Path, default=None,
                   help="Parent dir for run dirs")
    p.add_argument("--world-seed", type=int, default=42)
    p.add_argument("--n-replays", type=int, default=3,
                   help="Number of episodes to record")
    p.add_argument("--base-ep-seed", type=int, default=2000,
                   help="Base seed for deriving per-episode seeds")
    p.add_argument("--max-steps", type=int, default=500)
    p.add_argument("--policy-id", type=str, default=None)
    return p.parse_args(argv[1:])


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    args = parse_args(argv)

    # ── Resolve paths ─────────────────────────────────────────────────────────
    base = args.output_dir or DEFAULT_RESULTS_DIR

    if args.model_path:
        model_path = args.model_path.resolve()
        replays_dir = model_path.parent / "replays"
        policy_id = args.policy_id or "ppo"
    elif args.run_name:
        run = RunDir.open(base / args.run_name)
        model_path = run.model_path()
        replays_dir = run.replays_dir
        policy_id = args.policy_id or args.run_name
    else:
        print("✗ Provide --run-name or --model-path", file=sys.stderr)
        return 1

    if not model_path.exists():
        print(f"✗ Model not found: {model_path}", file=sys.stderr)
        return 1

    replays_dir.mkdir(parents=True, exist_ok=True)

    print("── Abyssal Replay Export ─────────────────────────────────────────")
    print(f"   model_path     : {model_path}")
    print(f"   replays_dir    : {replays_dir}")
    print(f"   world_seed     : {args.world_seed}")
    print(f"   n_replays      : {args.n_replays}")
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

    # ── Record and export episodes ────────────────────────────────────────────
    print(f"\n── Recording {args.n_replays} episode(s) …\n")
    ep_seeds = [derive_seed(args.base_ep_seed, i) for i in range(args.n_replays)]

    for i, ep_seed in enumerate(ep_seeds):
        out_path = replays_dir / f"replay_seed_{ep_seed}.jsonl"
        try:
            replay = export_episode(
                policy=agent,
                output_path=out_path,
                world_seed=args.world_seed,
                episode_seed=ep_seed,
                max_steps=args.max_steps,
                policy_id=policy_id,
            )
        except Exception as exc:
            print(f"  ✗ Episode {i} (seed={ep_seed}) failed: {exc}", file=sys.stderr)
            return 1

        final_step = replay.steps[-1] if replay.steps else None
        outcome = "GOAL" if (final_step and final_step.doneFlag) else "?"
        done_flag = final_step.doneFlag if final_step else False
        collision_flag = final_step.collisionFlag if final_step else False
        # Determine outcome from last step flags
        outcome_str = "DONE" if done_flag else "running"
        print(
            f"  ✓ replay {i:>2}  seed={ep_seed:>10}  "
            f"steps={len(replay.steps):>4}  →  {out_path.name}"
        )

    print(f"\n✓ Export complete — {args.n_replays} replay(s) in {replays_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
