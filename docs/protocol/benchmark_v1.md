# Benchmark Protocol v1

Version: 0.1.0

## Overview

The Abyssal benchmark evaluates embodied navigation agents in a deterministic
procedural underwater world.  Multiple agents are compared on the **identical**
set of episode seeds.  Results are saved as a structured artifact bundle.

---

## Identical Seed Comparison Rule

All agents in a benchmark run share:

- `world_seed` — determines obstacle layout and goal position (fixed across all
  episodes for a given run)
- `episode_seeds` — derived as `derive_seed(base_episode_seed, i)` for
  `i in 0..n_episodes-1`
- `max_steps` — hard truncation limit per episode

Comparisons between agents are only valid when all three parameters are held
constant.  The `benchmark_config.json` artifact records the exact values used.

---

## Output Bundle Format

A benchmark run produces a directory with the following artifacts:

```
<output_dir>/
    benchmark_config.json      # run parameters
    aggregate_summary.csv      # one row per agent
    aggregate_summary.json     # same data, structured
    per_episode.csv            # one row per (agent_id, episode_seed)
    replays/                   # optional: one JSONL replay per agent
```

### `benchmark_config.json`

```json
{
  "benchmark_version": "0.1.0",
  "env_version": "0.1.0",
  "world_seed": 42,
  "episode_seeds": [1028, 2049, ...],
  "n_episodes": 20,
  "max_steps": 500,
  "agent_ids": ["heuristic", "ppo"],
  "recorded_at": "2026-03-15T12:00:00Z",
  "git_commit": "abc123"
}
```

### `aggregate_summary.csv` / `aggregate_summary.json`

One row per agent.  Columns:

| Column | Description |
|---|---|
| `agent_id` | Policy identifier string |
| `world_seed` | World seed used |
| `n_episodes` | Number of episodes evaluated |
| `success_rate` | Fraction of episodes reaching the goal |
| `collision_rate` | Fraction of episodes ending in collision |
| `timeout_rate` | Fraction of episodes truncated by max_steps |
| `oob_rate` | Fraction of episodes truncated out-of-bounds |
| `mean_reward` | Mean total episode reward |
| `std_reward` | Std dev of total episode reward |
| `mean_steps` | Mean episode length (steps) |
| `std_steps` | Std dev of episode length |
| `mean_final_dist` | Mean distance to goal at episode end |
| `std_final_dist` | Std dev of final distance |

### `per_episode.csv`

One row per `(agent_id, episode_seed)`.  Columns:

`agent_id`, `episode_index`, `episode_seed`, `world_seed`, `total_reward`,
`steps`, `final_dist`, `goal_reached`, `collision`, `timed_out`,
`out_of_bounds`, `elapsed_seconds`

### Replay files

When `--export-replay-seed <seed>` is passed, one JSONL replay is written per
agent for the episode with that seed:

```
replays/replay_<agent_id>_seed_<seed>.jsonl
```

The format follows the shared replay schema (see
`packages/replay-schema/src/replaySchema.ts`).

---

## Agent Adapter Concept

Any agent evaluated by `BenchmarkRunner` must implement the `BenchmarkAgent`
interface (see `agents/base.py`):

```python
class BenchmarkAgent(ABC):
    def get_policy_id(self) -> str: ...
    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray: ...
    def reset(self) -> None: ...   # called at episode start; no-op for stateless agents
```

Built-in agents:

| Agent | Class | Notes |
|---|---|---|
| `random` | `RandomAgent` | Uniform random actions; lower-bound baseline |
| `heuristic` | `HeuristicAgent` | Full thrust toward goal; no obstacle avoidance |
| `ppo:<path>` | `PPOAgent` | SB3 PPO loaded from checkpoint |

---

## Metrics

| Metric | Definition |
|---|---|
| Success rate | `goal_reached` fraction |
| Collision rate | `collision` fraction |
| Timeout rate | `timed_out` fraction |
| OOB rate | `out_of_bounds` fraction |
| Mean reward | Mean total undiscounted reward per episode |
| Mean steps | Mean episode length |
| Mean final dist | Mean distance to goal at episode termination |

---

## Degradation Presets (Phase 7)

All benchmark runs include a `degradation_preset` field in the config.  Three
named presets are supported:

