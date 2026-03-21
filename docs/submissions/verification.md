# Verification Flow

This document describes the end-to-end verification process for external submissions — from initial PR review through official evaluation to leaderboard publication.

---

## Status Model

Every submission carries a `submission_status` field that follows this lifecycle:

```
provisional  →  verified
             ↘  rejected
```

| Status | Meaning |
|---|---|
| `provisional` | Submitted by contributor; not yet officially re-run |
| `verified` | Official evaluation completed; results confirmed |
| `rejected` | Bundle invalid or adapter failed official evaluation |

Submissions are listed on the leaderboard regardless of status, but only `verified` entries display confirmed metrics.

---

## Phase 1 — Structural Review (maintainer)

When a submission PR arrives, the maintainer runs the bundle validator:

```bash
python python/benchmark/scripts/validate_submission_bundle.py \
    submissions/<submission_id>
```

Expected: `PASS` with no `[ERR]` lines.

This checks:
- Required files present (`metadata.json`, `adapter.py`, `requirements.txt`, `README.md`)
- `metadata.json` validates against the Pydantic schema
- `benchmark_version` is a supported version
- Artifact structure is plausible (warnings only if artifacts are missing or incomplete)

If the bundle fails structural validation, the PR is returned to the contributor with the error output. The submission is not merged until this passes.

---

## Phase 2 — Adapter Compatibility Check (maintainer)

After structural validation, the maintainer runs:

```bash
python python/benchmark/scripts/check_submission_adapter.py \
    submissions/<submission_id>
```

This performs nine checks:

1. Bundle loads and metadata validates
2. `adapter.py` imports without errors
3. Adapter class is discoverable (by canonical name or duck-typing)
4. Required methods present: `get_policy_id`, `predict`, `reset`
5. Adapter instantiates without constructor arguments
6. `get_policy_id()` returns a non-empty string matching `agent_id`
7. `load(model_dir)` runs without error
8. `reset()` runs without error
9. `predict(dummy_obs)` returns shape `(2,)`, finite values, within `[-1, 1]`

Expected output ends with:
```
PASS — adapter is compatible with the benchmark harness.
```

If this fails, the PR is returned. The adapter must pass all required checks before proceeding.

---

## Phase 3 — Official Evaluation (maintainer)

Once both checks pass, the PR is merged and the official evaluation is run:

```bash
python python/benchmark/scripts/evaluate_submission.py \
    --submission-dir submissions/<submission_id> \
    --world-seed 42 \
    --n-episodes 50 \
    --max-steps 500 \
    --degradation-presets clear,heavy \
    --output-dir results/submissions
```

### Protocol guarantees

- World seed `42`, episode count `50`, max steps `500` are fixed for all submissions.
- Per-episode seeds are deterministically derived: `seed_i = hash(base_ep_seed=1000, episode_index=i)`.
- The same `BenchmarkRunner` class is used for all evaluations — no special code paths.
- Git commit is recorded in the verification manifest.

### Output structure

```
results/submissions/<submission_id>/
    verification_manifest.json   ← provenance record
    clear/
        benchmark_config.json
        aggregate_summary.json
        aggregate_summary.csv
        per_episode.csv
        replays/
            episode_0000.jsonl
    heavy/
        ...
    robustness_summary.json
    robustness_summary.csv
```

### Verification manifest

`verification_manifest.json` records the full evaluation provenance:

```json
{
    "manifest_type": "evaluation_verification",
    "benchmark_version": "1.0.0",
    "evaluated_at": "2025-10-01T14:00:00Z",
    "git_commit": "abc123...",
    "submission_id": "example-heuristic-v1",
    "agent_id": "example-heuristic",
    "policy_id_from_adapter": "example-heuristic",
    "evaluation_params": {
        "world_seed": 42,
        "n_episodes": 50,
        "max_steps": 500,
        "base_ep_seed": 1000,
        "degradation_presets": ["clear", "heavy"]
    },
    "preset_metrics": {
        "clear": {
            "success_rate": 0.72,
            "collision_rate": 0.14,
            "timeout_rate": 0.14,
            "mean_reward": 12.4,
            "mean_final_dist": 0.18,
            "n_episodes": 50
        },
        "heavy": { "..." : "..." }
    },
    "recommendation": "verified"
}
```

