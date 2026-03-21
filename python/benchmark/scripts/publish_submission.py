#!/usr/bin/env python3
"""
publish_submission.py — Publish evaluated submission artifacts to the public data store (Phase B)

Converts official evaluation output into the public-facing artifact bundle
consumed by the web leaderboard, and updates ``leaderboard.json`` with a
new or updated entry.

Workflow
────────
1. Read the submission's ``verification_manifest.json`` from evaluate_submission.py output.
2. Copy (or generate) public-facing artifacts to::

       apps/web/public/data/submissions/<submission_id>/
           metadata.json        ← copied from submission bundle
           summary.json         ← generated from evaluation output
           per_condition.json   ← aggregated per-preset metrics
           replays/             ← replay files from evaluation output

3. Update (or insert) the entry in ``leaderboard.json`` with:
   - status: ``verified`` (if evaluation manifest present and valid)
   - denormalised key metrics
   - artifact paths relative to ``public/data/``
   - verification timestamp

Usage
─────
    python python/benchmark/scripts/publish_submission.py \\
        --submission-dir submissions/example_heuristic \\
        --evaluation-dir results/submissions/example-heuristic-v1 \\
        --public-data-dir apps/web/public/data

    # Publish as provisional (no re-run, just expose the submitted artifacts):
    python python/benchmark/scripts/publish_submission.py \\
        --submission-dir submissions/example_heuristic \\
        --public-data-dir apps/web/public/data \\
        --status provisional

Exit codes:
    0  — published successfully
    1  — error
    2  — usage error
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_THIS_FILE = Path(__file__).resolve()
_SRC = _THIS_FILE.parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

_REPO_ROOT = _THIS_FILE.parents[3]

from abyssal_benchmark.schemas.submission_metadata import (
    SubmissionMetadata,
    SubmissionStatus,
    validate_submission_metadata,
)
from abyssal_benchmark.schemas.leaderboard import (
    LeaderboardEntry,
    LeaderboardManifest,
    validate_leaderboard_manifest,
)
from abyssal_benchmark.utils.io import ensure_dir
from abyssal_benchmark.utils.submission_loader import (
    SubmissionLoadError,
    load_submission,
)

DEFAULT_LEADERBOARD_PATH_REL = "leaderboard/leaderboard.json"


# ─── CLI ──────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Publish a evaluated submission to the public leaderboard data store. "
            "Updates leaderboard.json and copies public-facing artifacts."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--submission-dir",
        type=Path,
        required=True,
        metavar="DIR",
        help="Path to the submission bundle (contains metadata.json, adapter.py, etc.).",
    )
    p.add_argument(
        "--evaluation-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help=(
            "Path to evaluate_submission.py output directory "
            "(contains verification_manifest.json + preset subdirs). "
            "Required for verified publishing; omit for provisional."
        ),
    )
    p.add_argument(
        "--public-data-dir",
        type=Path,
        default=_REPO_ROOT / "apps" / "web" / "public" / "data",
        help="Root of the public data store (contains leaderboard/ and submissions/).",
    )
    p.add_argument(
        "--status",
        choices=["verified", "provisional"],
        default=None,
        help=(
            "Force a specific status. "
            "Defaults to 'verified' if --evaluation-dir is provided, "
            "otherwise 'provisional'."
        ),
    )
    p.add_argument(
        "--leaderboard-path",
        type=Path,
        default=None,
        help=(
            f"Path to leaderboard.json (default: "
            f"<public-data-dir>/{DEFAULT_LEADERBOARD_PATH_REL})."
        ),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without writing any files.",
    )
    return p


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    dry_run = args.dry_run
    if dry_run:
        print("[DRY RUN — no files will be written]")

    # ── Load submission metadata ───────────────────────────────────────────
    try:
        bundle = load_submission(args.submission_dir)
    except SubmissionLoadError as exc:
        print(f"[ERROR] Failed to load submission: {exc}")
        return 1

    meta = bundle.metadata
    submission_id = meta.submission_id
    print(f"\n  Publishing: {submission_id}  ({meta.submission_name})")
    print(f"  Agent:      {meta.agent_id}")

    # ── Load verification manifest ─────────────────────────────────────────
    verification: Optional[Dict[str, Any]] = None
    if args.evaluation_dir:
        manifest_path = args.evaluation_dir / "verification_manifest.json"
        if not manifest_path.exists():
            print(
                f"[ERROR] verification_manifest.json not found in {args.evaluation_dir}. "
                "Run evaluate_submission.py first."
            )
            return 1
        try:
            verification = json.loads(manifest_path.read_text(encoding="utf-8"))
            _check_manifest_consistency(verification, meta)
        except Exception as exc:
            print(f"[ERROR] Could not read verification manifest: {exc}")
            return 1
        print(f"  Evaluation: {args.evaluation_dir}")

    # ── Determine status ───────────────────────────────────────────────────
    if args.status:
        status: SubmissionStatus = args.status  # type: ignore[assignment]
    elif verification is not None:
        status = "verified"
    else:
        status = "provisional"

    print(f"  Status:     {status}")

    # ── Resolve public artifact target ─────────────────────────────────────
    public_data_dir = args.public_data_dir.resolve()
    pub_sub_dir = public_data_dir / "submissions" / submission_id
    print(f"  Target:     {pub_sub_dir}")

    if not dry_run:
        ensure_dir(pub_sub_dir)

    # ── Copy metadata.json ─────────────────────────────────────────────────
    _copy_file(
        src=bundle.submission_dir / "metadata.json",
        dst=pub_sub_dir / "metadata.json",
        dry_run=dry_run,
        label="metadata.json",
    )

    # ── Build and write summary.json ───────────────────────────────────────
    preset_metrics: Dict[str, Any] = {}
    if verification:
        preset_metrics = verification.get("preset_metrics", {})
    else:
        # Provisional: try to read from submitted artifacts
        submitted_summary = bundle.artifacts_dir / "aggregate_summary.json"
        if submitted_summary.exists():
            try:
                raw = json.loads(submitted_summary.read_text(encoding="utf-8"))
                for preset, pm in raw.get("presets", {}).items():
                    preset_metrics[preset] = pm
            except Exception:
                pass

    summary_json = _build_summary_json(meta, preset_metrics, verification, status)
    _write_json_file(pub_sub_dir / "summary.json", summary_json, dry_run, "summary.json")

    # ── Build and write per_condition.json ────────────────────────────────
    per_condition = _build_per_condition_json(meta, preset_metrics)
    _write_json_file(
        pub_sub_dir / "per_condition.json", per_condition, dry_run, "per_condition.json"
    )

    # ── Copy replays ───────────────────────────────────────────────────────
    replay_src = _find_replay_source(args.evaluation_dir, bundle)
    if replay_src:
        _copy_replays(replay_src, pub_sub_dir / "replays", dry_run)
    else:
        print("  [WRN] No replay source found — replays/ will be empty")
        if not dry_run:
            ensure_dir(pub_sub_dir / "replays")

    # ── Update leaderboard.json ────────────────────────────────────────────
    leaderboard_path = (
        args.leaderboard_path
        or public_data_dir / DEFAULT_LEADERBOARD_PATH_REL
    )
    _update_leaderboard(
        leaderboard_path=leaderboard_path,
        meta=meta,
        status=status,
        preset_metrics=preset_metrics,
        verification=verification,
        pub_sub_dir_rel=f"submissions/{submission_id}",
        dry_run=dry_run,
    )

    print(f"\n  {'[DRY RUN] Would publish' if dry_run else 'Published'}: {submission_id} ({status})")
    if not dry_run:
        print(f"  Artifacts: {pub_sub_dir}")
        print(f"  Leaderboard: {leaderboard_path}")
    return 0


# ─── Artifact builders ────────────────────────────────────────────────────────

def _build_summary_json(
    meta: SubmissionMetadata,
    preset_metrics: Dict[str, Any],
    verification: Optional[Dict[str, Any]],
    status: str,
) -> Dict[str, Any]:
    return {
        "submission_id": meta.submission_id,
        "agent_id": meta.agent_id,
        "submission_name": meta.submission_name,
        "team_name": meta.team_name,
        "benchmark_version": meta.benchmark_version,
        "algorithm_family": meta.algorithm_family,
        "observation_type": meta.observation_type,
        "status": status,
        "published_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "verified_at": (
            verification.get("evaluated_at") if verification else None
        ),
        "repo_url": meta.repo_url,
        "paper_url": meta.paper_url,
        "license": meta.license,
        "preset_metrics": preset_metrics,
    }


def _build_per_condition_json(
    meta: SubmissionMetadata,
    preset_metrics: Dict[str, Any],
) -> Dict[str, Any]:
    conditions = []
    for preset, metrics in preset_metrics.items():
        conditions.append({
            "preset": preset,
            "agent_id": meta.agent_id,
            "submission_id": meta.submission_id,
            **metrics,
        })
    return {
        "submission_id": meta.submission_id,
        "agent_id": meta.agent_id,
        "benchmark_version": meta.benchmark_version,
        "conditions": conditions,
    }


# ─── Leaderboard updater ──────────────────────────────────────────────────────

def _update_leaderboard(
    leaderboard_path: Path,
    meta: SubmissionMetadata,
    status: str,
    preset_metrics: Dict[str, Any],
    verification: Optional[Dict[str, Any]],
    pub_sub_dir_rel: str,
    dry_run: bool,
) -> None:
    # Load existing manifest or create a new one
    if leaderboard_path.exists():
        try:
            raw = json.loads(leaderboard_path.read_text(encoding="utf-8"))
            manifest = LeaderboardManifest.model_validate(raw)
        except Exception as exc:
            print(f"  [WRN] Could not parse existing leaderboard.json: {exc}. Will recreate.")
            manifest = _empty_manifest()
    else:
        manifest = _empty_manifest()
        ensure_dir(leaderboard_path.parent)

    now_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    verified_at = (
        verification.get("evaluated_at", now_date)[:10]
        if verification else None
    )

    new_entry = LeaderboardEntry(
        submission_id=meta.submission_id,
        display_name=meta.submission_name,
        agent_id=meta.agent_id,
        team_name=meta.team_name,
        status=status,  # type: ignore[arg-type]
        benchmark_version=meta.benchmark_version,
        algorithm_family=meta.algorithm_family,
        observation_type=meta.observation_type,
        summary_path=f"{pub_sub_dir_rel}/summary.json",
        replay_path=f"{pub_sub_dir_rel}/replays/",
        metadata_path=f"{pub_sub_dir_rel}/metadata.json",
        date_submitted=now_date,
        date_verified=verified_at if status == "verified" else None,
        clear_success_rate=_extract_metric(preset_metrics, "clear", "success_rate"),
        heavy_success_rate=_extract_metric(preset_metrics, "heavy", "success_rate"),
        repo_url=meta.repo_url,
        paper_url=meta.paper_url,
    )

    # Replace existing entry with same submission_id, or prepend
    entries = [e for e in manifest.entries if e.submission_id != meta.submission_id]
    entries.insert(0, new_entry)  # newest first
    manifest = LeaderboardManifest(
        manifest_version="1.0",
        benchmark_version="1.0.0",
        last_updated=now_date,
        entries=entries,
    )

    if dry_run:
        print(f"  [DRY RUN] Would write leaderboard: {leaderboard_path}")
        print(f"    {len(manifest.entries)} entries total")
    else:
        leaderboard_path.write_text(
            json.dumps(manifest.model_dump(), indent=2), encoding="utf-8"
        )
        print(f"  Leaderboard updated: {leaderboard_path} ({len(manifest.entries)} entries)")


def _empty_manifest() -> LeaderboardManifest:
    return LeaderboardManifest(
        manifest_version="1.0",
        benchmark_version="1.0.0",
        last_updated=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        entries=[],
    )


def _extract_metric(
    preset_metrics: Dict[str, Any], preset: str, key: str
) -> Optional[float]:
    pm = preset_metrics.get(preset, {})
    val = pm.get(key)
    return float(val) if val is not None else None


# ─── File I/O helpers ──────────────────────────────────────────────────────────

def _find_replay_source(
    evaluation_dir: Optional[Path],
    bundle,
) -> Optional[Path]:
    """Return the best available replay source directory."""
    if evaluation_dir:
        # Look for replays in the first available preset subdirectory
        for candidate in evaluation_dir.iterdir():
            if candidate.is_dir():
                replay_dir = candidate / "replays"
                if replay_dir.exists() and any(replay_dir.rglob("*.jsonl")):
                    return evaluation_dir  # return root; copy_replays handles structure
        # Evaluation ran but no .jsonl files yet
        return evaluation_dir if evaluation_dir.exists() else None

    # Fall back to submitted artifacts
    submitted_replays = bundle.artifacts_dir / "replays"
    if submitted_replays.exists():
        return submitted_replays.parent  # artifacts dir
    return None


def _copy_replays(src_root: Path, dst_dir: Path, dry_run: bool) -> None:
    """Copy all .jsonl replay files from src_root into dst_dir, preserving preset subdirs."""
    jsonl_files = list(src_root.rglob("*.jsonl"))
    if not jsonl_files:
        print("  [WRN] No .jsonl replay files found in evaluation output")
        if not dry_run:
            ensure_dir(dst_dir)
        return

    for src in jsonl_files:
        # Preserve relative path so clear/ and heavy/ subdirs are maintained
        rel = src.relative_to(src_root)
        dst = dst_dir / rel
        if dry_run:
            print(f"  [DRY RUN] Would copy replay: {rel}")
        else:
            ensure_dir(dst.parent)
            shutil.copy2(src, dst)
            print(f"  Copied replay: {rel}")


def _copy_file(src: Path, dst: Path, dry_run: bool, label: str) -> None:
    if not src.exists():
        print(f"  [WRN] Source not found, skipping: {src.name}")
        return
    if dry_run:
        print(f"  [DRY RUN] Would copy {label}: {src} → {dst}")
    else:
        shutil.copy2(src, dst)
        print(f"  Copied {label}: {dst.name}")


def _write_json_file(
    path: Path, data: Dict[str, Any], dry_run: bool, label: str
) -> None:
    if dry_run:
        print(f"  [DRY RUN] Would write {label}")
    else:
        ensure_dir(path.parent)
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"  Wrote {label}: {path.name}")


def _check_manifest_consistency(
    verification: Dict[str, Any], meta: SubmissionMetadata
) -> None:
    v_sid = verification.get("submission_id")
    if v_sid and v_sid != meta.submission_id:
        raise ValueError(
            f"verification_manifest.json submission_id={v_sid!r} does not match "
            f"metadata.json submission_id={meta.submission_id!r}"
        )


if __name__ == "__main__":
    sys.exit(main())
