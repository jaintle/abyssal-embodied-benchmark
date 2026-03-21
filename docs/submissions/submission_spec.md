# Submission Bundle Specification — Abyssal Benchmark v1.0.0

This document defines the canonical structure and requirements for an external
agent submission to the Abyssal Embodied Benchmark.

Protocol version: **benchmark_v1.0.0**
Last revised: 2026-03-21

---

## Overview

A submission bundle is a directory (or archive) that contains everything needed
to understand, verify, and publicly display an agent's benchmark results. The
bundle is self-contained: evaluation re-runs use only the files inside it.

---

## Directory Layout

```
<submission_id>/
├── metadata.json          # REQUIRED — structured submission metadata
├── README.md              # REQUIRED — human-readable description
├── adapter.py             # REQUIRED — agent adapter implementing BenchmarkAgent
├── requirements.txt       # REQUIRED — Python dependencies for this adapter
│
├── model/                 # OPTIONAL — checkpoint files (weights, configs, etc.)
│   └── ...
│
└── artifacts/             # REQUIRED — pre-run benchmark artifacts
    ├── aggregate_summary.json   # REQUIRED — aggregate metrics across presets
    ├── per_episode.csv          # REQUIRED — per-episode metrics
    └── replays/                 # REQUIRED — at least one replay per preset
        ├── clear/
        │   └── *.jsonl
        └── heavy/
            └── *.jsonl
```

---

## Required Files

### `metadata.json`

Structured metadata about the submission. Must validate against the
`SubmissionMetadata` schema (see
`python/benchmark/src/abyssal_benchmark/schemas/submission_metadata.py` and
`packages/replay-schema/src/submissionMetadata.ts`).

