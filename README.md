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