| Preset | Turbidity | Visibility | Noise σ | Dropout |
|---|---|---|---|---|
| `clear` | 0.00 | 30 m | 0.0 m | 0.00 |
| `mild`  | 0.30 | 18 m | 1.5 m | 0.00 |
| `heavy` | 0.70 |  8 m | 5.0 m | 0.20 |

**Observation degradation** is applied to the structured feature vector after
environment stepping.  The corruption is deterministic per `(episode_seed, step)`
so replays are fully reproducible.

- Goal-relative features (`obs[4:6]`) receive additive Gaussian noise (σ = `noiseScale`).
- Per-obstacle distance features are zeroed when the obstacle exceeds `visibilityRange`.
- Per-obstacle feature slots are independently zeroed with probability `dropoutProb`.

### Multi-preset output layout

```
<run-name>/
    robustness_summary.csv     # all agents × all presets
    robustness_summary.json
    clear/
        benchmark_config.json
        aggregate_summary.json
        replays/
    heavy/
        benchmark_config.json
        aggregate_summary.json
        replays/
```

### `robustness_summary.json`

Flat array of rows with the full `AgentBenchmarkSummary` fields plus
`degradation_preset`:

```json
[
  { "agent_id": "heuristic", "degradation_preset": "clear", "success_rate": 1.0, ... },
  { "agent_id": "heuristic", "degradation_preset": "heavy", "success_rate": 0.33, ... }
]
```

---

## Determinism Guarantees

- World geometry is fixed by `world_seed` at environment construction.
- Episode seeds are derived deterministically using `derive_seed`.
- All agents call `agent.reset()` at episode start so stateful agents start clean.
- Random baselines use `np.random.default_rng(seed)` seeded per agent instance.
- Observation degradation RNG is seeded as `(episode_seed * 1_000_003 + step) & 0x7FFF_FFFF`,
  ensuring reproducibility independent of global Python / NumPy state.

---

## Uncertainty Signal and Cautious Baseline (Phase 8)

### Uncertainty observation signal

When `uncertainty_obs=True` on `AbyssalNavigationEnv`, the observation
vector is extended from 40 → 41 dimensions.  The new scalar at `obs[40]`
is the **visibility quality**:

| Preset | `visibility_quality` |
|---|---|
| `clear` | 1.0 |
| `mild`  | 0.6 |
| `heavy` | 0.2 |

This signal is:
- deterministic and constant within an episode
- derived purely from the degradation preset name
- backward-compatible: standard PPO runs with `uncertainty_obs=False` (40-dim obs) unchanged

### Cautious baseline design

`CautiousAgent` is a PPO model trained with:

1. `uncertainty_obs=True` — the policy sees `visibility_quality` and can condition on it
2. `CautiousRewardWrapper` — adds a reward penalty during training:

```
r_total = r_env  −  caution_coeff × (1 − visibility_quality) × ‖action‖²
```

Default `caution_coeff = 0.3`.  This teaches the policy to take smaller
actions when visibility is poor.  No inference-time scaling is applied — the
conservative behaviour is fully encoded in the trained weights.

The `cautious_ppo:<path>` agent specifier in `run_benchmark.py` automatically:
- sets `uncertainty_obs=True` on the evaluation env
- loads the checkpoint with the correct obs shape (41-dim)

### Safety-performance tradeoff metrics

`mean_action_magnitude` is now recorded per agent per episode (L2 norm of
the action vector, averaged over steps).  This metric directly shows
behavioural conservatism:

- `heuristic`: ~0.88 (always near-maximum thrust)
- `ppo`:       ~0.70 (learned to modulate)
- `cautious_ppo`: ~0.50 clear / ~0.31 heavy (significantly reduced under degradation)

The tradeoff framing:

| Agent | clear succ | heavy succ | heavy coll | speed |
|---|---|---|---|---|
| heuristic | 100% | 33% | 33% | 0.88 |
| cautious_ppo | 67% | 67% | 0% | 0.50 / 0.31 |
| random | 0% | 0% | 0% | 0.57 |

Cautious agent sacrifices some clear-condition performance for robustness:
- 0% collision even under heavy degradation
- Action magnitude reduces automatically as visibility degrades
- Higher timeout rate (accepts slower approach)
