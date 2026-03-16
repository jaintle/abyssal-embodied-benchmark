# Schema Migration Guide

## Current version: `1.0.0`

The benchmark contract version is defined in three canonical locations that must stay identical:

| File | Symbol |
|------|--------|
| `packages/worldgen/src/worldSpec.ts` | `BENCHMARK_VERSION` |
| `packages/replay-schema/src/replaySchema.ts` | `BENCHMARK_VERSION` |
| `python/benchmark/src/abyssal_benchmark/schemas/world_spec.py` | `BENCHMARK_VERSION` |

`replay_export.py` and `benchmark_runner.py` import this version into every artifact they write.

---

## What the version covers

`benchmarkVersion` appears in:

- `ReplayHeader.benchmarkVersion` — every JSONL replay file
- `benchmark_config.json` → `benchmark_version`
- `aggregate_summary.json` → each row's `benchmark_version`
- `robustness_summary.json` → each row's `benchmark_version`

The version is a semantic label for the full contract: world spec schema, observation layout, action space, reward formula, replay serialisation format, and artifact filenames.

---

## Version history

| Version | Date | Notes |
|---------|------|-------|
| `0.1.0` | 2026-03-14 | Initial working contract through Phase 8 |
| `1.0.0` | 2026-03-16 | Phase 9 calibration. Heavy preset recalibrated (vis=12.5/noise=2.3/drop=0.10). Soft version enforcement added. |

---

## Loading older artifacts

The browser loader applies a **soft** version check. Pre-1.0.0 artifacts (e.g. files with `"benchmarkVersion": "0.1.0"`) continue to load and render. A `console.warn` is emitted. No hard rejection.

To silence the warning: regenerate artifacts by re-running the benchmark pipeline.

```bash
cd python/benchmark
bash scripts/demo_train_and_benchmark.sh
bash scripts/demo_web_artifacts.sh <run-name>
```

---

## How to bump the version for a future change

1. Decide whether the change breaks backward compatibility:
   - **Patch** (x.x.N): bug fix, no schema field change
   - **Minor** (x.N.0): new optional field added
   - **Major** (N.0.0): field removed, renamed, or semantics changed

2. Update `BENCHMARK_VERSION` in all three canonical files simultaneously.

3. If the change is breaking: update `checkReplayVersion()` in `replaySchema.ts` to surface a clear error message.

4. Update this file's version history table.

5. Regenerate demo artifacts and commit them alongside the version bump.

---

## Reproducibility guarantee

Given the same `benchmarkVersion`, `worldSeed`, `episodeSeed`, and policy checkpoint, the benchmark must produce byte-identical replay trajectories. If a schema change breaks this guarantee, it is a **major** version bump.
