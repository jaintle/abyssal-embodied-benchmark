# Experiment Log

---

## 2026-03-15 — Phase 5: Multi-Agent Benchmark Framework

**Goal:** Run first multi-agent benchmark comparison.

**Setup:**
- World seed: 42
- N episodes: 20
- Max steps: 500
- Base episode seed: 1000

**Agents evaluated:**
- `heuristic` — goal-directed, no obstacle avoidance
- `random` — uniform random actions

**Command:**

```bash
python scripts/run_benchmark.py \
    --agents heuristic random \
    --world-seed 42 \
    --n-episodes 20 \
    --export-replay-seed 0 \
    --run-name phase5-baseline
```

**Expected outcome:**
Heuristic agent outperforms random on success rate and mean reward.
Random agent serves as lower-bound reference.
Outputs saved to `results/leaderboard/phase5-baseline/`.

*(Update with actual numbers after running the smoke path.)*

---

## 2026-03-15 — Phase 6: PPO Baseline + Multi-Agent Comparison Viewer

**Goal:** Run heuristic vs PPO vs random, export replays, render in comparison UI.

**Setup:**
- World seed: 42
- N episodes: 20
- Max steps: 500
- Export replay seed: 1338301409

**Agents evaluated:**
- `heuristic` — goal-directed, no obstacle avoidance
- `ppo` — SB3 PPO checkpoint (50 k steps, world seed 42)
- `random` — uniform random actions

**Bundled sample artifacts:** `apps/web/public/benchmark/`

**Expected outcome:**
- PPO outperforms heuristic on mean reward; heuristic may still win on success rate
  due to direct line-of-sight navigation in clear conditions.
- Random serves as lower-bound.

*(Update with actual numbers after running the smoke path.)*

---

## 2026-03-15 — Phase 7: Controlled Visual Degradation Benchmark

**Goal:** Evaluate robustness of heuristic and random agents under named degradation presets.

**Setup:**
- World seed: 42
- N episodes: 20
- Max steps: 500
- Degradation presets: `clear`, `heavy`
- Export replay seed: 1338301409

**Command:**

```bash
cd python/benchmark
python scripts/run_benchmark.py \
    --agents heuristic random \
    --world-seed 42 \
    --n-episodes 20 \
    --degradation-presets clear heavy \
    --export-replay-seed 1338301409 \
    --run-name phase7-robustness
```

**Bundled sample artifacts:** `apps/web/public/benchmark/{clear,heavy}/` and
`apps/web/public/benchmark/robustness_summary.json`.

**Simulated sample results (manually generated for UI demo):**

| Agent | clear succ% | heavy succ% | Δ |
|---|---|---|---|
| heuristic | 100% | 33% | −67% |
| random    |   5% |  5% | ±0% |

**Interpretation:**
Heuristic degrades sharply under heavy noise because it relies directly on the
goal-relative bearing feature (`obs[4:6]`).  Gaussian noise at σ = 5 m produces
large bearing errors at distances of 10–20 m, causing the agent to overshoot or
stall.  Random agent is unaffected because it ignores observations entirely.

*(Update with actual numbers after running the smoke path on target hardware.)*

---

## 2026-03-15 — Phase 8: Cautious Baseline vs Standard Agents

**Goal:** Train a cautious PPO baseline and compare safety-performance tradeoffs across degradation presets.

**Setup:**
- World seed: 42
- N episodes: 20
- Max steps: 500
- Degradation presets: `clear`, `heavy`
- Export replay seed: 1338301409
- caution_coeff: 0.3

**Training command (cautious baseline):**

```bash
cd python/benchmark
python scripts/train_cautious_ppo.py \
    --world-seed 42 \
    --total-steps 200000 \
    --caution-coeff 0.3 \
    --run-name phase8-cautious
```

**Benchmark command:**

```bash
cd python/benchmark
python scripts/run_benchmark.py \
    --agents heuristic \
        cautious_ppo:results/runs/phase8-cautious/model.zip \
        random \
    --world-seed 42 \
    --n-episodes 20 \
    --degradation-presets clear heavy \
    --export-replay-seed 1338301409 \
    --run-name phase8-safety-tradeoff
```

**Simulated sample results (manually generated for UI demo):**

| Agent | clear succ% | heavy succ% | heavy coll% | clear speed | heavy speed |
|---|---|---|---|---|---|
| heuristic | 100% | 33% | 33% | 0.88 | 0.88 |
| cautious_ppo | 67% | 67% | 0% | 0.50 | 0.31 |
| random | 0% | 0% | 0% | 0.57 | 0.57 |

**Interpretation:**
The cautious baseline absorbs degradation without colliding by reducing its action
magnitude.  At heavy degradation, `visibility_quality = 0.2`, so the caution penalty
`0.3 × (1 − 0.2) × ‖a‖²` strongly discourages large thrusts.  This leads to slower
navigation but zero collisions.  The cost is a higher timeout rate relative to the
heuristic in clear conditions.

*(Update with actual numbers after running the smoke path on target hardware.)*