This manifest is the basis for the `verified` status transition. It is committed alongside the submission artifacts.

---

## Phase 4 — Publication (maintainer)

After a successful evaluation, the maintainer publishes the results:

```bash
python python/benchmark/scripts/publish_submission.py \
    --submission-dir submissions/<submission_id> \
    --evaluation-dir results/submissions/<submission_id> \
    --public-data-dir apps/web/public/data
```

Use `--dry-run` first to preview what will be written:

```bash
python python/benchmark/scripts/publish_submission.py \
    --submission-dir submissions/<submission_id> \
    --evaluation-dir results/submissions/<submission_id> \
    --public-data-dir apps/web/public/data \
    --dry-run
```

### What publish_submission.py does

1. Reads `verification_manifest.json` from the evaluation directory.
2. Copies `metadata.json` to `apps/web/public/data/submissions/<id>/`.
3. Generates `summary.json` and `per_condition.json` from evaluation output.
4. Copies `.jsonl` replay files into `apps/web/public/data/submissions/<id>/replays/`.
5. Updates `apps/web/public/data/leaderboard/leaderboard.json`:
   - Replaces existing entry with the same `submission_id` (if any).
   - Inserts the new entry at the front (newest first).
   - Sets `status: "verified"` and records `date_verified`.

### Provisional publishing (no official re-run)

If you want to list a submission on the leaderboard before official verification:

```bash
python python/benchmark/scripts/publish_submission.py \
    --submission-dir submissions/<submission_id> \
    --public-data-dir apps/web/public/data \
    --status provisional
```

In this case, metrics are drawn from the submitted `artifacts/aggregate_summary.json` (if present). The leaderboard entry will show `status: "provisional"` and no `date_verified`.

---

## Leaderboard Entry Structure

Each entry in `leaderboard.json` contains:

```json
{
    "submission_id":     "example-heuristic-v1",
    "display_name":      "Example Heuristic v1",
    "agent_id":          "example-heuristic",
    "team_name":         "Benchmark Team",
    "status":            "verified",
    "benchmark_version": "1.0.0",
    "algorithm_family":  "heuristic",
    "observation_type":  "standard",
    "summary_path":      "submissions/example-heuristic-v1/summary.json",
    "replay_path":       "submissions/example-heuristic-v1/replays/",
    "metadata_path":     "submissions/example-heuristic-v1/metadata.json",
    "date_submitted":    "2025-10-01",
    "date_verified":     "2025-10-01",
    "clear_success_rate": 0.72,
    "heavy_success_rate": 0.48,
    "repo_url":          "https://github.com/example/repo",
    "paper_url":         null
}
```

The `clear_success_rate` and `heavy_success_rate` fields are denormalised from `preset_metrics` for fast leaderboard rendering without loading each `summary.json`.

---

## Reproducibility

To reproduce any verified result, use the parameters recorded in `verification_manifest.json`:

```bash
python python/benchmark/scripts/evaluate_submission.py \
    --submission-dir submissions/<submission_id> \
    --world-seed 42 \
    --n-episodes 50 \
    --max-steps 500 \
    --base-ep-seed 1000 \
    --degradation-presets clear,heavy \
    --output-dir results/reproduce
```

Providing identical `--world-seed`, `--n-episodes`, `--max-steps`, and `--base-ep-seed` guarantees bitwise-identical episode sequences.

---

## Rejection Criteria

A submission will be marked `rejected` if:

- `validate_submission_bundle.py` produces any `[ERR]` output
- `check_submission_adapter.py` produces any `[ERR]` output
- `evaluate_submission.py` raises an unhandled exception during the official run
- The adapter modifies global state in a way that breaks the harness
- `get_policy_id()` returns a value inconsistent with `metadata.agent_id` after warning

Rejected submissions are not published to the leaderboard.

---

## Timeline

| Stage | Typical turnaround |
|---|---|
| Structural + adapter review | 1–3 days |
| Official evaluation | 1–7 days (depends on compute) |
| Publication | Same day as evaluation |

The evaluation is CPU-bound and takes roughly 10–30 minutes for 50 episodes × 2 presets depending on agent speed.
