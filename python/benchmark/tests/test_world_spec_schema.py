"""
Smoke tests — WorldSpec schema (Phase 0)

Tests:
  - minimal valid WorldSpec roundtrips without error
  - generate_world_spec() is deterministic
  - obstacle seed is deterministically derived from world seed
  - goal position is deterministically derived from world seed
  - validate_world_spec() accepts valid dicts
  - validate_world_spec() rejects dicts with missing required fields
  - validate_world_spec() rejects dicts with out-of-range values
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make the src package importable when running pytest from the repo root
_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from pydantic import ValidationError

from abyssal_benchmark.schemas.world_spec import (
    BENCHMARK_VERSION,
    DegradationSpec,
    GoalSpec,
    ObstacleSpec,
    TerrainSpec,
    WorldSpec,
    generate_world_spec,
    validate_world_spec,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _minimal_obstacle() -> dict:
    return {"obstacleSeed": 42, "count": 5, "minRadius": 0.5, "maxRadius": 2.0}


def _minimal_goal() -> dict:
    return {"position": [10.0, 2.0, 15.0], "acceptanceRadius": 1.5}


def _minimal_valid_dict() -> dict:
    return {
        "benchmarkVersion": BENCHMARK_VERSION,
        "worldSeed": 1234,
        "worldRadius": 50.0,
        "terrain": {
            "noiseScale": 0.05,
            "amplitude": 4.0,
            "octaves": 4,
            "persistence": 0.5,
            "lacunarity": 2.0,
        },
        "obstacles": _minimal_obstacle(),
        "goal": _minimal_goal(),
        "degradation": {
            "preset": "clear",
            "turbidity": 0.0,
            "visibilityRange": 30.0,
            "causticIntensity": 0.0,
        },
    }


# ─── Tests ─────────────────────────────────────────────────────────────────────

class TestWorldSpecMinimalValid:
    def test_validate_accepts_minimal_valid_dict(self):
        spec = validate_world_spec(_minimal_valid_dict())
        assert isinstance(spec, WorldSpec)

    def test_world_seed_preserved(self):
        spec = validate_world_spec(_minimal_valid_dict())
        assert spec.worldSeed == 1234

    def test_benchmark_version_preserved(self):
        spec = validate_world_spec(_minimal_valid_dict())
        assert spec.benchmarkVersion == BENCHMARK_VERSION

    def test_terrain_fields(self):
        spec = validate_world_spec(_minimal_valid_dict())
        assert spec.terrain.noiseScale == pytest.approx(0.05)
        assert spec.terrain.octaves == 4

    def test_obstacle_fields(self):
        spec = validate_world_spec(_minimal_valid_dict())
        assert spec.obstacles.count == 5
        assert spec.obstacles.obstacleSeed == 42

    def test_goal_position(self):
        spec = validate_world_spec(_minimal_valid_dict())
        x, y, z = spec.goal.position
        assert y == pytest.approx(2.0)

    def test_degradation_preset(self):
        spec = validate_world_spec(_minimal_valid_dict())
        assert spec.degradation.preset == "clear"


class TestWorldSpecMissingFields:
    def test_missing_world_seed_raises(self):
        data = _minimal_valid_dict()
        del data["worldSeed"]
        with pytest.raises(ValidationError) as exc_info:
            validate_world_spec(data)
        errors = exc_info.value.errors()
        fields = [e["loc"] for e in errors]
        assert any("worldSeed" in loc for loc in fields)

    def test_missing_obstacles_raises(self):
        data = _minimal_valid_dict()
        del data["obstacles"]
        with pytest.raises(ValidationError):
            validate_world_spec(data)

    def test_missing_goal_raises(self):
        data = _minimal_valid_dict()
        del data["goal"]
        with pytest.raises(ValidationError):
            validate_world_spec(data)

    def test_missing_obstacle_seed_raises(self):
        data = _minimal_valid_dict()
        del data["obstacles"]["obstacleSeed"]
        with pytest.raises(ValidationError):
            validate_world_spec(data)


class TestWorldSpecInvalidValues:
    def test_negative_world_seed_raises(self):
        data = _minimal_valid_dict()
        data["worldSeed"] = -1
        with pytest.raises(ValidationError):
            validate_world_spec(data)

    def test_zero_world_radius_raises(self):
        data = _minimal_valid_dict()
        data["worldRadius"] = 0.0
        with pytest.raises(ValidationError):
            validate_world_spec(data)

    def test_obstacle_radius_inversion_raises(self):
        data = _minimal_valid_dict()
        data["obstacles"]["minRadius"] = 5.0
        data["obstacles"]["maxRadius"] = 1.0
        with pytest.raises(ValidationError):
            validate_world_spec(data)

    def test_turbidity_out_of_range_raises(self):
        data = _minimal_valid_dict()
        data["degradation"]["turbidity"] = 1.5
        with pytest.raises(ValidationError):
            validate_world_spec(data)

    def test_unknown_degradation_preset_raises(self):
        data = _minimal_valid_dict()
        data["degradation"]["preset"] = "ultrablack"
        with pytest.raises(ValidationError):
            validate_world_spec(data)


class TestGenerateWorldSpec:
    def test_returns_world_spec(self):
        spec = generate_world_spec(42)
        assert isinstance(spec, WorldSpec)

    def test_deterministic_same_seed(self):
        spec_a = generate_world_spec(999)
        spec_b = generate_world_spec(999)
        assert spec_a.model_dump() == spec_b.model_dump()

    def test_different_seeds_differ(self):
        spec_a = generate_world_spec(1)
        spec_b = generate_world_spec(2)
        assert spec_a.worldSeed != spec_b.worldSeed

    def test_obstacle_seed_derived_from_world_seed(self):
        spec = generate_world_spec(12345)
        # obstacle seed must differ from world seed (it's derived, not copied)
        assert spec.obstacles.obstacleSeed != spec.worldSeed

    def test_goal_position_within_world_radius(self):
        import math

        for seed in [0, 1, 42, 99999, 2**30 - 1]:
            spec = generate_world_spec(seed)
            x, _y, z = spec.goal.position
            dist_xz = math.sqrt(x**2 + z**2)
            assert dist_xz <= spec.worldRadius, (
                f"Seed {seed}: goal XZ distance {dist_xz:.2f} "
                f"exceeds worldRadius {spec.worldRadius}"
            )

    def test_benchmark_version_set(self):
        spec = generate_world_spec(0)
        assert spec.benchmarkVersion == BENCHMARK_VERSION

    def test_override_applied(self):
        custom_degradation = DegradationSpec(
            preset="heavy",
            turbidity=0.8,
            visibilityRange=10.0,
            causticIntensity=0.3,
        )
        spec = generate_world_spec(7, degradation=custom_degradation)
        assert spec.degradation.preset == "heavy"
