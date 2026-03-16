#!/usr/bin/env python3
"""
generate_contract_test_replay.py — Phase 2: cross-contract test helper

Generates a small, deterministic JSONL replay artifact using a zero-action
policy (no trained model required).  The output is consumed by the TS-side
contract test (tools/validate_replay.ts) to prove the Python→browser format
contract is intact.

Requirements: gymnasium, numpy, pydantic — NO stable_baselines3 / torch.

Usage
─────
    python scripts/generate_contract_test_replay.py --output PATH [OPTIONS]

Options
───────
    --output   PATH  JSONL file path to write             [REQUIRED]
    --seed     INT   World / episode seed                 [default: 1]
    --steps    INT   Max episode steps (keep small)       [default: 20]
    --version       Print BENCHMARK_VERSION and exit

Exit codes
──────────
    0 — replay written successfully
    1 — error
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# ── Resolve src ───────────────────────────────────────────────────────────────
_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import abyssal_benchmark.envs  # noqa: F401 — registers Gymnasium env
import numpy as np

from abyssal_benchmark.eval.replay_export import export_episode, BENCHMARK_VERSION


# ─── Minimal stub policy ──────────────────────────────────────────────────────

class ZeroPolicy:
    """Always acts zero — deterministic, episodes reach max_steps cleanly."""

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        return np.zeros(2, dtype=np.float32)


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Generate a contract-test JSONL replay (no ML model needed)"
    )
    p.add_argument("--output", type=Path, required=True,
                   help="Destination JSONL path")
    p.add_argument("--seed", type=int, default=1,
                   help="World + episode seed (default: 1)")
    p.add_argument("--steps", type=int, default=20,
                   help="Max episode steps (default: 20)")
    p.add_argument("--version", action="store_true",
                   help="Print BENCHMARK_VERSION and exit")
    return p.parse_args(argv[1:])


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if args.version:
        print(BENCHMARK_VERSION)
        return 0

    out_path: Path = args.output
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"  benchmarkVersion : {BENCHMARK_VERSION}")
    print(f"  world_seed       : {args.seed}")
    print(f"  episode_seed     : {args.seed}")
    print(f"  max_steps        : {args.steps}")
    print(f"  output           : {out_path}")

    try:
        export_episode(
            policy=ZeroPolicy(),
            output_path=out_path,
            world_seed=args.seed,
            episode_seed=args.seed,
            max_steps=args.steps,
            policy_id="contract-test-zero",
            degradation_preset="clear",
        )
    except Exception as exc:
        print(f"✗ Failed to generate replay: {exc}", file=sys.stderr)
        return 1

    size_kb = out_path.stat().st_size / 1024
    print(f"✓ Replay written ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
