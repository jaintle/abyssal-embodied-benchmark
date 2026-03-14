"""
I/O helpers — Phase 3

Utilities for:
- Reading the current git commit hash (best-effort)
- Writing eval summary CSV rows
- Ensuring output directories exist safely
"""

from __future__ import annotations

import csv
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional


# ─── Git ──────────────────────────────────────────────────────────────────────

def get_git_commit() -> Optional[str]:
    """
    Return the current HEAD commit hash (first 12 chars) or None if unavailable.

    Never raises; returns None on any failure (not in a repo, git not installed,
    dirty tree, etc.).
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


# ─── Directory helpers ────────────────────────────────────────────────────────

def ensure_dir(path: Path) -> Path:
    """Create *path* (and parents) if it does not already exist.  Returns path."""
    path.mkdir(parents=True, exist_ok=True)
    return path


# ─── CSV ──────────────────────────────────────────────────────────────────────

def write_summary_csv(rows: List[Dict[str, Any]], path: Path) -> None:
    """
    Write a list of flat dicts to a CSV file.

    The column order is determined by the keys of the first row.
    Subsequent rows may omit keys (written as empty string) or have extra
    keys (appended to the end of the header on first occurrence).

    Args:
        rows: Non-empty list of dicts representing one row each.
        path: Destination .csv file path.  Parent must exist.

    Raises:
        ValueError: if rows is empty.
    """
    if not rows:
        raise ValueError("rows must not be empty")

    # Collect all field names in insertion order, deduplicating
    fieldnames: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for k in row:
            if k not in seen:
                fieldnames.append(k)
                seen.add(k)

    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
