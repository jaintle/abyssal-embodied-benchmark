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
