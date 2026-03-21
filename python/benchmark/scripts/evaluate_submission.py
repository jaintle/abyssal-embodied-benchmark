#!/usr/bin/env python3
"""
evaluate_submission.py — Official evaluation runner for external submissions (Phase B)

Evaluates a community submission under the official benchmark protocol and
produces canonical, publishable artifacts.  This is the authoritative evaluation
path that determines whether a submission can be marked ``verified``.

Protocol guarantees
───────────────────
- Identical seeds across all agents and all runs of this script with the
  same --world-seed / --n-episodes / --base-ep-seed combination.
- Same BenchmarkRunner used by internal benchmark runs.
- Artifacts are structured identically to run_benchmark.py output.
- A verification manifest is written alongside the artifacts.

Output structure
────────────────
    <output_dir>/<submission_id>/
        verification_manifest.json   ← new: records evaluation provenance
        clear/
            benchmark_config.json
            aggregate_summary.csv
            aggregate_summary.json
            per_episode.csv
            replays/
        heavy/                       ← if --degradation-presets includes heavy
            ...

Usage
─────
    python python/benchmark/scripts/evaluate_submission.py \\
        --submission-dir submissions/example_heuristic \\
        --world-seed 42 \\
        --n-episodes 10 \\
        --max-steps 200 \\
        --degradation-presets clear heavy \\
        --output-dir results/submissions

Exit codes:
    0  — evaluation completed successfully
    1  — error (validation failure, adapter error, or runtime error)
    2  — usage error
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

_THIS_FILE = Path(__file__).resolve()
_SRC = _THIS_FILE.parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

_REPO_ROOT = _THIS_FILE.parents[3]

from abyssal_benchmark.eval.benchmark_runner import BenchmarkRunner, _write_json
from abyssal_benchmark.utils.io import ensure_dir, get_git_commit
from abyssal_benchmark.utils.seeding import derive_seed
from abyssal_benchmark.utils.submission_loader import (
    SubmissionLoadError,
    load_submission,
)

VALID_PRESETS = ("clear", "mild", "heavy")
DEFAULT_OUTPUT_DIR = _REPO_ROOT / "results" / "submissions"


# ─── CLI ──────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Official evaluation runner for external benchmark submissions. "
            "Produces canonical, publishable artifacts under the official protocol."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--submission-dir",
        type=Path,
        required=True,
        metavar="DIR",
        help="Path to the submission bundle directory (contains metadata.json and adapter.py).",
    )
    p.add_argument(
        "--world-seed",
        type=int,
        default=42,
        help="World generation seed. Must be identical across all official runs.",
    )
    p.add_argument(
        "--n-episodes",
        type=int,
        default=50,
        help="Number of evaluation episodes per preset.",
    )
    p.add_argument(
        "--max-steps",
        type=int,
        default=500,
        help="Hard step limit per episode.",
    )
    p.add_argument(
        "--base-ep-seed",
        type=int,
        default=1000,
        help="Base seed for deriving per-episode seeds.",
    )
    p.add_argument(
        "--degradation-presets",
        type=str,
        default="clear,heavy",
        help="Comma-separated list of presets to evaluate. Valid: clear, mild, heavy.",
    )
    p.add_argument(
        "--export-replay-index",
        type=int,
        default=0,
        metavar="INDEX",
        help="Episode index (0-based) for which to export a JSONL replay per preset.",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Root output directory. Artifacts go into <output-dir>/<submission_id>/.",
    )
    p.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip bundle structural validation (use only when debugging).",
    )
    p.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress per-episode progress output.",
    )
    return p


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    # ── Parse presets ──────────────────────────────────────────────────────
    presets = [p.strip() for p in args.degradation_presets.split(",") if p.strip()]
    invalid = [p for p in presets if p not in VALID_PRESETS]
    if invalid:
        print(f"[ERROR] Unknown degradation presets: {invalid}. Valid: {list(VALID_PRESETS)}")
        return 1
    if not presets:
        print("[ERROR] --degradation-presets must specify at least one preset.")
        return 1

    # ── Load and validate submission bundle ────────────────────────────────
    print(f"\n{'='*72}")
    print(f"  OFFICIAL SUBMISSION EVALUATION — benchmark v1.0.0")
    print(f"{'='*72}")
    print(f"  Submission : {args.submission_dir}")
    print(f"  World seed : {args.world_seed}")
    print(f"  Episodes   : {args.n_episodes} per preset")
    print(f"  Presets    : {presets}")
    print(f"  Max steps  : {args.max_steps}")

    try:
        bundle = load_submission(args.submission_dir)
    except SubmissionLoadError as exc:
        print(f"\n[ERROR] Submission validation failed: {exc}")
        return 1

    submission_id = bundle.metadata.submission_id
    print(f"  Agent      : {bundle.metadata.agent_id}  ({submission_id})")

    # ── Load adapter ───────────────────────────────────────────────────────
    print(f"\n  Loading adapter…")
    try:
        bundle.load_adapter_module()
        agent = bundle.instantiate_adapter()
        if hasattr(agent, "load"):
            agent.load(bundle.model_dir)
        policy_id = agent.get_policy_id()
        print(f"  Adapter loaded: {agent.__class__.__name__}  policy_id={policy_id!r}")
    except SubmissionLoadError as exc:
        print(f"\n[ERROR] Adapter load failed: {exc}")
        return 1
    except Exception as exc:
        print(f"\n[ERROR] Unexpected adapter error: {exc}")
        return 1

    # ── Cross-check policy_id ──────────────────────────────────────────────
    if policy_id != bundle.metadata.agent_id:
        print(
            f"\n[WARN] get_policy_id()={policy_id!r} does not match "
            f"metadata.agent_id={bundle.metadata.agent_id!r}. "
            "Replay headers will use get_policy_id() value."
        )

    # ── Resolve output directory ───────────────────────────────────────────
    output_dir = ensure_dir(args.output_dir / submission_id)

    # ── Resolve replay seed ────────────────────────────────────────────────
    replay_seed = derive_seed(args.base_ep_seed, args.export_replay_index)
    print(f"  Replay seed: {replay_seed}  (episode index {args.export_replay_index})")

    # ── Run one BenchmarkRunner per preset ────────────────────────────────
    all_summaries = []
    multi_preset = len(presets) > 1

    for preset in presets:
        preset_dir = ensure_dir(output_dir / preset)

        print(f"\n{'─'*72}")
        print(f"  PRESET: {preset.upper()}  →  {preset_dir}")
        print(f"{'─'*72}")

        runner = BenchmarkRunner(
            world_seed=args.world_seed,
            n_episodes=args.n_episodes,
            max_steps=args.max_steps,
            base_episode_seed=args.base_ep_seed,
            replay_seed=replay_seed,
            degradation_preset=preset,
            verbose=not args.quiet,
        )

        # Reset agent state before each preset
        if hasattr(agent, "reset"):
            agent.reset()

        try:
            summaries = runner.run([agent], preset_dir)
        except Exception as exc:
            print(f"\n[ERROR] Evaluation failed for preset '{preset}': {exc}")
            return 1

        all_summaries.extend(summaries)

        # Per-preset printout
        for s in summaries:
            print(
                f"\n  {preset.upper()} results for {s.agent_id}:\n"
                f"    success={s.success_rate:.0%}  "
                f"collision={s.collision_rate:.0%}  "
                f"timeout={s.timeout_rate:.0%}  "
                f"mean_reward={s.mean_reward:+.2f}  "
                f"mean_dist={s.mean_final_dist:.2f}"
            )

    # ── Robustness summary (multi-preset) ──────────────────────────────────
    if multi_preset:
        _write_robustness_summary(all_summaries, output_dir)
        print(f"\n  Robustness summary: {output_dir / 'robustness_summary.json'}")

    # ── Verification manifest ─────────────────────────────────────────────
    _write_verification_manifest(
        bundle=bundle,
        agent_policy_id=policy_id,
        presets=presets,
        args=args,
        all_summaries=all_summaries,
        output_dir=output_dir,
    )

    print(f"\n{'='*72}")
    print(f"  EVALUATION COMPLETE")
    print(f"  Artifacts: {output_dir}")
    print(f"\n  Next step — publish:")
    print(
        f"  python python/benchmark/scripts/publish_submission.py \\\n"
        f"    --submission-dir {args.submission_dir} \\\n"
        f"    --evaluation-dir {output_dir} \\\n"
        f"    --public-data-dir apps/web/public/data"
    )
    print(f"{'='*72}\n")
    return 0


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _write_robustness_summary(summaries: list, output_dir: Path) -> None:
    from abyssal_benchmark.eval.benchmark_runner import _write_csv
    rows = []
    for s in summaries:
        rows.append({
            "degradation_preset": s.degradation_preset,
            "agent_id": s.agent_id,
            "world_seed": s.world_seed,
            "n_episodes": s.n_episodes,
            "success_rate": s.success_rate,
            "collision_rate": s.collision_rate,
            "timeout_rate": s.timeout_rate,
            "oob_rate": s.oob_rate,
            "mean_reward": s.mean_reward,
            "std_reward": s.std_reward,
            "mean_steps": s.mean_steps,
            "std_steps": s.std_steps,
            "mean_final_dist": s.mean_final_dist,
            "std_final_dist": s.std_final_dist,
            "mean_action_magnitude": getattr(s, "mean_action_magnitude", 0.0),
            "benchmark_version": s.benchmark_version,
            "env_version": s.env_version,
        })
    _write_json(rows, output_dir / "robustness_summary.json")
    _write_csv(rows, output_dir / "robustness_summary.csv")


def _write_verification_manifest(
    bundle,
    agent_policy_id: str,
    presets: list,
    args: argparse.Namespace,
    all_summaries: list,
    output_dir: Path,
) -> None:
    """
    Write a machine-readable evaluation provenance record.

    This manifest is the basis for the ``verified`` status transition.
    It records who evaluated what, with what seeds, and what the results were.
    """
    preset_metrics = {}
    for s in all_summaries:
        preset_metrics[s.degradation_preset] = {
            "success_rate": s.success_rate,
            "collision_rate": s.collision_rate,
            "timeout_rate": s.timeout_rate,
            "mean_reward": s.mean_reward,
            "mean_final_dist": s.mean_final_dist,
            "mean_action_magnitude": getattr(s, "mean_action_magnitude", 0.0),
            "n_episodes": s.n_episodes,
        }

    manifest = {
        "manifest_type": "evaluation_verification",
        "benchmark_version": "1.0.0",
        "evaluated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": get_git_commit(),
        "submission_id": bundle.metadata.submission_id,
        "agent_id": bundle.metadata.agent_id,
        "policy_id_from_adapter": agent_policy_id,
        "submission_status_before": bundle.metadata.submission_status,
        "evaluation_params": {
            "world_seed": args.world_seed,
            "n_episodes": args.n_episodes,
            "max_steps": args.max_steps,
            "base_ep_seed": args.base_ep_seed,
            "degradation_presets": presets,
        },
        "preset_metrics": preset_metrics,
        "recommendation": "verified",
        "artifacts_dir": str(output_dir),
    }

    _write_json(manifest, output_dir / "verification_manifest.json")
    print(f"  Verification manifest: {output_dir / 'verification_manifest.json'}")


if __name__ == "__main__":
    sys.exit(main())
