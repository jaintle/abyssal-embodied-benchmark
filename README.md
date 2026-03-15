# Abyssal Embodied Benchmark

A deterministic embodied navigation benchmark with controlled visual degradation,
multi-agent comparison, and a browser-based replay viewer.

---

## What This Is

Abyssal is a **research benchmark** for evaluating learned navigation policies
under controlled perception degradation.  The benchmark tests a core question in
robot learning:

> *How does visual noise and dropout degrade a navigation policy's
> safety and performance — and can an uncertainty-aware training objective
> recover that robustness?*

The system consists of:

- A **Python Gymnasium environment** with a deterministic procedural underwater world
- A **benchmark harness** for reproducible multi-agent, multi-condition evaluation
- A **replay-driven web viewer** that renders evaluation results in the browser
  with no backend required

This is **not** a game engine, a physics simulator, or a training platform.
It is a focused benchmark artifact: deterministic, reproducible, and demo-ready.

---

## Research Context

### Problem

Embodied navigation policies trained in clean simulation often fail silently
when deployed in degraded perceptual conditions (fog, sensor noise, partial
occlusion).  Standard benchmarks evaluate agents in a single fixed condition and
report only terminal success/failure.  This hides the degradation curve.

### What Abyssal Measures

Abyssal provides **named degradation presets** that apply controlled corruption
to the structured observation vector:

| Preset  | Turbidity | Visibility | Noise σ | Dropout |
|---------|-----------|------------|---------|---------|
| `clear` | 0.00      | 30 m       | 0.0     | 0.00    |
| `mild`  | 0.30      | 18 m       | 1.5 m   | 0.00    |
| `heavy` | 0.70      |  8 m       | 5.0 m   | 0.20    |

Every agent is evaluated under **identical seeds across all presets**, making
cross-condition comparisons statistically valid.

### Uncertainty-Aware Baseline

The benchmark includes a **cautious PPO baseline** trained with:

1. A `visibility_quality` scalar appended to the observation (`obs[40]`)
2. A reward penalty during training: `−α × (1 − visibility) × ‖action‖²`

This teaches the policy to reduce its action magnitude when perception is poor —
encoding conservative behavior in the weights with no inference-time modification.

### Observed Safety-Performance Tradeoff

The bundled sample results (world seed 42, 20 episodes) show the core tradeoff:

| Agent         | clear succ | heavy succ | heavy coll | speed (clear→heavy) |
|---------------|-----------|-----------|-----------|----------------------|
| `heuristic`   |     100%  |      33%  |      33%  |  0.88 → 0.88         |
| `cautious_ppo`|      67%  |      67%  |       0%  |  0.50 → 0.31         |
| `random`      |       0%  |       0%  |       0%  |  0.57 → 0.57         |

The cautious agent absorbs degradation without colliding by automatically
reducing its action magnitude.  It trades clear-condition success rate for
zero-collision robustness under heavy noise.

---

## Architecture

```
abyssal-embodied-benchmark/
├── python/benchmark/          # Gymnasium env + training + evaluation
│   ├── src/abyssal_benchmark/
│   │   ├── envs/              # AbyssalNavigationEnv, degradation, make_env
│   │   ├── agents/            # HeuristicAgent, RandomAgent, PPOAgent, CautiousAgent
│   │   └── eval/              # BenchmarkRunner, ReplayExporter
│   └── scripts/               # CLI entry points
├── apps/web/                  # Next.js replay viewer (static export)
│   ├── src/components/        # React Three Fiber scene + panels
│   └── public/benchmark/      # Bundled sample artifacts
└── packages/
    ├── worldgen/              # Shared procedural world spec (TypeScript)
    └── replay-schema/         # Shared replay JSONL schema (TypeScript + Zod)
```

The Python layer and the web viewer share contracts via:

- `world_spec.json` — seed, obstacle layout, goal position
- `replay.jsonl` — step-by-step trajectory with observations and actions
- `aggregate_summary.json` — per-agent benchmark statistics
- `robustness_summary.json` — statistics across all presets (flat array)

The web viewer is a **static app**.  It reads pre-computed JSON/JSONL artifacts
from `/public/benchmark/` and requires no live Python process.

---

## Quickstart

### Python benchmark

Install dependencies (from `python/benchmark/`):

```bash
pip install -e .
```

**Smoke test the environment:**

```bash
cd python/benchmark
python scripts/smoke_env.py
```

**End-to-end demo (train + benchmark + export):**

```bash
cd python/benchmark
bash scripts/demo_train_and_benchmark.sh
```

This trains both PPO baselines (~15 min), evaluates all four agents across
`clear` and `heavy` presets, and writes a complete leaderboard bundle to
`results/leaderboard/demo-<timestamp>/`.

**Update the web viewer with fresh artifacts:**

```bash
cd python/benchmark
bash scripts/demo_web_artifacts.sh demo-<timestamp>
```

