#!/usr/bin/env python3
"""
validate_submission_bundle.py — Validate a complete submission bundle directory.

Checks that all required files are present, metadata is valid, and artifacts
have the correct structure.  Does NOT re-run the benchmark.

Usage:
    python python/benchmark/scripts/validate_submission_bundle.py \\
        submissions/TEMPLATE/

    python python/benchmark/scripts/validate_submission_bundle.py \\
        submissions/my-agent-v1/

Exit codes:
    0  — all checks passed (warnings may still be printed)
    1  — one or more required checks failed
    2  — usage error
"""

from __future__ import annotations

import csv
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path


# ─── Result tracking ──────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    name: str
    passed: bool
    message: str = ""
    warning: bool = False


def _pass(name: str, msg: str = "") -> CheckResult:
    return CheckResult(name=name, passed=True, message=msg)


def _fail(name: str, msg: str) -> CheckResult:
    return CheckResult(name=name, passed=False, message=msg)


def _warn(name: str, msg: str) -> CheckResult:
    return CheckResult(name=name, passed=True, message=msg, warning=True)


# ─── Individual checks ────────────────────────────────────────────────────────

def check_required_files(bundle: Path) -> list[CheckResult]:
    required = [
        "metadata.json",
        "README.md",
        "adapter.py",
        "requirements.txt",
        "artifacts/aggregate_summary.json",
        "artifacts/per_episode.csv",
    ]
    results = []
    for rel in required:
        p = bundle / rel
        if p.exists():
            results.append(_pass(f"file:{rel}"))
        else:
            results.append(_fail(f"file:{rel}", f"Required file missing: {p}"))
    return results


def check_replays(bundle: Path) -> list[CheckResult]:
    results = []
    for preset in ("clear", "heavy"):
        replay_dir = bundle / "artifacts" / "replays" / preset
        if not replay_dir.exists():
            results.append(_fail(
                f"replays:{preset}",
                f"Missing replay directory: artifacts/replays/{preset}/",
            ))
            continue
        jsonl_files = list(replay_dir.glob("*.jsonl"))
        if not jsonl_files:
            results.append(_warn(
                f"replays:{preset}",
                f"No .jsonl replay files found in artifacts/replays/{preset}/",
            ))
        else:
            results.append(_pass(
                f"replays:{preset}",
                f"{len(jsonl_files)} replay(s) found",
            ))
    return results


def check_metadata(bundle: Path) -> list[CheckResult]:
    meta_path = bundle / "metadata.json"
    if not meta_path.exists():
        return [_fail("metadata:exists", "metadata.json not found")]

    # JSON parse
    try:
        raw = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [_fail("metadata:json", f"Invalid JSON: {exc}")]

    results = [_pass("metadata:json")]

    # Schema validation
    try:
        from abyssal_benchmark.schemas.submission_metadata import SubmissionMetadata
        meta = SubmissionMetadata.model_validate(raw)
        results.append(_pass("metadata:schema"))

        # Warn if status is not provisional
        if meta.submission_status != "provisional":
            results.append(_warn(
                "metadata:status",
                f"submission_status is '{meta.submission_status}' — "
                "new submissions should use 'provisional'",
            ))
        else:
            results.append(_pass("metadata:status"))

        # Check benchmark_version
        results.append(_pass("metadata:benchmark_version",
                             f"benchmark_version = {meta.benchmark_version}"))

        return results

    except ImportError:
        results.append(_warn(
            "metadata:schema",
            "abyssal_benchmark not importable — schema validation skipped. "
            "Run: pip install -e python/benchmark && export PYTHONPATH=$PWD/python/benchmark/src",
        ))
        # Minimal field presence check
        required_keys = [
            "submission_name", "submission_id", "agent_id",
            "team_name", "author_name", "contact",
            "repo_url", "commit_hash",
            "benchmark_version", "algorithm_family", "observation_type",
            "training_notes", "license", "submission_status",
        ]
        for key in required_keys:
            if key in raw:
                results.append(_pass(f"metadata:field:{key}"))
            else:
                results.append(_fail(f"metadata:field:{key}",
                                     f"Required field missing: '{key}'"))
        return results

    except Exception as exc:
        results.append(_fail("metadata:schema", f"Schema validation failed: {exc}"))
        return results


def check_aggregate_summary(bundle: Path) -> list[CheckResult]:
    summary_path = bundle / "artifacts" / "aggregate_summary.json"
    if not summary_path.exists():
        return [_fail("summary:exists", "artifacts/aggregate_summary.json not found")]

    try:
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [_fail("summary:json", f"Invalid JSON: {exc}")]

    results = [_pass("summary:json")]

    required_keys = ["submission_id", "benchmark_version", "agent_id", "presets"]
    for key in required_keys:
        if key in summary:
            results.append(_pass(f"summary:field:{key}"))
        else:
            results.append(_fail(f"summary:field:{key}",
                                 f"Required field missing from aggregate_summary.json: '{key}'"))
    return results


def check_per_episode_csv(bundle: Path) -> list[CheckResult]:
    csv_path = bundle / "artifacts" / "per_episode.csv"
    if not csv_path.exists():
        return [_fail("per_episode:exists", "artifacts/per_episode.csv not found")]

    required_columns = {
        "episode", "preset", "world_seed", "episode_seed",
        "success", "collision", "timeout",
        "total_reward", "steps", "final_dist",
    }
    try:
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            headers = set(reader.fieldnames or [])
    except Exception as exc:
        return [_fail("per_episode:parse", f"Could not read CSV: {exc}")]

    missing = required_columns - headers
    if missing:
        return [_fail("per_episode:columns",
                      f"Missing columns: {', '.join(sorted(missing))}")]
    return [_pass("per_episode:columns", f"{len(headers)} columns present")]


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: validate_submission_bundle.py <path/to/submission/>")
        return 2

    bundle = Path(argv[1])
    if not bundle.is_dir():
        print(f"ERROR: not a directory: {bundle}")
        return 1

    print(f"Validating submission bundle: {bundle.resolve()}")
    print()

    all_results: list[CheckResult] = []
    all_results += check_required_files(bundle)
    all_results += check_replays(bundle)
    all_results += check_metadata(bundle)
    all_results += check_aggregate_summary(bundle)
    all_results += check_per_episode_csv(bundle)

    # ── Print results ──────────────────────────────────────────────────────────
    passed  = [r for r in all_results if r.passed and not r.warning]
    warnings = [r for r in all_results if r.passed and r.warning]
    failed  = [r for r in all_results if not r.passed]

    for r in all_results:
        icon = "OK " if (r.passed and not r.warning) else ("WRN" if r.warning else "ERR")
        msg  = f"  {r.message}" if r.message else ""
        print(f"  [{icon}] {r.name}{msg}")

    print()
    print(f"Results: {len(passed)} passed, {len(warnings)} warnings, {len(failed)} failed")

    if failed:
        print()
        print("FAIL — fix the errors above before submitting.")
        return 1

    if warnings:
        print()
        print("PASS (with warnings) — review warnings before submitting.")
    else:
        print()
        print("PASS — bundle looks valid. Run the benchmark to generate artifacts,")
        print("then open a pull request following the contribution guidelines.")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
