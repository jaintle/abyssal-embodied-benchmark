# Goal-Directed Heuristic Baseline

**Submission ID:** `example-heuristic-v1`
**Benchmark version:** `1.0.0`
**Algorithm:** Rule-based heuristic (no training)
**Observation space:** standard (38-dim)
**Status:** provisional

---

## What this agent does

A purely rule-based agent that drives full thrust in the direction of the
goal at every timestep. The goal direction vector is read directly from
the standard observation (indices 4–5). No obstacle avoidance, no learning,
no model weights.

This submission demonstrates the complete submission bundle format and
serves as the above-random speed upper-bound baseline in the benchmark.

---

## Reproducing the agent

No training required. The adapter is entirely deterministic.

```bash
# Install benchmark dependencies
pip install -e python/benchmark

# Validate the bundle
export PYTHONPATH=$PWD/python/benchmark/src
python python/benchmark/scripts/validate_submission_bundle.py \
    submissions/example_heuristic

# Check adapter compatibility
python python/benchmark/scripts/check_submission_adapter.py \
    submissions/example_heuristic

# Run official evaluation
python python/benchmark/scripts/evaluate_submission.py \
    --submission-dir submissions/example_heuristic \
    --world-seed 42 \
    --n-episodes 10 \
    --max-steps 200 \
    --degradation-presets clear heavy \
    --output-dir results/submissions
```

---

## Known limitations

- No obstacle avoidance — collides frequently in cluttered worlds
- Performance degrades under heavy degradation due to noisy goal vector
- Action magnitude is always 1.0 (maximum thrust) — no speed modulation

---

## License

MIT
