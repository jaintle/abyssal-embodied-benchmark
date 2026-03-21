# How to Submit to the Abyssal Embodied Benchmark

This guide walks you through preparing, validating, and submitting your agent to the Abyssal Embodied Benchmark.

---

## Overview

The submission process has four stages:

1. **Prepare** — structure your bundle correctly
2. **Validate** — run local checks before submitting
3. **Submit** — open a pull request against this repository
4. **Verify** — maintainers run the official evaluation and publish your result

---

## 1. Prepare Your Submission Bundle

Copy the `submissions/TEMPLATE/` directory and rename it to a slug that identifies your agent:

```bash
cp -r submissions/TEMPLATE submissions/your-agent-name
```

Your bundle must contain these files:

```
submissions/your-agent-name/
    metadata.json          # required — describes your submission
    adapter.py             # required — wraps your agent
    requirements.txt       # required — Python dependencies
    README.md              # required — brief description
    model/                 # optional — weights / checkpoints
    artifacts/             # optional — pre-run results
        aggregate_summary.json
        per_episode.csv
        replays/
            clear/
            heavy/
```

### metadata.json

Fill in all fields. The `submission_id` must be globally unique (use a slug like `your-team-ppo-v1`):

```json
{
    "benchmark_version": "1.0.0",
    "submission_id":     "your-team-ppo-v1",
    "submission_name":   "Your Team PPO v1",
    "agent_id":          "your-team-ppo",
    "team_name":         "Your Team",
    "contact_email":     "you@example.com",
    "repo_url":          "https://github.com/your-org/your-repo",
    "paper_url":         null,
    "license":           "MIT",
    "algorithm_family":  "ppo",
    "observation_type":  "standard",
    "submission_status": "provisional",
    "description":       "Short description of your approach."
}
```

Valid values:

| Field | Valid values |
|---|---|
| `benchmark_version` | `"1.0.0"` |
| `algorithm_family` | `"ppo"`, `"sac"`, `"td3"`, `"diffusion"`, `"heuristic"`, `"other"` |
| `observation_type` | `"standard"`, `"uncertainty"` |
| `submission_status` | Always set to `"provisional"` when submitting |

### adapter.py

Your adapter must implement the `BenchmarkAgent` interface. The key methods are:

```python
from abyssal_benchmark.agents.base import BenchmarkAgent
from pathlib import Path
import numpy as np

class Adapter(BenchmarkAgent):

    def get_policy_id(self) -> str:
        """Return the agent_id from metadata.json."""
        return "your-team-ppo"

    def load(self, model_dir: Path) -> None:
        """Load model weights from model_dir. No-op for heuristics."""
        # e.g. self.model = load_checkpoint(model_dir / "policy.pt")
        pass

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """
        Map observation to action.

        obs: float32 array, shape (38,) for standard or (41,) for uncertainty
        Returns: float32 array, shape (2,), values in [-1, 1]
            action[0] — forward/backward thrust
            action[1] — yaw torque (left/right turn)
        """
        return np.zeros(2, dtype=np.float32)

    def reset(self) -> None:
        """Reset any episode-level state."""
        pass
```

See `submissions/TEMPLATE/adapter.py` and `submissions/example_heuristic/adapter.py` for annotated examples.

### Observation space (38-dim standard)

| Index | Description |
|---|---|
| 0–2 | Agent position (x, y, z) |
| 3 | Agent heading (radians) |
| 4–5 | Goal direction vector (dx, dz, normalised) |
| 6 | Distance to goal (normalised) |
| 7–36 | Rangefinder distances (30 rays, normalised) |
| 37 | Collision flag (0 or 1) |

If `observation_type` is `"uncertainty"`, three additional uncertainty channels are appended at indices 38–40.

### Action space (2-dim)

| Index | Range | Description |
|---|---|---|
| 0 | `[-1, 1]` | Forward thrust (positive = forward) |
| 1 | `[-1, 1]` | Yaw torque (positive = turn right) |

Actions outside `[-1, 1]` are clipped by the harness.

---

## 2. Validate Locally

Run these three checks before submitting. All must pass.

### Step 1 — Bundle structure check

```bash
python python/benchmark/scripts/validate_submission_bundle.py submissions/your-agent-name
```

Expected: `PASS` with no `[ERR]` lines.

### Step 2 — Adapter compatibility check

```bash
python python/benchmark/scripts/check_submission_adapter.py submissions/your-agent-name
```

Expected output ends with:
```
PASS — adapter is compatible with the benchmark harness.
```

This verifies the adapter loads cleanly, instantiates, and produces valid action shapes.

### Step 3 — (Optional) Local dry run

```bash
python python/benchmark/scripts/evaluate_submission.py \
    --submission-dir submissions/your-agent-name \
    --world-seed 42 \
    --n-episodes 5 \
    --max-steps 200 \
    --degradation-presets clear \
    --output-dir results/submissions-local
```

This runs a shortened version of the official evaluation using the same harness. Use it to catch runtime errors before submitting.

---

## 3. Submit via Pull Request

1. Push your submission bundle to a fork of this repository.
2. Open a pull request targeting the `main` branch.
3. Title the PR: `[Submission] <submission_name> — <submission_id>`
4. In the PR description include:
   - A brief description of your approach
   - Paste the output of both validation scripts
   - Link to your paper or code if available

The maintainers will review the PR for structural validity before running the official evaluation.

---

## 4. Verification

After your PR is merged, maintainers will:

1. Run `evaluate_submission.py` with the official seeds (`--world-seed 42`, `--n-episodes 50`, `--max-steps 500`).
2. Review the `verification_manifest.json` output.
3. Run `publish_submission.py` to copy artifacts to the public data store and update `leaderboard.json`.
4. Your submission status will be updated from `provisional` to `verified`.

See [verification.md](./verification.md) for the full verification flow.

---

## Common Issues

**`[ERR] adapter.py missing`**
Your adapter.py must be at the root of your submission directory, not in a subdirectory.

**`[ERR] metadata.json failed schema validation`**
Check that all required fields are present and `benchmark_version` is exactly `"1.0.0"`.

**`[ERR] Method missing: reset()`**
Your adapter class must define `reset(self) -> None`.

**`[WRN] get_policy_id() does not match metadata.agent_id`**
The string returned by `get_policy_id()` must exactly match the `agent_id` field in `metadata.json`. This ensures replay files are labelled consistently.

**`[ERR] predict() returned shape (1, 2), expected (2,)`**
`predict()` must return a 1-D array of length 2, not a 2-D array. Flatten your model output before returning.

---

## Questions

Open an issue in this repository with the tag `[submission]`.
