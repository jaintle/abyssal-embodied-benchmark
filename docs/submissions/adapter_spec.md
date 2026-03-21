# External Agent Adapter Specification — Abyssal Benchmark v1.0.0

This document defines the contract that a community-submitted agent must
satisfy to be evaluated by the Abyssal benchmark harness.

Protocol version: **benchmark_v1.0.0**

---

## Overview

The benchmark harness evaluates agents through a thin adapter interface.
Your adapter wraps your model so that `BenchmarkRunner` can call it without
knowing anything about your training framework.

The interface is intentionally minimal: three mandatory methods, one optional
property.

---

## Required Interface

```python
class MyAgent:
    def get_policy_id(self) -> str: ...
    def load(self, model_dir: Path) -> None: ...
    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray: ...
    def reset(self) -> None: ...          # no-op if your agent is stateless
```

### `get_policy_id() -> str`

Return a short, stable string that uniquely identifies this agent. This string
appears in:
- All replay file headers (`policyId` field)
- Leaderboard display
- Result artifact filenames

Rules:
- Lowercase, alphanumeric, hyphens only (kebab-case)
- Must match `agent_id` in your `metadata.json`
- Must stay constant across evaluation runs

```python
def get_policy_id(self) -> str:
    return "my-agent-v1"
```

### `load(model_dir: Path) -> None`

Called once before evaluation begins. `model_dir` is the absolute path to your
submission's `model/` directory. Load weights, configs, and any other
artefacts from this directory.

If your agent requires no model file (e.g. a heuristic), implement as a no-op.

```python
def load(self, model_dir: Path) -> None:
    model_path = model_dir / "policy.zip"
    self._model = MyModel.load(str(model_path))
```

### `predict(obs: np.ndarray, deterministic: bool = True) -> np.ndarray`

The core inference method.

**Input:**
- `obs`: 1-D `float32` array.
  - Standard observation space: shape `(38,)`
  - Uncertainty observation space: shape `(41,)` — only if your
    `metadata.json` sets `observation_type: "uncertainty"` and your adapter
    sets `requires_uncertainty_obs = True`

**Output:**
- 1-D `float32` array of shape `(2,)` in range `[-1.0, 1.0]`.
  - Index 0: forward/backward thrust (positive = forward)
  - Index 1: yaw torque (positive = rotate right)

```python
def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
    action, _ = self._model.predict(obs, deterministic=deterministic)
    return action.astype(np.float32)
```

### `reset() -> None`

Called at the start of each evaluation episode. Use this to clear any hidden
state (e.g. RNN hidden vectors). Stateless agents may implement as a no-op or
omit the method entirely (the base class provides a no-op default).

```python
def reset(self) -> None:
    self._hidden = None
```

---

## Optional Property

### `requires_uncertainty_obs: bool`

Set to `True` if your agent requires the extended 41-dimensional observation
(which includes three uncertainty scalars: per-axis sensor confidence). Defaults
to `False`.

```python
@property
def requires_uncertainty_obs(self) -> bool:
    return True
```

When `True`, the harness will construct the environment with
`uncertainty_obs=True` and your `predict()` receives a `(41,)` observation.
Your `metadata.json` must also set `observation_type: "uncertainty"`.

---

## Observation Space Reference

### Standard (38-dim)

| Indices | Content |
|---------|---------|
| 0–2 | Agent position `[x, y, z]` |
| 3–5 | Agent velocity `[vx, vy, vz]` |
| 6–8 | Goal direction unit vector `[dx, dy, dz]` |
| 9 | Distance to goal (normalised to world bounds) |
| 10–31 | Sonar returns: 22 directions, range-normalised depth |
| 32–36 | Degradation scalars: `[vis_norm, noise_scale, dropout_prob, spare1, spare2]` |
| 37 | Time remaining, normalised to episode horizon |

### Uncertainty extension (41-dim)

Indices 0–37 as above, plus:

| Indices | Content |
|---------|---------|
| 38–40 | Per-axis observation confidence `[cx, cy, cz]` in `[0, 1]` |

---

## Action Space Reference

Output must be a `float32` array of shape `(2,)` clamped to `[-1, 1]`.

| Index | Meaning | Positive | Negative |
|-------|---------|----------|----------|
| 0 | Thrust | Forward | Backward |
| 1 | Yaw | Rotate right | Rotate left |

The harness clips values outside `[-1, 1]` before passing them to the
environment. Returning `NaN` or `inf` is undefined behaviour and will cause the
episode to fail.

---

## Inheritance

You may inherit from `BenchmarkAgent` to get the type-checked abstract contract:

```python
from abyssal_benchmark.agents.base import BenchmarkAgent
from pathlib import Path
import numpy as np

class MyAgent(BenchmarkAgent):
    def get_policy_id(self) -> str:
        return "my-agent-v1"

    def load(self, model_dir: Path) -> None:
        ...

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        ...
```

Alternatively, implement the methods without inheriting — the harness uses
`isinstance(agent, AgentProtocol)` for duck-type checking.

---

## Determinism Expectations

The benchmark assumes deterministic evaluation:

- Set all framework seeds before each episode in `reset()` if your framework
  exposes them.
- When `deterministic=True` (the default during evaluation), `predict()` must
  return the same action for the same observation.
- Do not depend on wall-clock time, OS random state, or network calls inside
  `predict()` or `reset()`.

---

## Benchmark Version Compatibility

Your adapter must be compatible with benchmark version `1.0.0`.

- Import from `abyssal_benchmark` using the published API only.
- Do not modify environment internals.
- If your adapter requires benchmark version > 1.0.0, record this in
  `metadata.json` and `README.md`.

---

## Example: Minimal Heuristic Adapter

```python
# adapter.py — minimal example
from pathlib import Path
import numpy as np
from abyssal_benchmark.agents.base import BenchmarkAgent


class MinimalHeuristicAdapter(BenchmarkAgent):
    """
    Drives straight toward the goal with a proportional yaw correction.
    No model weights required.
    """

    def get_policy_id(self) -> str:
        return "minimal-heuristic-v1"

    def load(self, model_dir: Path) -> None:
        pass  # no model file needed

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        goal_dir_x = obs[6]   # x-component of goal direction unit vector
        yaw = float(np.clip(goal_dir_x * 2.0, -1.0, 1.0))
        return np.array([1.0, yaw], dtype=np.float32)

    def reset(self) -> None:
        pass
```

See `submissions/TEMPLATE/adapter.py` for a more complete template.

---

## Submission Checklist

Before submitting, verify:

- [ ] `get_policy_id()` returns a stable kebab-case string matching `metadata.json:agent_id`
- [ ] `load()` loads cleanly from the `model/` directory (or is a documented no-op)
- [ ] `predict()` returns `float32` shape `(2,)` in `[-1, 1]`
- [ ] `reset()` clears any hidden state
- [ ] `requires_uncertainty_obs` matches `metadata.json:observation_type`
- [ ] No global side effects on import
- [ ] All dependencies listed in `requirements.txt`
- [ ] Validation passes: `python scripts/validate_submission_bundle.py submissions/<id>/`
