# abyssal-embodied-benchmark

Procedural underwater world + embodied navigation benchmark + replayable evaluation UI.

## Python benchmark

Install dependencies (from `python/benchmark/`):

```bash
pip install -e .
```

### Train PPO baseline

```bash
cd python/benchmark
python scripts/train_ppo.py \
    --world-seed 42 \
    --total-steps 50000 \
    --run-name ppo-baseline
```

Output: `results/runs/ppo-baseline/model.zip`

### Run multi-agent benchmark

Evaluate heuristic and random baselines:

```bash
python scripts/run_benchmark.py \
    --agents heuristic random \
    --world-seed 42 \
    --n-episodes 20 \
    --run-name baseline-comparison
```

Evaluate heuristic + a trained PPO checkpoint and export one replay per agent:

```bash
python scripts/run_benchmark.py \
    --agents heuristic ppo:results/runs/ppo-baseline/model.zip \
    --world-seed 42 \
    --n-episodes 20 \
    --export-replay-seed 0 \
    --run-name ppo-vs-heuristic
```

Output bundle: `results/leaderboard/<run-name>/`

```
benchmark_config.json
aggregate_summary.csv
aggregate_summary.json
per_episode.csv
replays/             # if --export-replay-seed is given
```

### Train cautious PPO baseline (Phase 8)

The cautious baseline trains with an uncertainty observation and a caution
reward penalty that discourages large actions under poor visibility:

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
- Observation dim = 41 (includes `visibility_quality` scalar at obs[40])
- `CautiousRewardWrapper` penalises `caution_coeff × (1 − vis) × ‖a‖²`
- Use `cautious_ppo:<path>` specifier in benchmark runner

### Run safety-performance comparison (Phase 8)

Compare standard and cautious baselines across degradation presets:

```bash
cd python/benchmark
python scripts/run_benchmark.py \
    --agents heuristic \
        cautious_ppo:results/runs/cautious-ppo-baseline/model.zip \
        random \
    --world-seed 42 \
    --n-episodes 20 \
    --degradation-presets clear heavy \
    --export-replay-seed 0 \
    --run-name safety-tradeoff-run
```

Expected tradeoff: cautious agent shows lower collision rate under heavy
degradation at the cost of higher timeout rate and lower action magnitude.

### Run robustness benchmark (Phase 7)

Evaluate agents across multiple degradation presets in one command:

```bash
python scripts/run_benchmark.py \
    --agents heuristic random \
    --world-seed 42 \
    --n-episodes 20 \
    --degradation-presets clear heavy \
    --export-replay-seed 0 \
    --run-name robustness-run
```

Per-preset output goes to `results/leaderboard/<run-name>/<preset>/`.
A combined `robustness_summary.json` and `robustness_summary.csv` are written
to `results/leaderboard/<run-name>/` for cross-preset comparison.

Available presets: `clear` (baseline), `mild` (moderate noise), `heavy` (severe noise + dropout).

### Run tests

```bash
cd python/benchmark
python -m pytest tests/ -v
```

## Web viewer

```bash
npm install
cd apps/web && npm run dev
```

Open `http://localhost:3000` to view the replay viewer.
