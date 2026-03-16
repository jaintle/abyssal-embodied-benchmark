# Product Overview

## What Abyssal is

Abyssal is a focused benchmark for embodied navigation research. It provides a
deterministic procedural underwater world, a Python Gymnasium environment, a
multi-agent evaluation harness, and a browser-based replay viewer — all in a
single self-contained repository.

The benchmark addresses a specific and underserved research question:

> *How does controlled visual degradation affect the safety and performance of
> a learned navigation policy, and can an uncertainty-aware training objective
> recover that robustness?*

---

## Design philosophy

**Benchmark first, simulation second.** The world exists to expose agent
behaviour under known conditions, not to achieve physical realism. Every design
decision is justified by its contribution to measurement quality.

**Determinism over feature count.** All randomness is explicitly seeded. Runs
are reproducible bit-for-bit given the same seeds and checkpoint. Comparisons
between agents are only valid when seeds are held constant — the harness
enforces this automatically.

**Replay over live interaction.** The web viewer renders pre-exported
trajectories rather than running policies live in the browser. This keeps the
demo dependency-free (no Python at runtime), fast, and portable to any static
host.

**Minimal asset surface.** The environment geometry is entirely procedural.
There are no large texture or mesh files to manage. The repository stays small,
loads quickly, and is easy to fork.

---

## Why an underwater world

The underwater metaphor provides a natural and physically motivated frame for
perception degradation. Visibility, turbidity, and noise are well-understood
phenomena in underwater robotics, and they map cleanly onto the three
degradation parameters used here: `visibilityRange`, `noiseScale`, and
`dropoutProb`.

This framing also makes the benchmark visually legible. A viewer who knows
nothing about the underlying math can immediately see that the heavy preset is
harder — the world is darker, noisier, and less predictable.

The underwater frame has no impact on the benchmark mathematics. The
observation space, action space, reward function, and termination conditions
are agnostic to the theme.

---

## Robotics relevance

The benchmark is designed to sit at the intersection of three active research
areas:

**Sim-to-real transfer.** Navigation policies trained in clean simulation
regularly fail when deployed under real sensor degradation. Abyssal provides a
controlled environment for measuring this gap and for training policies that
are explicitly robust to it.

**Uncertainty-aware decision making.** The cautious PPO baseline demonstrates
that a simple visibility signal appended to the observation — combined with a
reward penalty during training — is sufficient to produce qualitatively
different behaviour: the policy learns to reduce its action magnitude when
perception is poor, with no inference-time modification required.

**Safe exploration / robustness benchmarking.** The safety-performance tradeoff
panel shows that robustness is not free. The cautious agent has a lower clear-
condition success rate than the heuristic baseline, and a higher timeout rate.
A benchmark that only measures success rate would miss this tradeoff entirely.

---

## Why a browser-based viewer

Most RL benchmarks ship either a terminal-based log analyser or a heavyweight
training dashboard. Abyssal uses a fully static web app instead, for three
reasons:

**Accessibility.** A browser demo can be shared as a URL. A reader of a paper
or a recruiter reviewing a portfolio can see the benchmark results without
installing any software.

**Reproducibility.** Replay files are a complete record of an episode: every
action, position, and observation index is logged. The viewer renders exactly
what the policy did, not a simulation of it.

**Portability.** The static build deploys to GitHub Pages, Netlify, Vercel, or
any CDN. There is no server, no database, and no authentication to manage.

---

## Reproducibility

Every benchmark run produces a `benchmark_config.json` that records:

- `benchmark_version` and `env_version` — protocol and environment contract versions
- `world_seed` — fully determines obstacle layout, terrain, and goal position
- `episode_seeds` — one per episode, derived deterministically from a base seed
- `degradation_preset` — the noise configuration applied to all agents in the run
- `git_commit` — the exact code version used

A run is reproducible if all fields in `benchmark_config.json` are held
constant across re-runs. Replay files add a further guarantee: the trajectory
exported from a run is an exact record of what the policy did, so visual
verification is always available.

---

## Scope

V1 is deliberately narrow. The following are non-goals:

- Multi-agent joint control
- Continuous action spaces with physics
- Photorealistic rendering
- Online training in the browser
- Cloud training orchestration
- Database or user accounts

The benchmark will be extended in future versions. Extension points are
designed in from the start: the agent adapter interface accepts any `predict()`
implementation, the degradation preset system is parameterised and extensible,
and the replay schema is versioned.
