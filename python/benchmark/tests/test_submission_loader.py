"""
test_submission_loader.py — Tests for Phase B submission bundle loading utilities.

Covers:
- load_submission() structural validation
- SubmissionBundle metadata access
- Adapter module loading (dynamic import)
- Adapter class discovery (canonical names, duck-typing)
- Adapter instantiation
- example_heuristic bundle end-to-end
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import numpy as np
import pytest

from abyssal_benchmark.utils.submission_loader import (
    SubmissionBundle,
    SubmissionLoadError,
    load_submission,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

_REPO_ROOT = Path(__file__).parents[4]
_EXAMPLE_HEURISTIC = _REPO_ROOT / "submissions" / "example_heuristic"


def _make_bundle_dir(tmp_path: Path, extra_files: dict | None = None) -> Path:
    """Create a minimal valid submission directory in tmp_path."""
    d = tmp_path / "my-agent-v1"
    d.mkdir()

    meta = {
        "benchmark_version": "1.0.0",
        "submission_id": "my-agent-v1",
        "submission_name": "My Agent v1",
        "agent_id": "my-agent",
        "team_name": "Test Lab",
        "author_name": "Test Author",
        "contact": "test@example.com",
        "repo_url": "https://github.com/example/test-agent",
        "commit_hash": "abc1234",
        "training_notes": "Unit test agent.",
        "license": "MIT",
        "algorithm_family": "heuristic",
        "observation_type": "standard",
        "submission_status": "provisional",
    }
    (d / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")

    adapter_code = textwrap.dedent("""\
        import numpy as np
        class Adapter:
            def get_policy_id(self): return "my-agent"
            def load(self, model_dir): pass
            def predict(self, obs, deterministic=True): return np.zeros(2, dtype=np.float32)
            def reset(self): pass
    """)
    (d / "adapter.py").write_text(adapter_code, encoding="utf-8")
    (d / "requirements.txt").write_text("numpy\n", encoding="utf-8")
    (d / "README.md").write_text("# My Agent\n", encoding="utf-8")

    if extra_files:
        for rel_path, content in extra_files.items():
            p = d / rel_path
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")

    return d


# ─── load_submission structural checks ───────────────────────────────────────

class TestLoadSubmission:

    def test_valid_bundle_loads(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        assert bundle.metadata.submission_id == "my-agent-v1"
        assert bundle.metadata.agent_id == "my-agent"
        assert bundle.submission_dir == d.resolve()

    def test_nonexistent_dir_raises(self, tmp_path):
        with pytest.raises(SubmissionLoadError, match="not found"):
            load_submission(tmp_path / "nonexistent")

    def test_missing_metadata_raises(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        (d / "metadata.json").unlink()
        with pytest.raises(SubmissionLoadError, match="metadata.json"):
            load_submission(d)

    def test_invalid_metadata_json_raises(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        (d / "metadata.json").write_text("{bad json}", encoding="utf-8")
        with pytest.raises(SubmissionLoadError):
            load_submission(d)

    def test_unsupported_benchmark_version_raises(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        meta = json.loads((d / "metadata.json").read_text())
        meta["benchmark_version"] = "0.5.0"
        (d / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
        with pytest.raises(SubmissionLoadError, match="not supported"):
            load_submission(d)

    def test_missing_adapter_raises(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        (d / "adapter.py").unlink()
        with pytest.raises(SubmissionLoadError, match="adapter.py"):
            load_submission(d)

    def test_missing_requirements_raises(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        (d / "requirements.txt").unlink()
        with pytest.raises(SubmissionLoadError, match="requirements.txt"):
            load_submission(d)

    def test_missing_readme_raises(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        (d / "README.md").unlink()
        with pytest.raises(SubmissionLoadError, match="README.md"):
            load_submission(d)

    def test_bundle_paths_are_absolute(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        assert bundle.submission_dir.is_absolute()
        assert bundle.adapter_path.is_absolute()
        assert bundle.model_dir.is_absolute()
        assert bundle.artifacts_dir.is_absolute()

    def test_model_dir_path_correct(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        assert bundle.model_dir == d.resolve() / "model"

    def test_artifacts_dir_path_correct(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        assert bundle.artifacts_dir == d.resolve() / "artifacts"


# ─── Adapter loading ──────────────────────────────────────────────────────────

class TestAdapterLoading:

    def test_load_adapter_module_returns_module(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        module = bundle.load_adapter_module()
        assert hasattr(module, "Adapter")

    def test_load_adapter_module_is_cached(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        m1 = bundle.load_adapter_module()
        m2 = bundle.load_adapter_module()
        assert m1 is m2

    def test_syntax_error_in_adapter_raises(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        (d / "adapter.py").write_text("class Broken:\n  def oops(\n", encoding="utf-8")
        bundle = load_submission(d)
        with pytest.raises(SubmissionLoadError, match="importing"):
            bundle.load_adapter_module()

    def test_adapter_class_by_canonical_name(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        bundle.load_adapter_module()
        cls = bundle.adapter_class()
        assert cls.__name__ == "Adapter"

    def test_adapter_class_by_agent_name(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        code = textwrap.dedent("""\
            import numpy as np
            class Agent:
                def get_policy_id(self): return "a"
                def predict(self, obs, deterministic=True): return np.zeros(2)
                def reset(self): pass
        """)
        (d / "adapter.py").write_text(code, encoding="utf-8")
        bundle = load_submission(d)
        bundle.load_adapter_module()
        cls = bundle.adapter_class()
        assert cls.__name__ == "Agent"

    def test_adapter_class_by_duck_typing(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        code = textwrap.dedent("""\
            import numpy as np
            class MySpecialPolicy:
                def get_policy_id(self): return "duck"
                def predict(self, obs, deterministic=True): return np.zeros(2)
                def reset(self): pass
        """)
        (d / "adapter.py").write_text(code, encoding="utf-8")
        bundle = load_submission(d)
        bundle.load_adapter_module()
        cls = bundle.adapter_class()
        assert cls.__name__ == "MySpecialPolicy"

    def test_no_adapter_class_raises(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        (d / "adapter.py").write_text("x = 1\n", encoding="utf-8")
        bundle = load_submission(d)
        with pytest.raises(SubmissionLoadError, match="No adapter class"):
            bundle.load_adapter_module()


# ─── Adapter instantiation ───────────────────────────────────────────────────

class TestAdapterInstantiation:

    def test_instantiate_returns_instance(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        bundle.load_adapter_module()
        agent = bundle.instantiate_adapter()
        assert hasattr(agent, "predict")
        assert hasattr(agent, "get_policy_id")
        assert hasattr(agent, "reset")

    def test_instantiate_without_loading_module_first(self, tmp_path):
        """instantiate_adapter() should trigger load_adapter_module() automatically."""
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        # Do NOT call load_adapter_module() explicitly
        agent = bundle.instantiate_adapter()
        assert agent is not None

    def test_constructor_exception_raises_load_error(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        code = textwrap.dedent("""\
            class Adapter:
                def __init__(self): raise RuntimeError("boom")
                def get_policy_id(self): return "x"
                def predict(self, obs, deterministic=True): pass
                def reset(self): pass
        """)
        (d / "adapter.py").write_text(code, encoding="utf-8")
        bundle = load_submission(d)
        bundle.load_adapter_module()
        with pytest.raises(SubmissionLoadError, match="instantiate"):
            bundle.instantiate_adapter()


# ─── Adapter interface ────────────────────────────────────────────────────────

class TestAdapterInterface:

    def test_predict_returns_correct_shape(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        agent = bundle.instantiate_adapter()
        obs = np.zeros(38, dtype=np.float32)
        action = agent.predict(obs, deterministic=True)
        action = np.asarray(action)
        assert action.shape == (2,)

    def test_get_policy_id_returns_string(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        agent = bundle.instantiate_adapter()
        pid = agent.get_policy_id()
        assert isinstance(pid, str)
        assert len(pid) > 0

    def test_reset_does_not_raise(self, tmp_path):
        d = _make_bundle_dir(tmp_path)
        bundle = load_submission(d)
        agent = bundle.instantiate_adapter()
        agent.reset()  # must not raise


# ─── example_heuristic bundle ────────────────────────────────────────────────

@pytest.mark.skipif(
    not _EXAMPLE_HEURISTIC.exists(),
    reason="submissions/example_heuristic not present",
)
class TestExampleHeuristicBundle:

    def test_loads_successfully(self):
        bundle = load_submission(_EXAMPLE_HEURISTIC)
        assert bundle.metadata.submission_id == "example-heuristic-v1"
        assert bundle.metadata.algorithm_family == "heuristic"

    def test_adapter_class_discoverable(self):
        bundle = load_submission(_EXAMPLE_HEURISTIC)
        bundle.load_adapter_module()
        cls = bundle.adapter_class()
        assert cls is not None

    def test_adapter_instantiates(self):
        bundle = load_submission(_EXAMPLE_HEURISTIC)
        agent = bundle.instantiate_adapter()
        assert agent is not None

    def test_adapter_predict_shape(self):
        bundle = load_submission(_EXAMPLE_HEURISTIC)
        agent = bundle.instantiate_adapter()
        agent.reset()
        obs = np.zeros(38, dtype=np.float32)
        obs[4] = 1.0  # goal direction
        obs[6] = 0.5  # distance to goal
        action = np.asarray(agent.predict(obs, deterministic=True))
        assert action.shape == (2,)
        assert np.all(np.isfinite(action))

    def test_adapter_predict_within_bounds(self):
        bundle = load_submission(_EXAMPLE_HEURISTIC)
        agent = bundle.instantiate_adapter()
        agent.reset()
        obs = np.random.default_rng(0).random(38).astype(np.float32)
        action = np.asarray(agent.predict(obs, deterministic=True))
        assert np.all(action >= -1.0) and np.all(action <= 1.0)

    def test_policy_id_matches_agent_id(self):
        bundle = load_submission(_EXAMPLE_HEURISTIC)
        agent = bundle.instantiate_adapter()
        assert agent.get_policy_id() == bundle.metadata.agent_id

    def test_load_does_not_raise(self):
        bundle = load_submission(_EXAMPLE_HEURISTIC)
        agent = bundle.instantiate_adapter()
        agent.load(bundle.model_dir)  # model_dir may not exist; heuristics ignore it