See [Metadata Fields](#metadata-fields) below.

### `README.md`

A plain-language description of the submission. Must include at minimum:

- What the agent does (algorithm, key design decisions)
- How to reproduce training (or a note that weights are included)
- Known limitations or caveats
- License and attribution

### `adapter.py`

A Python file containing a class that implements the `BenchmarkAgent` interface
(see `python/benchmark/src/abyssal_benchmark/agents/base.py` and
`docs/submissions/adapter_spec.md`).

The adapter class must be importable as:

```python
from adapter import MyAgent   # or any name — see adapter_spec.md
```

The class must expose at minimum:

- `get_policy_id() -> str`
- `predict(obs: np.ndarray, deterministic: bool = True) -> np.ndarray`
- `load(model_dir: Path) -> None`  — called once before evaluation begins

### `requirements.txt`

Standard pip requirements file listing any dependencies needed by `adapter.py`
beyond the benchmark's own `requirements.txt`. Use `>=` version pins where
possible. May be empty if the adapter has no extra dependencies.

### `artifacts/aggregate_summary.json`

Aggregate benchmark results. Schema:

```json
{
  "submission_id": "my-agent-v1",
  "benchmark_version": "1.0.0",
  "agent_id": "my-agent",
  "eval_date": "2026-03-21",
  "presets": {
    "clear": {
      "success_rate": 0.0,
      "collision_rate": 0.0,
      "timeout_rate": 0.0,
      "mean_reward": 0.0,
      "mean_steps": 0.0,
      "mean_final_dist": 0.0,
      "num_episodes": 50
    },
    "heavy": { "..." : "..." }
  }
}
```

### `artifacts/per_episode.csv`

Per-episode metrics. Required columns:

| Column | Type | Description |
|--------|------|-------------|
| `episode` | int | Zero-based episode index |
| `preset` | str | `"clear"` or `"heavy"` |
| `world_seed` | int | World seed used |
| `episode_seed` | int | Episode seed used |
| `success` | bool | Whether the goal was reached |
| `collision` | bool | Whether the episode ended in collision |
| `timeout` | bool | Whether the episode was truncated |
| `total_reward` | float | Undiscounted episode reward |
| `steps` | int | Episode length in steps |
| `final_dist` | float | Distance to goal at termination |

### `artifacts/replays/`

At minimum one replay file per preset (`.jsonl` format, see
`docs/protocol/benchmark_v1.md`). Multiple replays may be included.

Files must follow the naming convention:
`<agent_id>_<preset>_seed<world_seed>.jsonl`

---

## Optional Files

| File/Dir | Purpose |
|----------|---------|
| `model/` | Checkpoint weights and configs. Must not exceed 500 MB per submission. |
| `artifacts/per_condition.json` | Richer per-degradation-level breakdown |
| `artifacts/robustness_summary.json` | Clear → heavy metric deltas |

---

## Naming Rules

- **`submission_id`**: kebab-case, alphanumeric plus hyphens only.
  Format: `<agent-name>-v<N>`. Example: `cautious-ppo-v2`.
- **`agent_id`**: short, stable, unique. Used in replay headers and leaderboard
  display. Must match `policyId` in all submitted replay headers.
- All filenames are lowercase with hyphens (kebab-case), no spaces.

---

## Metadata Fields

### Required

| Field | Type | Description |
|-------|------|-------------|
| `submission_name` | string | Human-readable name. Max 80 chars. |
| `submission_id` | string | Kebab-case unique identifier. |
| `agent_id` | string | Short stable policy id (matches replay `policyId`). |
| `team_name` | string | Team or lab name. |
| `author_name` | string | Primary contact name. |
| `contact` | string | Email address. |
| `repo_url` | string | URL to public code repository. |
| `commit_hash` | string | Git commit of the adapter at submission time. |
| `benchmark_version` | string | Must be `"1.0.0"`. |
| `algorithm_family` | string | One of: `ppo`, `sac`, `td3`, `dqn`, `diffusion`, `heuristic`, `other`. |
| `observation_type` | string | One of: `standard` (38-dim), `uncertainty` (41-dim). |
| `training_notes` | string | Brief description of training procedure. Max 500 chars. |
| `license` | string | SPDX identifier (e.g. `"MIT"`, `"Apache-2.0"`, `"CC-BY-4.0"`). |
| `submission_status` | string | Set to `"provisional"` on initial submission. |

### Optional

| Field | Type | Description |
|-------|------|-------------|
| `institution` | string | Affiliated institution or company. |
| `paper_url` | string | Link to associated paper or preprint. |
| `model_size` | string | Approximate model size (e.g. `"2.1 M params"`). |
| `hardware_notes` | string | Training hardware description. |

---

## Benchmark Version Compatibility

Submissions targeting benchmark version `1.0.0` must:

- Use `BENCHMARK_VERSION = "1.0.0"` in all replay headers.
- Use the observation space defined in `benchmark_v1.0.0` (38-dim standard or
  41-dim uncertainty).
- Evaluate using the official `run_benchmark.py` script or an equivalent that
  calls `BenchmarkRunner` with identical seeds.

Submissions built against other benchmark versions will be marked `rejected`
and will not appear on the public leaderboard.

---

## Submission Status Model

| Status | Meaning |
|--------|---------|
| `provisional` | Submitted artifacts accepted; not yet officially re-run. |
| `verified` | Benchmark re-run confirmed under official protocol. Results are authoritative. |
| `rejected` | Submission is invalid, incompatible, or violates benchmark protocol. Not shown publicly. |

All new submissions enter as `provisional`. Verified status is granted once a
maintainer re-runs the adapter locally using `run_benchmark.py` and the results
match the submitted artifacts within acceptable tolerance.

---

## Validation

Validate your `metadata.json` locally before submitting:

```bash
source .venv/bin/activate
export PYTHONPATH=$PWD/python/benchmark/src

python python/benchmark/scripts/validate_submission_metadata.py submissions/<your-submission>/metadata.json
```

Validate the full bundle:

```bash
python python/benchmark/scripts/validate_submission_bundle.py submissions/<your-submission>/
```

---

## Getting Started

Copy the template and fill in all required fields:

```bash
cp -r submissions/TEMPLATE submissions/my-agent-v1
# Edit submissions/my-agent-v1/metadata.json
# Implement submissions/my-agent-v1/adapter.py
# Run your benchmark and place artifacts
```

See `docs/submissions/adapter_spec.md` for the adapter implementation guide.
