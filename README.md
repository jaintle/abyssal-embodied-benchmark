# Abyssal Embodied Benchmark

**Procedural underwater world + reproducible embodied navigation benchmark**

A lightweight embodied RL benchmark combining procedural 3-D world rendering
with reproducible agent evaluation. Agents are trained offline and visualised
interactively in the browser through replayable trajectories under controlled
perception degradation.

Live demo: [abyssal-embodied-benchmark on GitHub Pages](https://janintle.github.io/abyssal-embodied-benchmark)

---

## What this benchmark measures

- **Goal-reaching success rate** — fraction of episodes where the agent reaches the target zone
- **Collision avoidance** — fraction of episodes terminated by obstacle contact
- **Robustness under visual degradation** — Δ success rate from `clear` → `heavy` preset
- **Speed-safety tradeoff** — mean action magnitude vs. collision rate per preset
- **Path efficiency** — mean steps and final distance to goal at episode end

---

## Quickstart

Prerequisites: **Node 18+**, **Python 3.10+**, **pip**

```bash
# 1. Clone and install web dependencies
git clone https://github.com/your-username/abyssal-embodied-benchmark.git
cd abyssal-embodied-benchmark && npm install

# 2. Install Python dependencies
cd python/benchmark && pip install -e .

# 3. Train the PPO baseline, run benchmark, export artifacts (~15 min)
bash scripts/smoke_end_to_end.sh

# 4. Launch the web demo
cd ../.. && npm run dev:web
# → open http://localhost:3000
```

Step 3 trains a PPO policy (~50 k steps for a quick run, 200 k for the full
baseline), evaluates all available agents across `clear` and `heavy` presets,
and copies the replay artifacts into `apps/web/public/benchmark/`.

**Skip training** if you already have a checkpoint:

```bash
cd python/benchmark
SKIP_TRAIN=1 PPO_MODEL=../../results/runs/my-run/model.zip \
    bash scripts/smoke_end_to_end.sh
```

The viewer opens with pre-bundled sample artifacts so step 3 is optional for
a quick look at the UI.

---

## Architecture

```
Python RL training
└── scripts/train_ppo.py  →  results/runs/<name>/model.zip

Python benchmark harness
└── scripts/run_benchmark.py  →  results/leaderboard/<name>/
        robustness_summary.json
        clear/  { benchmark_config.json, replays/*.jsonl }
        heavy/  { benchmark_config.json, replays/*.jsonl }

Web artifact copy
└── scripts/demo_web_artifacts.sh  →  apps/web/public/benchmark/

Browser replay viewer  (Next.js + React Three Fiber, fully static)
└── npm run dev:web  →  http://localhost:3000
        sidebar : leaderboard + robustness table + safety tradeoff
        canvas  : 3-D comparison view, all agents in one scene
        controls: play/pause/seek + degradation toggle (CLEAR / HEAVY)
```

The web viewer is **fully static** — no live Python process required. It reads
pre-computed JSON/JSONL artifacts from `/public/benchmark/` at build time.

---

## Benchmark agents

| Specifier | Description |
|-----------|-------------|
| `heuristic` | Full thrust toward goal; no obstacle avoidance — pure upper-bound on speed |
| `ppo:<path>` | SB3 PPO trained on `clear` world; obs dim = 40 |
| `cautious_ppo:<path>` | PPO trained with uncertainty observation + caution penalty; obs dim = 41 |
| `random` | Uniform random actions — lower-bound baseline |

The cautious baseline appends a `visibility_quality` scalar to the observation
and applies a reward penalty `−0.3 × (1 − visibility) × ‖action‖²` during
training. This encodes conservative behaviour in the weights with no
inference-time modification.

---

## Degradation presets

| Preset | Visibility | Noise σ | Dropout | PPO success (typical) |
|--------|------------|---------|---------|----------------------|
| `clear` | 30 m | 0.0 | 0.00 | ~75–90% |
| `mild`  | 18 m | 1.5 | 0.00 | ~55–70% |
| `heavy` | 12.5 m | 2.3 | 0.10 | ~40–50% |

Heavy-preset values are empirically calibrated so a standard PPO baseline
scores in the 30–50% success band — wide enough to show a meaningful
robustness gap between agents.

---

## Running specific workflows

### Train standard PPO baseline

```bash
cd python/benchmark
python scripts/train_ppo.py \
    --world-seed 42 \
    --total-steps 200000 \
    --run-name ppo-baseline
# → results/runs/ppo-baseline/model.zip
```

### Train cautious PPO baseline

```bash
cd python/benchmark
python scripts/train_cautious_ppo.py \
    --world-seed 42 \
    --total-steps 200000 \
    --caution-coeff 0.3 \
    --run-name cautious-baseline
# → results/runs/cautious-baseline/model.zip
```

### Run full robustness benchmark

```bash
cd python/benchmark
python scripts/run_benchmark.py \
    --agents heuristic \
             ppo:results/runs/ppo-baseline/model.zip \
             cautious_ppo:results/runs/cautious-baseline/model.zip \
             random \
    --world-seed 42 \
    --n-episodes 20 \
    --degradation-presets clear heavy \
    --export-replay-seed 0 \
    --run-name robustness-v1
# → results/leaderboard/robustness-v1/
```

### Update the web viewer with fresh artifacts

```bash
cd python/benchmark
bash scripts/demo_web_artifacts.sh robustness-v1
```

### Run tests

```bash
cd python/benchmark
python -m pytest tests/ -v
```

---

## Adding your own agent

Implement the `BenchmarkAgent` interface:

```python
# python/benchmark/src/abyssal_benchmark/agents/my_agent.py
import numpy as np
from abyssal_benchmark.agents.base import BenchmarkAgent

class MyAgent(BenchmarkAgent):
    def get_policy_id(self) -> str:
        return "my_agent"

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        # obs.shape: (40,) standard  |  (41,) if requires_uncertainty_obs=True
        # return: np.ndarray shape (2,), values in [-1.0, 1.0]
        raise NotImplementedError

    def reset(self) -> None:
        pass  # called at episode start; reset internal state here
```

Pass it to the runner:

```bash
python scripts/run_benchmark.py \
    --agents my_agent \
    --world-seed 42 --n-episodes 20 \
    --run-name my-agent-eval
```

To submit results for comparison, export a replay bundle and share the
`results/leaderboard/<run-name>/` directory alongside your checkpoint and
training config. All runs must record:

- `benchmark_version: "1.0.0"`
- `world_seed`, `episode_seeds`, `n_episodes`, `max_steps`
- `degradation_preset` (one per sub-directory for multi-preset runs)
- `git_commit` of the code used

See [`docs/protocol/benchmark_v1.md`](docs/protocol/benchmark_v1.md) for the
full protocol specification.

---

## Static demo build

Build a fully static web export for hosting on GitHub Pages or any CDN:

```bash
npm run export:web
# → apps/web/out/
```

Set the base path for your deployment:

```bash
NEXT_PUBLIC_BASE_PATH=/abyssal-embodied-benchmark npm run export:web
```

---

## Performance

Tested at **~58–62 FPS** on a mid-range laptop (MacBook M-series, 1440 × 900)
with 4 agents running simultaneously in the heavy preset scene.  The renderer
uses procedural geometry only — no large texture assets.

Press **P** in the browser to toggle the live performance HUD (FPS / draw calls
/ triangle count).

---

## Docs

- [`docs/protocol/benchmark_v1.md`](docs/protocol/benchmark_v1.md) — full benchmark protocol and metrics
- [`docs/product/overview.md`](docs/product/overview.md) — design philosophy and research context
- [`docs/protocol/schema_migration.md`](docs/protocol/schema_migration.md) — replay schema versioning
- [`docs/protocol/performance_audit.md`](docs/protocol/performance_audit.md) — renderer performance audit
- [`docs/experiment_log.md`](docs/experiment_log.md) — curated run history

---

## License

MIT