### Web viewer

```bash
npm install
cd apps/web && npm run dev
```

Open `http://localhost:3000`.  The viewer loads the bundled sample artifacts
from `apps/web/public/benchmark/` and shows:

- Leaderboard table (per-agent metrics, best/worst highlighted)
- Degradation selector (switch between `clear` and `heavy` preset results)
- Safety-tradeoff panel (collision rate vs action magnitude per preset)
- Robustness comparison (Δ success rate from clear → heavy)
- Side-by-side 3D replay of all agents in the same episode

---

## Running Specific Workflows

### Train standard PPO baseline

```bash
cd python/benchmark
python scripts/train_ppo.py \
    --world-seed 42 \
    --total-steps 50000 \
    --run-name ppo-baseline
```

Output: `results/runs/ppo-baseline/model.zip`

### Train cautious PPO baseline

```bash
cd python/benchmark
python scripts/train_cautious_ppo.py \
    --world-seed 42 \
    --total-steps 200000 \
    --caution-coeff 0.3 \
    --run-name cautious-ppo-baseline
```

Output: `results/runs/cautious-ppo-baseline/model.zip`

Key differences from standard PPO:

- Observation dim = 41 (includes `visibility_quality` scalar at `obs[40]`)
- `CautiousRewardWrapper` applies penalty `caution_coeff × (1 − vis) × ‖a‖²` during training
- Use `cautious_ppo:<path>` specifier in the benchmark runner

### Run multi-agent benchmark

Evaluate heuristic and random baselines:

```bash
cd python/benchmark
python scripts/run_benchmark.py \
    --agents heuristic random \
    --world-seed 42 \
    --n-episodes 20 \
    --run-name baseline-comparison
```

Evaluate all four agents across two degradation presets with replay export:

```bash
cd python/benchmark
python scripts/run_benchmark.py \
    --agents heuristic \
            ppo:results/runs/ppo-baseline/model.zip \
            cautious_ppo:results/runs/cautious-ppo-baseline/model.zip \
            random \
    --world-seed 42 \
    --n-episodes 20 \
    --degradation-presets clear heavy \
    --export-replay-seed 0 \
    --run-name safety-tradeoff-run
```

Output bundle: `<repo-root>/results/leaderboard/<run-name>/`

```
results/leaderboard/<run-name>/
    robustness_summary.json    # all agents × all presets
    robustness_summary.csv
    clear/
        benchmark_config.json
        aggregate_summary.json
        aggregate_summary.csv
        per_episode.csv
        replays/               # if --export-replay-seed is given
    heavy/
        benchmark_config.json
        aggregate_summary.json
        ...
```

Available presets: `clear` (baseline), `mild` (moderate noise), `heavy` (severe noise + dropout).

### Run tests

```bash
cd python/benchmark
python -m pytest tests/ -v
```

---

## Benchmark Protocol

All agents in a run share identical `world_seed`, `episode_seeds`, and `max_steps`.
Comparisons are only valid when these parameters are held constant.  The
`benchmark_config.json` artifact records the exact values used.

**Determinism guarantees:**

- World geometry: fixed by `world_seed` at construction
- Episode seeds: derived via `derive_seed(base, i)` for `i in 0..n_episodes-1`
- Observation degradation: seeded per `(episode_seed * 1_000_003 + step) & 0x7FFF_FFFF`
- All seeds are logged in `benchmark_config.json`

See [`docs/protocol/benchmark_v1.md`](docs/protocol/benchmark_v1.md) for the full protocol specification.

---

## Extending the Benchmark

### Adding a new agent

Implement the `BenchmarkAgent` interface in `python/benchmark/src/abyssal_benchmark/agents/`:

```python
from abyssal_benchmark.agents.base import BenchmarkAgent

class MyAgent(BenchmarkAgent):
    def get_policy_id(self) -> str:
        return "my_agent"

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        # obs shape: (40,) standard, (41,) if requires_uncertainty_obs=True
        return action  # shape (2,), values in [-1, 1]

    def reset(self) -> None:
        pass  # called at episode start; reset any internal state here
```

Pass it to the runner via `--agents my_agent` or register a specifier in `run_benchmark.py`.

### Adding a new degradation preset

Add the preset to `DEGRADATION_PRESETS` in both:

- `python/benchmark/src/abyssal_benchmark/schemas/world_spec.py`
- `packages/worldgen/src/worldSpec.ts`

Both must stay in sync — the shared replay schema enforces the contract.

---

## Docs

- [`docs/protocol/benchmark_v1.md`](docs/protocol/benchmark_v1.md) — full benchmark protocol
- [`docs/experiment_log.md`](docs/experiment_log.md) — curated run history
- [`docs/threat_model/visual_degradation.md`](docs/threat_model/visual_degradation.md) — degradation design rationale
- [`docs/product/`](docs/product/) — product vision and scope

---

## License

MIT
