#!/usr/bin/env python3
"""
check_submission_adapter.py — Load and sanity-check an external submission adapter.

Verifies that the adapter module loads cleanly, the adapter class exists,
the required interface methods are present, the adapter can be instantiated,
and ``predict()`` returns a valid action shape when called with a dummy observation.

Usage:
    python python/benchmark/scripts/check_submission_adapter.py \\
        submissions/example_heuristic

Exit codes:
    0  — all checks passed
    1  — one or more checks failed
    2  — usage error
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running from the repo root without installing the package
_THIS_FILE = Path(__file__).resolve()
_SRC = _THIS_FILE.parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import numpy as np

from abyssal_benchmark.utils.submission_loader import (
    SubmissionBundle,
    SubmissionLoadError,
    load_submission,
)

# Expected action space dimensions
_ACTION_DIM = 2
_OBS_DIM_STANDARD = 38
_OBS_DIM_UNCERTAINTY = 41


# ─── Checks ───────────────────────────────────────────────────────────────────

def _section(title: str) -> None:
    print(f"\n── {title} {'─' * (54 - len(title))}")


def _ok(msg: str) -> None:
    print(f"  [OK ] {msg}")


def _fail(msg: str) -> None:
    print(f"  [ERR] {msg}")


def _warn(msg: str) -> None:
    print(f"  [WRN] {msg}")


def run_checks(submission_dir: Path) -> bool:
    """
    Run all adapter compatibility checks.

    Returns True if all required checks pass, False otherwise.
    """
    all_passed = True

    # ── 1. Load submission bundle ──────────────────────────────────────────
    _section("Loading submission bundle")
    try:
        bundle = load_submission(submission_dir)
        _ok(f"Bundle loaded: {bundle.metadata.submission_id}")
        _ok(f"Benchmark version: {bundle.metadata.benchmark_version}")
        _ok(f"Algorithm family: {bundle.metadata.algorithm_family}")
        _ok(f"Observation type: {bundle.metadata.observation_type}")
    except SubmissionLoadError as exc:
        _fail(f"Bundle load failed: {exc}")
        return False

    # ── 2. Import adapter module ───────────────────────────────────────────
    _section("Importing adapter module")
    try:
        bundle.load_adapter_module()
        _ok(f"Module imported: {bundle.adapter_path.name}")
    except SubmissionLoadError as exc:
        _fail(f"Import failed: {exc}")
        return False
    except Exception as exc:
        _fail(f"Unexpected import error: {exc}")
        return False

    # ── 3. Discover adapter class ──────────────────────────────────────────
    _section("Discovering adapter class")
    try:
        cls = bundle.adapter_class()
        _ok(f"Adapter class: {cls.__name__}")
    except SubmissionLoadError as exc:
        _fail(str(exc))
        return False

    # ── 4. Check required methods ──────────────────────────────────────────
    _section("Checking required methods")
    required_methods = ["get_policy_id", "predict", "reset"]
    for method_name in required_methods:
        if hasattr(cls, method_name) and callable(getattr(cls, method_name)):
            _ok(f"Method present: {method_name}()")
        else:
            _fail(f"Method missing: {method_name}() — required by BenchmarkAgent contract")
            all_passed = False

    # load() is strongly recommended
    if hasattr(cls, "load") and callable(getattr(cls, "load")):
        _ok("Method present: load()")
    else:
        _warn(
            "Method missing: load() — recommended for agents with model weights. "
            "No-op default will be used."
        )

    # requires_uncertainty_obs property
    if hasattr(cls, "requires_uncertainty_obs"):
        _ok("Property present: requires_uncertainty_obs")
    else:
        _warn("Property missing: requires_uncertainty_obs — defaulting to False (standard obs)")

    if not all_passed:
        return False

    # ── 5. Instantiate the adapter ─────────────────────────────────────────
    _section("Instantiating adapter")
    try:
        agent = bundle.instantiate_adapter()
        _ok(f"Instantiated: {cls.__name__}()")
    except SubmissionLoadError as exc:
        _fail(f"Instantiation failed: {exc}")
        return False
    except Exception as exc:
        _fail(f"Unexpected instantiation error: {exc}")
        return False

    # ── 6. Check get_policy_id() ───────────────────────────────────────────
    _section("Checking get_policy_id()")
    try:
        policy_id = agent.get_policy_id()
        if not isinstance(policy_id, str) or not policy_id:
            _fail(f"get_policy_id() returned invalid value: {policy_id!r}")
            all_passed = False
        elif policy_id != bundle.metadata.agent_id:
            _warn(
                f"get_policy_id() = {policy_id!r} does not match "
                f"metadata.agent_id = {bundle.metadata.agent_id!r}. "
                "These must match for replay headers to be consistent."
            )
            _ok(f"get_policy_id() returned: {policy_id!r}")
        else:
            _ok(f"get_policy_id() = {policy_id!r}  (matches metadata.agent_id)")
    except Exception as exc:
        _fail(f"get_policy_id() raised: {exc}")
        all_passed = False

    # ── 7. Call load() ─────────────────────────────────────────────────────
    _section("Calling load(model_dir)")
    try:
        if hasattr(agent, "load"):
            agent.load(bundle.model_dir)
            _ok(f"load({bundle.model_dir.name}/) completed without error")
        else:
            _warn("No load() method — skipping (no-op assumed)")
    except Exception as exc:
        _fail(f"load() raised an exception: {exc}")
        all_passed = False

    # ── 8. Call reset() ────────────────────────────────────────────────────
    _section("Calling reset()")
    try:
        agent.reset()
        _ok("reset() completed without error")
    except Exception as exc:
        _fail(f"reset() raised: {exc}")
        all_passed = False

    # ── 9. Call predict() with dummy observation ───────────────────────────
    _section("Calling predict() with dummy observation")
    requires_uncertainty = bool(getattr(agent, "requires_uncertainty_obs", False))
    obs_dim = _OBS_DIM_UNCERTAINTY if requires_uncertainty else _OBS_DIM_STANDARD
    obs_type = "uncertainty (41-dim)" if requires_uncertainty else "standard (38-dim)"
    _ok(f"Using {obs_type} observation")

    dummy_obs = np.zeros(obs_dim, dtype=np.float32)
    dummy_obs[4] = 1.0   # goal direction dx = 1.0 (goal is to the right)
    dummy_obs[6] = 0.5   # distance to goal = 0.5 (normalised)

    try:
        action = agent.predict(dummy_obs, deterministic=True)
        action = np.asarray(action)
        _ok(f"predict() returned shape {action.shape}, dtype {action.dtype}")

        if action.shape != (_ACTION_DIM,):
            _fail(
                f"predict() returned shape {action.shape}, expected ({_ACTION_DIM},). "
                "Actions must be 1-D arrays of length 2."
            )
            all_passed = False
        else:
            _ok("Action shape is correct: (2,)")

        if np.any(np.isnan(action)) or np.any(np.isinf(action)):
            _fail("predict() returned NaN or Inf — undefined behaviour in evaluation")
            all_passed = False
        else:
            _ok("Action values are finite")

        clipped = np.clip(action, -1.0, 1.0)
        if not np.allclose(action, clipped):
            _warn(
                f"predict() returned values outside [-1, 1]: {action}. "
                "The harness will clip these automatically, but check your output range."
            )
        else:
            _ok(f"Action values in [-1, 1]: {action}")

    except Exception as exc:
        _fail(f"predict() raised: {exc}")
        all_passed = False

    # ── Summary ───────────────────────────────────────────────────────────
    print()
    if all_passed:
        print("PASS — adapter is compatible with the benchmark harness.")
        print(f"       Ready for: evaluate_submission.py --submission-dir {submission_dir}")
    else:
        print("FAIL — fix the errors above before submitting.")

    return all_passed


# ─── Main ─────────────────────────────────────────────────────────────────────

def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: check_submission_adapter.py <submission-dir>")
        return 2

    submission_dir = Path(argv[1])
    passed = run_checks(submission_dir)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
