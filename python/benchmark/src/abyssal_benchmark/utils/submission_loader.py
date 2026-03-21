"""
utils/submission_loader.py — Load and inspect external submission bundles (Phase B)

Handles dynamic import of community adapter.py files and provides a
structured view of a submission directory.

Design
──────
- Adapters are loaded via ``importlib.util`` from an explicit file path.
  This is intentionally local and does not touch sys.path globally.
- The loader verifies structural requirements (files present, metadata
  valid, adapter class findable) without executing the full evaluation.
- All exceptions include the submission path and a human-readable hint.

Usage::

    from abyssal_benchmark.utils.submission_loader import SubmissionBundle, load_submission

    bundle = load_submission(Path("submissions/example_heuristic"))
    print(bundle.metadata.submission_id)
    agent = bundle.instantiate_adapter()
    agent.load(bundle.model_dir)
"""

from __future__ import annotations

import importlib.util
import inspect
import sys
import types
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Type

from abyssal_benchmark.schemas.submission_metadata import (
    SubmissionMetadata,
    validate_submission_metadata,
)


# ─── Supported benchmark versions ─────────────────────────────────────────────

SUPPORTED_VERSIONS = {"1.0.0"}

# ─── Adapter discovery ────────────────────────────────────────────────────────

# Canonical class names we search for inside adapter.py, in order.
# The first matching class is used.
_CANDIDATE_CLASS_NAMES = [
    "Adapter",
    "Agent",
    "SubmissionAgent",
]


class SubmissionLoadError(Exception):
    """Raised when a submission bundle cannot be loaded or is invalid."""


# ─── Bundle representation ────────────────────────────────────────────────────

@dataclass
class SubmissionBundle:
    """
    Parsed view of a submission directory.

    Attributes
    ----------
    submission_dir : Path
        Absolute path to the submission root.
    metadata : SubmissionMetadata
        Validated submission metadata.
    adapter_path : Path
        Absolute path to ``adapter.py``.
    model_dir : Path
        Absolute path to the ``model/`` directory (may not exist for heuristics).
    artifacts_dir : Path
        Absolute path to the ``artifacts/`` directory.
    _adapter_module : types.ModuleType or None
        Loaded adapter module (set after ``load_adapter_module()``).
    _adapter_class : type or None
        Discovered adapter class inside the module.
    """

    submission_dir: Path
    metadata: SubmissionMetadata
    adapter_path: Path
    model_dir: Path
    artifacts_dir: Path
    _adapter_module: Optional[types.ModuleType] = None
    _adapter_class: Optional[Type] = None

    # ── Adapter module loading ─────────────────────────────────────────────────

    def load_adapter_module(self) -> types.ModuleType:
        """
        Import ``adapter.py`` as an isolated module.

        Returns the loaded module.  Caches the result.

        Raises
        ------
        SubmissionLoadError
            If the module cannot be imported or no adapter class is found.
        """
        if self._adapter_module is not None:
            return self._adapter_module

        module_name = f"_submission_adapter_{self.metadata.submission_id}"
        spec = importlib.util.spec_from_file_location(module_name, self.adapter_path)
        if spec is None or spec.loader is None:
            raise SubmissionLoadError(
                f"Could not create module spec for {self.adapter_path}"
            )

        module = importlib.util.module_from_spec(spec)
        # Temporarily add the adapter's parent dir so relative imports work
        adapter_parent = str(self.adapter_path.parent)
        added = adapter_parent not in sys.path
        if added:
            sys.path.insert(0, adapter_parent)
        try:
            spec.loader.exec_module(module)
        except Exception as exc:
            raise SubmissionLoadError(
                f"Error importing adapter from {self.adapter_path}: {exc}"
            ) from exc
        finally:
            if added and adapter_parent in sys.path:
                sys.path.remove(adapter_parent)

        self._adapter_module = module
        self._adapter_class = _find_adapter_class(module, self.adapter_path)
        return module

    def adapter_class(self) -> Type:
        """
        Return the adapter class from the loaded module.

        Calls ``load_adapter_module()`` if not already loaded.
        """
        if self._adapter_class is None:
            self.load_adapter_module()
        if self._adapter_class is None:
            raise SubmissionLoadError(
                f"No adapter class found in {self.adapter_path}. "
                "Define a class named Adapter, Agent, or SubmissionAgent, "
                "or inherit from BenchmarkAgent."
            )
        return self._adapter_class

    def instantiate_adapter(self) -> Any:
        """
        Instantiate the adapter class with no constructor arguments.

        Returns the agent instance (does NOT call ``load()`` yet).
        """
        cls = self.adapter_class()
        try:
            return cls()
        except Exception as exc:
            raise SubmissionLoadError(
                f"Failed to instantiate adapter class {cls.__name__}: {exc}"
            ) from exc


