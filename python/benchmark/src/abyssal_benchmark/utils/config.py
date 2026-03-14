"""
Run configuration helpers — Phase 3

Manages the run directory layout:

    results/runs/<run-name>/
    ├── config.json
    ├── model.zip
    ├── train_summary.json
    ├── eval_summary.json
    ├── summary.csv
    └── replays/
        └── replay_seed_<N>.jsonl

All paths are resolved relative to the repository root unless an explicit
output_dir is provided.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .io import ensure_dir, get_git_commit

# ─── Repo root ────────────────────────────────────────────────────────────────

# This file lives at:
#   python/benchmark/src/abyssal_benchmark/utils/config.py
# Walk up 5 levels (parents[5]) to reach the repo root.
_THIS_FILE = Path(__file__).resolve()
_REPO_ROOT = _THIS_FILE.parents[5]

DEFAULT_RESULTS_DIR = _REPO_ROOT / "results" / "runs"


# ─── Run directory ────────────────────────────────────────────────────────────

class RunDir:
    """
    Encapsulates the directory layout for a single training / eval run.

    Usage::

        run = RunDir.create("ppo-seed42", output_dir=Path("results/runs"))
        run.save_config({"world_seed": 42, ...})
        # … training …
        run.save_json("train_summary.json", {"timesteps": 50000, ...})
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self.replays_dir = path / "replays"

    # ── Factories ─────────────────────────────────────────────────────────────

    @classmethod
    def create(
        cls,
        run_name: str,
        output_dir: Optional[Path] = None,
    ) -> "RunDir":
        """
        Create (or reuse) a run directory named *run_name* under *output_dir*.

        Args:
            run_name:   Kebab-case identifier, e.g. ``"ppo-seed42"``.
            output_dir: Parent directory.  Defaults to
                        ``<repo_root>/results/runs``.
        """
        base = output_dir or DEFAULT_RESULTS_DIR
        run_path = base / run_name
        ensure_dir(run_path)
        ensure_dir(run_path / "replays")
        return cls(run_path)

    @classmethod
    def open(cls, path: Path) -> "RunDir":
        """Open an existing run directory (does not create it)."""
        if not path.is_dir():
            raise FileNotFoundError(f"Run directory not found: {path}")
        return cls(path)

    # ── Path helpers ──────────────────────────────────────────────────────────

    def model_path(self) -> Path:
        return self.path / "model.zip"

    def config_path(self) -> Path:
        return self.path / "config.json"

    def train_summary_path(self) -> Path:
        return self.path / "train_summary.json"

    def eval_summary_path(self) -> Path:
        return self.path / "eval_summary.json"

    def summary_csv_path(self) -> Path:
        return self.path / "summary.csv"

    def replay_path(self, seed: int) -> Path:
        return self.replays_dir / f"replay_seed_{seed}.jsonl"

    # ── I/O helpers ───────────────────────────────────────────────────────────

    def save_json(self, filename: str, data: Dict[str, Any]) -> Path:
        """Serialise *data* to ``<run_dir>/<filename>`` with indentation."""
        dest = self.path / filename
        dest.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return dest

    def load_json(self, filename: str) -> Dict[str, Any]:
        """Load and parse ``<run_dir>/<filename>``."""
        src = self.path / filename
        return json.loads(src.read_text(encoding="utf-8"))

    def save_config(self, cfg: Dict[str, Any]) -> Path:
        """
        Save a run config dict, automatically injecting metadata.

        Adds ``recorded_at`` (ISO-8601 UTC) and ``git_commit`` if not
        already present.
        """
        enriched: Dict[str, Any] = dict(cfg)
        enriched.setdefault(
            "recorded_at",
            datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        enriched.setdefault("git_commit", get_git_commit())
        return self.save_json("config.json", enriched)

    def __repr__(self) -> str:
        return f"RunDir({self.path})"
