#!/usr/bin/env python3
"""
validate_submission_metadata.py — Validate a submission metadata.json file.

Usage:
    python python/benchmark/scripts/validate_submission_metadata.py \\
        submissions/TEMPLATE/metadata.json

Exit codes:
    0  — validation passed
    1  — file not found, JSON parse error, or schema validation failure
    2  — usage error (wrong number of arguments)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: validate_submission_metadata.py <path/to/metadata.json>")
        return 2

    path = Path(argv[1])

    # ── File existence ─────────────────────────────────────────────────────────
    if not path.exists():
        print(f"ERROR: file not found: {path}")
        return 1

    # ── JSON parse ─────────────────────────────────────────────────────────────
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid JSON in {path}")
        print(f"  {exc}")
        return 1

    # ── Schema validation ──────────────────────────────────────────────────────
    try:
        from abyssal_benchmark.schemas.submission_metadata import SubmissionMetadata
        from pydantic import ValidationError
    except ImportError as exc:
        print("ERROR: could not import abyssal_benchmark schemas.")
        print("  Make sure PYTHONPATH includes python/benchmark/src and that")
        print("  dependencies are installed (pip install -e python/benchmark).")
        print(f"  {exc}")
        return 1

    try:
        meta = SubmissionMetadata.model_validate(raw)
    except Exception as exc:  # pydantic.ValidationError
        print(f"FAIL: {path}")
        print()
        print("Schema validation errors:")
        # Pydantic ValidationError has a clean multi-line representation
        try:
            from pydantic import ValidationError
            if isinstance(exc, ValidationError):
                for error in exc.errors():
                    field = " → ".join(str(loc) for loc in error["loc"]) or "<root>"
                    msg   = error["msg"]
                    print(f"  {field}: {msg}")
            else:
                print(f"  {exc}")
        except Exception:
            print(f"  {exc}")
        return 1

    # ── Print summary ──────────────────────────────────────────────────────────
    print(f"OK: {path}")
    print()
    print(f"  submission_id  : {meta.submission_id}")
    print(f"  agent_id       : {meta.agent_id}")
    print(f"  submission_name: {meta.submission_name}")
    print(f"  team_name      : {meta.team_name}")
    print(f"  benchmark_ver  : {meta.benchmark_version}")
    print(f"  algorithm      : {meta.algorithm_family}")
    print(f"  obs_type       : {meta.observation_type}")
    print(f"  status         : {meta.submission_status}")
    print(f"  license        : {meta.license}")
    print()

    if meta.submission_status != "provisional":
        print(f"WARNING: submission_status is '{meta.submission_status}'.")
        print("  New submissions should set submission_status = \"provisional\".")
        print("  Only maintainers change status to 'verified' or 'rejected'.")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