# ─── Loader ───────────────────────────────────────────────────────────────────

def load_submission(submission_dir: Path) -> SubmissionBundle:
    """
    Load and validate a submission bundle directory.

    Validates:
    - directory exists
    - ``metadata.json`` present and schema-valid
    - benchmark version supported
    - ``adapter.py`` present
    - ``requirements.txt`` present
    - ``README.md`` present

    Does NOT load the adapter module (call ``bundle.load_adapter_module()``
    separately when ready to import external code).

    Args:
        submission_dir: Path to the submission root directory.

    Returns:
        A :class:`SubmissionBundle` with validated metadata.

    Raises:
        SubmissionLoadError: if any structural check fails.
    """
    submission_dir = submission_dir.resolve()

    if not submission_dir.is_dir():
        raise SubmissionLoadError(f"Submission directory not found: {submission_dir}")

    # ── metadata.json ─────────────────────────────────────────────────────────
    meta_path = submission_dir / "metadata.json"
    if not meta_path.exists():
        raise SubmissionLoadError(f"metadata.json missing in {submission_dir}")

    try:
        metadata = validate_submission_metadata(meta_path)
    except FileNotFoundError:
        raise SubmissionLoadError(f"metadata.json not found: {meta_path}")
    except Exception as exc:
        raise SubmissionLoadError(
            f"metadata.json failed schema validation: {exc}"
        ) from exc

    # ── Version check ─────────────────────────────────────────────────────────
    if metadata.benchmark_version not in SUPPORTED_VERSIONS:
        raise SubmissionLoadError(
            f"benchmark_version '{metadata.benchmark_version}' is not supported. "
            f"Supported: {sorted(SUPPORTED_VERSIONS)}"
        )

    # ── Required files ────────────────────────────────────────────────────────
    adapter_path = submission_dir / "adapter.py"
    if not adapter_path.exists():
        raise SubmissionLoadError(f"adapter.py missing in {submission_dir}")

    for fname in ("README.md", "requirements.txt"):
        if not (submission_dir / fname).exists():
            raise SubmissionLoadError(f"{fname} missing in {submission_dir}")

    return SubmissionBundle(
        submission_dir=submission_dir,
        metadata=metadata,
        adapter_path=adapter_path,
        model_dir=submission_dir / "model",
        artifacts_dir=submission_dir / "artifacts",
    )


# ─── Class discovery ──────────────────────────────────────────────────────────

def _find_adapter_class(module: types.ModuleType, path: Path) -> Type:
    """
    Find the adapter class inside a loaded module.

    Search order:
    1. Classes explicitly named Adapter, Agent, or SubmissionAgent.
    2. Classes that are subclasses of BenchmarkAgent (if importable).
    3. Any class that has both ``get_policy_id`` and ``predict`` methods.

    Returns the first match.

    Raises
    ------
    SubmissionLoadError
        If no suitable class is found.
    """
    # Try canonical names first
    for name in _CANDIDATE_CLASS_NAMES:
        cls = getattr(module, name, None)
        if cls is not None and inspect.isclass(cls):
            return cls

    # Try BenchmarkAgent subclasses
    try:
        from abyssal_benchmark.agents.base import BenchmarkAgent
        for _name, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, BenchmarkAgent) and obj is not BenchmarkAgent:
                return obj
    except ImportError:
        pass

    # Duck-type: any class with the required methods
    for _name, obj in inspect.getmembers(module, inspect.isclass):
        if (
            hasattr(obj, "get_policy_id")
            and hasattr(obj, "predict")
            and obj.__module__ == module.__name__
        ):
            return obj

    raise SubmissionLoadError(
        f"No adapter class found in {path}. "
        "Name your class Adapter, Agent, or SubmissionAgent, "
        "or inherit from abyssal_benchmark.agents.base.BenchmarkAgent."
    )
