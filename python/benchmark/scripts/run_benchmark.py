#!/usr/bin/env python3
"""
run_benchmark.py — Generic multi-agent benchmark CLI (Phase 5)

Evaluates one or more agents on a fixed seed sequence and writes a
standardised result bundle to disk.

Usage examples
──────────────
Evaluate heuristic and random agents:

    python scripts/run_benchmark.py \\
        --agents heuristic random \\
        --world-seed 42 \\
        --n-episodes 10 \\
        --run-name my-baseline-run

Evaluate heuristic + a trained PPO checkpoint:

    python scripts/run_benchmark.py \\
        --agents heuristic ppo:results/runs/ppo-run-01/model.zip \\
        --world-seed 42 \\
        --n-episodes 20 \\
        --export-replay-seed 0 \\
        --run-name ppo-vs-heuristic

Agent specifiers
────────────────
    random              — RandomAgent (seed 0)
    heuristic           — HeuristicAgent
    ppo:<path>          — PPOAgent loaded from checkpoint at <path>
    ppo:<path>:<id>     — PPOAgent with a custom policy_id label

Output bundle
─────────────
    results/benchmarks/<run-name>/
        benchmark_config.json
        aggregate_summary.csv
        aggregate_summary.json
        per_episode.csv
        replays/            (only if --export-replay-seed is given)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Resolve the project root so scripts can run from anywhere.
# run_benchmark.py lives at:  <repo>/python/benchmark/scripts/run_benchmark.py
#   parents[0] = .../scripts
#   parents[1] = .../benchmark
#   parents[2] = .../python
#   parents[3] = repo root
_THIS_FILE = Path(__file__).resolve()
_REPO_ROOT = _THIS_FILE.parents[3]
_SRC = _THIS_FILE.parent.parent / "src"   # .../benchmark/src (simpler, no repo root needed)
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from abyssal_benchmark.agents.random_agent import RandomAgent
from abyssal_benchmark.agents.heuristic_agent import HeuristicAgent
from abyssal_benchmark.agents.ppo_agent import PPOAgent
from abyssal_benchmark.envs.make_env import make_env
from abyssal_benchmark.eval.benchmark_runner import BenchmarkRunner
from abyssal_benchmark.utils.io import ensure_dir

DEFAULT_RESULTS_DIR = _REPO_ROOT / "results" / "leaderboard"


# ─── Agent factory ────────────────────────────────────────────────────────────

def _build_agent(spec: str, world_seed: int, max_steps: int) -> object:
    """
    Parse an agent specifier string and return a BenchmarkAgent.

    Supported specifiers:
        random              → RandomAgent
        heuristic           → HeuristicAgent
        ppo:<path>          → PPOAgent loaded from <path>
        ppo:<path>:<id>     → PPOAgent with custom policy_id
    """
    parts = spec.split(":", maxsplit=2)
    kind = parts[0].lower()

    if kind == "random":
        return RandomAgent(seed=0, policy_id="random")

    if kind == "heuristic":
        return HeuristicAgent(policy_id="heuristic")

    if kind == "ppo":
        if len(parts) < 2:
            raise ValueError("ppo agent specifier must include a path: ppo:<path>")
        model_path = Path(parts[1])
        if not model_path.exists():
            # Also try resolving relative to repo root
            model_path = _REPO_ROOT / parts[1]
        if not model_path.exists():
            raise FileNotFoundError(f"PPO model not found: {parts[1]}")
        policy_id = parts[2] if len(parts) >= 3 else "ppo"

        def _env_factory():
            return make_env(world_seed=world_seed, max_steps=max_steps)

        return PPOAgent.load(model_path, env_factory=_env_factory, policy_id=policy_id)

    raise ValueError(
        f"Unknown agent specifier: '{spec}'. "
        "Supported: random, heuristic, ppo:<path>, ppo:<path>:<id>"
    )


# ─── CLI ──────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Abyssal benchmark: evaluate multiple agents on identical seeds.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--agents",
        nargs="+",
        required=True,
        metavar="SPEC",
        help=(
            "One or more agent specifiers: random | heuristic | ppo:<path> | "
            "ppo:<path>:<id>"
        ),
    )
    p.add_argument("--world-seed", type=int, default=42,
                   help="World generation seed (identical for all agents).")
    p.add_argument("--n-episodes", type=int, default=20,
                   help="Number of evaluation episodes per agent.")
    p.add_argument("--max-steps", type=int, default=500,
                   help="Hard step limit per episode.")
    p.add_argument("--base-ep-seed", type=int, default=1000,
                   help="Base seed for deriving per-episode seeds.")
    p.add_argument(
        "--export-replay-seed",
        type=int,
        default=None,
        metavar="SEED",
        help=(
            "Episode seed for which to export a JSONL replay for each agent. "
            "Must be one of the derived episode seeds. "
            "Pass the first episode seed (shown in output) if unsure."
        ),
    )
    p.add_argument("--run-name", type=str, default=None,
                   help="Name for the output directory under results/benchmarks/.")
    p.add_argument("--output-dir", type=Path, default=None,
                   help="Override output directory (ignores --run-name).")
    p.add_argument("--quiet", action="store_true",
                   help="Suppress per-episode progress output.")
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    # ── Resolve output directory ───────────────────────────────────────────
    if args.output_dir:
        output_dir = args.output_dir
    else:
        run_name = args.run_name or _default_run_name(args)
        output_dir = DEFAULT_RESULTS_DIR / run_name
    ensure_dir(output_dir)

    # ── Build agents ───────────────────────────────────────────────────────
    agents = []
    for spec in args.agents:
        try:
            agent = _build_agent(spec, args.world_seed, args.max_steps)
            agents.append(agent)
            print(f"  loaded agent: {agent.get_policy_id()}  ({spec})")
        except Exception as exc:
            print(f"[ERROR] failed to load agent '{spec}': {exc}", file=sys.stderr)
            return 1

    if not agents:
        print("[ERROR] no agents loaded.", file=sys.stderr)
        return 1

    # ── Handle replay seed ─────────────────────────────────────────────────
    replay_seed = args.export_replay_seed
    if replay_seed is not None:
        from abyssal_benchmark.utils.seeding import derive_seed
        valid_seeds = {derive_seed(args.base_ep_seed, i) for i in range(args.n_episodes)}
        if replay_seed not in valid_seeds:
            # Treat the raw int as an episode index instead
            if 0 <= replay_seed < args.n_episodes:
                replay_seed = derive_seed(args.base_ep_seed, replay_seed)
                print(f"  --export-replay-seed interpreted as index → seed {replay_seed}")
            else:
                print(
                    f"[WARN] --export-replay-seed {args.export_replay_seed} is not "
                    f"in the derived episode seed list; replay export will be skipped.",
                    file=sys.stderr,
                )
                replay_seed = None

    # ── Run benchmark ──────────────────────────────────────────────────────
    runner = BenchmarkRunner(
        world_seed=args.world_seed,
        n_episodes=args.n_episodes,
        max_steps=args.max_steps,
        base_episode_seed=args.base_ep_seed,
        replay_seed=replay_seed,
        verbose=not args.quiet,
    )

    print(f"\nOutput: {output_dir}\n")
    summaries = runner.run(agents, output_dir)

    # ── Print leaderboard ──────────────────────────────────────────────────
    print("\n" + "─" * 72)
    print(f"{'AGENT':<20} {'SUCCESS':>8} {'COLLISION':>10} {'TIMEOUT':>8} "
          f"{'MEAN_REW':>10} {'MEAN_DIST':>10}")
    print("─" * 72)
    for s in summaries:
        print(
            f"{s.agent_id:<20} "
            f"{s.success_rate:>8.2%} "
            f"{s.collision_rate:>10.2%} "
            f"{s.timeout_rate:>8.2%} "
            f"{s.mean_reward:>10.2f} "
            f"{s.mean_final_dist:>10.2f}"
        )
    print("─" * 72)
    print(f"\nArtifacts saved to: {output_dir}")
    return 0


def _default_run_name(args: argparse.Namespace) -> str:
    import time
    tag = "-".join(s.split(":")[0] for s in args.agents)
    ts = time.strftime("%Y%m%d-%H%M%S")
    return f"{tag}-seed{args.world_seed}-{ts}"


if __name__ == "__main__":
    sys.exit(main())
