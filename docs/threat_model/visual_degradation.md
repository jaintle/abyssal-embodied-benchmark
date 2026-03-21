# Visual Degradation Threat Model

## Purpose

This document characterises how the three degradation presets (`clear`, `mild`,
`heavy`) affect agent performance and what benchmark validity claims they support.

The current degradation model is intentionally abstract and lightweight. The
same conceptual corruption process can later be extended to pixel observations,
depth sensing, or learned state estimators, enabling continuity with more
visually realistic embodied AI benchmarks.

---

## Degradation Mechanisms

### 1. Goal-bearing noise

The goal-relative observation features (`obs[4]` = dx, `obs[5]` = dy, `obs[6]`
= distance) receive additive Gaussian noise with standard deviation `noiseScale`.

Effect on heuristic agent: the heuristic steers by normalising `[dx, dy]`.  At
`noiseScale = 5.0 m` (heavy) and a goal distance of 15 m, the expected angular
error is `arctan(5/15) ≈ 18°`.  Over 200 steps this compounds into large heading
errors, explaining the observed ~67% success-rate drop in the sample run.

### 2. Visibility masking

Obstacle slots beyond `visibilityRange` are zeroed in the observation vector.

Effect: agents that rely on look-ahead collision avoidance become blind to
distant obstacles.  At `visibilityRange = 8 m` (heavy), the agent has only ~1–2
seconds of obstacle awareness at nominal speed.

### 3. Per-slot dropout

Each obstacle feature slot is independently zeroed with probability `dropoutProb`.

Effect: at `dropoutProb = 0.20` (heavy), 20% of obstacle features are missing
per step.  A stationary agent has a ~0.8^k probability that all k slots for a
given obstacle are simultaneously visible, creating intermittent blindness.

---

## What These Presets Measure

| Question | Preset pair |
|---|---|
| Baseline performance | `clear` alone |
| Mild sensor noise tolerance | `clear` vs `mild` |
| Severe degradation robustness | `clear` vs `heavy` |
| Full degradation curve | `clear` + `mild` + `heavy` |

---

## Validity Claims

These presets do **not** claim to model any specific physical underwater sensor.
They are controlled perturbations to the structured observation vector, not
pixel-space or depth-image degradations.

Valid claims supported:
- "Agent X outperforms agent Y at all tested degradation levels."
- "Agent X's success rate drops by Z% under heavy degradation."
- "Policy X is robust to dropout noise; policy Y is not."

Invalid claims:
- "This models sonar at depth D."
- "This matches real turbidity coefficient T."
- "Results transfer to pixel-based perception agents without re-evaluation."

---

## Determinism Guarantee

All degradation is applied deterministically.  The per-step RNG seed is:

```
rng_seed = (episode_seed * 1_000_003 + step) & 0x7FFF_FFFF
```

This means replays are fully reproducible: the same `(episode_seed, step)` pair
always produces the same noise sample, independent of global Python / NumPy RNG
state.  Two agents evaluated on the same episode see identical noise draws,
ensuring fair comparison.
