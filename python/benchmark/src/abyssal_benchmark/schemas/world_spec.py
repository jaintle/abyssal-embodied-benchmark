"""
World Specification Schema — Phase 0 (Python mirror)

Mirrors packages/worldgen/src/worldSpec.ts exactly.
All field names, types, and semantics must remain in sync with the
TypeScript definition. The contract version is the authoritative lock.
"""

from __future__ import annotations

from typing import Annotated, Literal, Tuple

from pydantic import BaseModel, Field, model_validator

# ─── Benchmark Protocol Version ──────────────────────────────────────────────

BENCHMARK_VERSION: str = "0.1.0"

# ─── Sub-models ───────────────────────────────────────────────────────────────


class TerrainSpec(BaseModel):
    """Procedural terrain generation parameters."""

    noiseScale: Annotated[float, Field(gt=0.0, description="Noise pattern scale; higher = wider features")] = 0.05
    amplitude: Annotated[float, Field(gt=0.0, description="Maximum vertical displacement (metres)")] = 4.0
    octaves: Annotated[int, Field(ge=1, le=16, description="Fractal noise octave count")] = 4
    persistence: Annotated[float, Field(gt=0.0, le=1.0, description="Amplitude decay per octave")] = 0.5
    lacunarity: Annotated[float, Field(gt=1.0, description="Frequency growth per octave")] = 2.0


class ObstacleSpec(BaseModel):
    """Obstacle placement parameters."""

    obstacleSeed: Annotated[int, Field(ge=0, description="Seed for deterministic obstacle placement")]
    count: Annotated[int, Field(ge=0, description="Number of obstacles in the world")] = 12
    minRadius: Annotated[float, Field(gt=0.0, description="Minimum spherical obstacle radius (metres)")] = 0.5
    maxRadius: Annotated[float, Field(gt=0.0, description="Maximum spherical obstacle radius (metres)")] = 2.5

    @model_validator(mode="after")
    def validate_radius_range(self) -> "ObstacleSpec":
        if self.maxRadius < self.minRadius:
            raise ValueError(
                f"maxRadius ({self.maxRadius}) must be >= minRadius ({self.minRadius})"
            )
        return self


# Position type alias: 3-tuple of floats [x, y, z]
Position3 = Tuple[float, float, float]


class GoalSpec(BaseModel):
    """Goal / target specification."""

    position: Annotated[Position3, Field(description="Goal position in world coordinates [x, y, z]")]
    acceptanceRadius: Annotated[float, Field(gt=0.0, description="Acceptance zone radius (metres)")] = 1.5


DegradationPreset = Literal[
    "none",
    "low_turbidity",
    "high_turbidity",
    "caustic_noise",
    "low_visibility",
]


class DegradationSpec(BaseModel):
    """Visual degradation configuration for one benchmark episode."""

    preset: DegradationPreset = "none"
    turbidity: Annotated[float, Field(ge=0.0, le=1.0, description="Turbidity coefficient (0–1)")] = 0.0
    visibilityRange: Annotated[float, Field(gt=0.0, description="Maximum visibility range (metres)")] = 30.0
    causticIntensity: Annotated[float, Field(ge=0.0, le=1.0, description="Caustic noise intensity (0–1)")] = 0.0


# ─── Root World Spec ──────────────────────────────────────────────────────────


class WorldSpec(BaseModel):
    """
    Complete world specification.

    This is the single source of truth for a benchmark episode.
    Given the same WorldSpec, both the browser renderer and the Python
    Gymnasium environment must produce identical geometry and initial conditions.
    """

    benchmarkVersion: str = BENCHMARK_VERSION
    worldSeed: Annotated[int, Field(ge=0, description="Primary seed for reproducible world generation")]
    worldRadius: Annotated[float, Field(gt=0.0, description="World boundary cylinder radius (metres)")] = 50.0
    terrain: TerrainSpec = Field(default_factory=TerrainSpec)
    obstacles: ObstacleSpec
    goal: GoalSpec
    degradation: DegradationSpec = Field(default_factory=DegradationSpec)


# ─── Deterministic Seed Derivation ───────────────────────────────────────────

def _derive_child_seed(parent_seed: int, salt: int) -> int:
    """
    Derive a child seed from a parent seed + salt integer.

    Must be kept byte-for-byte equivalent to the TypeScript implementation in
    packages/worldgen/src/worldSpec.ts :: deriveChildSeed().
    """
    UINT32_MAX = 0xFFFF_FFFF
    a = ((parent_seed ^ (parent_seed >> 16)) * 0x45D9F3B) & UINT32_MAX
    b = (a ^ (a >> 16)) * ((salt + 0x9E3779B9) & UINT32_MAX) & UINT32_MAX
    return ((b ^ (b >> 16)) & UINT32_MAX) % (2 ** 31)


def _derive_goal_position(world_seed: int, world_radius: float) -> Position3:
    """
    Deterministically derive a goal position from the world seed.

    Must stay identical to deriveGoalPosition() in worldSpec.ts.
    """
    import math

    goal_seed = _derive_child_seed(world_seed, 2)
    t = (goal_seed % 10_000) / 10_000.0
    r = world_radius * (0.6 + t * 0.25)
    angle = t * 2 * math.pi
    x = round(r * math.cos(angle) * 100) / 100
    z = round(r * math.sin(angle) * 100) / 100
    y = 2.0
    return (x, y, z)


# ─── Public Generator ─────────────────────────────────────────────────────────

def generate_world_spec(seed: int, **overrides: object) -> WorldSpec:
    """
    Generate a fully-populated WorldSpec from a single integer seed.

    Mirrors generateWorldSpec() in packages/worldgen/src/worldSpec.ts.

    Args:
        seed:      Integer world seed (any non-negative 32-bit integer).
        **overrides: Keyword overrides applied after deterministic generation.
                     Top-level fields only; nested structures must be replaced
                     as complete sub-model instances.

    Returns:
        A fully validated WorldSpec.
    """
    world_seed = seed & 0x7FFF_FFFF  # clamp to 31-bit unsigned
    obstacle_seed = _derive_child_seed(world_seed, 1)
    goal_position = _derive_goal_position(world_seed, 50.0)

    data: dict = {
        "benchmarkVersion": BENCHMARK_VERSION,
        "worldSeed": world_seed,
        "worldRadius": 50.0,
        "terrain": TerrainSpec(),
        "obstacles": ObstacleSpec(obstacleSeed=obstacle_seed),
        "goal": GoalSpec(position=goal_position),
        "degradation": DegradationSpec(),
        **overrides,
    }
    return WorldSpec.model_validate(data)


# ─── Validation Helpers ───────────────────────────────────────────────────────

def validate_world_spec(data: dict) -> WorldSpec:
    """
    Validate a raw dictionary against the WorldSpec schema.

    Raises:
        pydantic.ValidationError: if validation fails, with structured
            field-level error messages.

    Returns:
        A validated WorldSpec instance.
    """
    return WorldSpec.model_validate(data)
