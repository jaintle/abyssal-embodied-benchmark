"""
Smoke tests — Python world generation (Phase 2)

Tests:
  - generate_world() returns a GeneratedWorld with valid fields
  - Same seed → identical world (determinism)
  - Different seeds → different obstacle layouts
  - Obstacles respect world radius
  - Obstacles respect goal exclusion zone
  - Goal position is within world radius
  - Obstacle count ≤ spec.obstacles.count (may be fewer due to rejection)
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from abyssal_benchmark.envs.world_gen import GeneratedWorld, PlacedObstacle, generate_world
from abyssal_benchmark.utils.seeding import derive_seed, make_rng


# ─── World generation ─────────────────────────────────────────────────────────

class TestGenerateWorld:
    def test_returns_generated_world(self):
        w = generate_world(42)
        assert isinstance(w, GeneratedWorld)

    def test_has_spec(self):
        w = generate_world(42)
        assert w.spec is not None
        assert w.spec.worldSeed >= 0

    def test_obstacle_list_type(self):
        w = generate_world(42)
        assert isinstance(w.obstacles, list)
        for obs in w.obstacles:
            assert isinstance(obs, PlacedObstacle)

    def test_obstacle_count_leq_spec(self):
        w = generate_world(42)
        assert len(w.obstacles) <= w.spec.obstacles.count

    def test_goal_within_world_radius(self):
        for seed in [0, 1, 42, 999, 2**20]:
            w = generate_world(seed)
            dist = math.hypot(w.goal_x, w.goal_z)
            assert dist <= w.world_radius, (
                f"Seed {seed}: goal distance {dist:.2f} > worldRadius {w.world_radius}"
            )

    def test_obstacles_within_world_radius(self):
        w = generate_world(42)
        for obs in w.obstacles:
            dist = math.hypot(obs.x, obs.z)
            # obs centre + radius <= worldRadius (may slightly exceed due to
            # placement at worldRadius - maxRadius; we check centre only)
            assert dist <= w.world_radius + 0.1, (
                f"Obstacle {obs.index} centre dist {dist:.2f} exceeds worldRadius"
            )

    def test_goal_exclusion_respected(self):
        w = generate_world(42)
        from abyssal_benchmark.envs.world_gen import _GOAL_BUFFER

        goal_excl = (
            w.spec.goal.acceptanceRadius
            + w.spec.obstacles.maxRadius
            + _GOAL_BUFFER
        )
        for obs in w.obstacles:
            dist = math.hypot(obs.x - w.goal_x, obs.z - w.goal_z)
            assert dist >= goal_excl - 0.01, (
                f"Obstacle {obs.index} is inside goal exclusion zone: dist={dist:.2f}"
            )

    def test_obstacle_radius_in_spec_range(self):
        w = generate_world(42)
        for obs in w.obstacles:
            assert obs.radius >= w.spec.obstacles.minRadius - 1e-9
            assert obs.radius <= w.spec.obstacles.maxRadius + 1e-9


class TestDeterminism:
    def test_same_seed_same_world(self):
        w1 = generate_world(99)
        w2 = generate_world(99)
        assert w1.goal_x == w2.goal_x
        assert w1.goal_z == w2.goal_z
        assert len(w1.obstacles) == len(w2.obstacles)
        for o1, o2 in zip(w1.obstacles, w2.obstacles):
            assert o1.x == pytest.approx(o2.x)
            assert o1.z == pytest.approx(o2.z)
            assert o1.radius == pytest.approx(o2.radius)

    def test_different_seeds_differ(self):
        w1 = generate_world(1)
        w2 = generate_world(2)
        # Goal positions will differ for any two distinct seeds
        assert (w1.goal_x, w1.goal_z) != (w2.goal_x, w2.goal_z)

    def test_determinism_multiple_seeds(self):
        seeds = [0, 7, 13, 42, 100, 65535]
        first_pass = [generate_world(s) for s in seeds]
        second_pass = [generate_world(s) for s in seeds]
        for w1, w2 in zip(first_pass, second_pass):
            assert w1.goal_x == w2.goal_x
            assert w1.goal_z == w2.goal_z
            assert len(w1.obstacles) == len(w2.obstacles)


# ─── Seeding utilities ────────────────────────────────────────────────────────

class TestDeriveSeed:
    def test_non_negative(self):
        for seed in [0, 1, 42, 2**30]:
            result = derive_seed(seed, salt=0)
            assert result >= 0

    def test_deterministic(self):
        a = derive_seed(42, salt=7)
        b = derive_seed(42, salt=7)
        assert a == b

    def test_different_salts_differ(self):
        a = derive_seed(42, salt=1)
        b = derive_seed(42, salt=2)
        assert a != b


class TestMakeRng:
    def test_output_in_range(self):
        rng = make_rng(42)
        for _ in range(200):
            v = rng()
            assert 0.0 <= v <= 1.0

    def test_deterministic_sequence(self):
        r1 = make_rng(100)
        r2 = make_rng(100)
        for _ in range(50):
            assert r1() == r2()

    def test_different_seeds_differ(self):
        r1 = make_rng(1)
        r2 = make_rng(2)
        vals1 = [r1() for _ in range(20)]
        vals2 = [r2() for _ in range(20)]
        assert vals1 != vals2
