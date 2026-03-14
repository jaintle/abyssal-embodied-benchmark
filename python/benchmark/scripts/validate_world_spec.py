#!/usr/bin/env python3
"""
validate_world_spec.py — Phase 0 validation CLI

Usage:
    python validate_world_spec.py path/to/world_spec.json

Exit codes:
    0  — validation passed
    1  — validation failed (schema error or file error)
    2  — usage error (wrong number of arguments)

Output:
    On success:  prints "✓ world_spec.json is valid." + summary line
    On failure:  prints "✗ Validation failed." + structured error listing
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Resolve src package on sys.path regardless of install state
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent
_SRC = _HERE.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from abyssal_benchmark.schemas.world_spec import validate_world_spec  # noqa: E402


def _usage() -> None:
    print(
        "Usage: python validate_world_spec.py path/to/world_spec.json",
        file=sys.stderr,
    )


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        _usage()
        return 2

    json_path = Path(argv[1])

    # ── Load ──────────────────────────────────────────────────────────────
    if not json_path.exists():
        print(f"✗ File not found: {json_path}", file=sys.stderr)
        return 1

    try:
        raw = json_path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"✗ Could not read file: {exc}", file=sys.stderr)
        return 1

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"✗ Invalid JSON: {exc}", file=sys.stderr)
        return 1

    if not isinstance(data, dict):
        print("✗ Top-level JSON value must be an object.", file=sys.stderr)
        return 1

    # ── Validate ──────────────────────────────────────────────────────────
    try:
        from pydantic import ValidationError
    except ImportError:
        print(
            "✗ pydantic is not installed. Run: pip install pydantic",
            file=sys.stderr,
        )
        return 1

    try:
        spec = validate_world_spec(data)
    except ValidationError as exc:
        print("✗ Validation failed.\n", file=sys.stderr)
        for error in exc.errors():
            loc = " → ".join(str(p) for p in error["loc"])
            msg = error["msg"]
            print(f"  [{loc}]  {msg}", file=sys.stderr)
        return 1

    # ── Success ───────────────────────────────────────────────────────────
    print(f"✓ {json_path.name} is valid.")
    print(
        f"  benchmarkVersion : {spec.benchmarkVersion}\n"
        f"  worldSeed        : {spec.worldSeed}\n"
        f"  worldRadius      : {spec.worldRadius} m\n"
        f"  obstacles        : {spec.obstacles.count} "
        f"(seed={spec.obstacles.obstacleSeed})\n"
        f"  goalPosition     : {spec.goal.position}\n"
        f"  degradation      : {spec.degradation.preset}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
