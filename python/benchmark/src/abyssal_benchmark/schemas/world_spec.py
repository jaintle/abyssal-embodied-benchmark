"""
World Specification Schema — Phase 0 / updated Phase 7

Mirrors packages/worldgen/src/worldSpec.ts exactly.
All field names, types, and semantics must remain in sync with the
TypeScript definition. The contract version is the authoritative lock.
"""

from __future__ import annotations

from typing import Annotated, Literal, Tuple

from pydantic import BaseModel, Field, model_validator

# ─── Benchmark Protocol Version ──────────────────────────────────────────────

BENCHMARK_VERSION: str = "1.0.0"

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


# ─── Degradation ─────────────────────────────────────────────────────────────

DegradationPreset = Literal["clear", "mild", "heavy"]


class DegradationSpec(BaseModel):
    """
    Visual degradation configuration for one benchmark episode.

    Rendering fields (turbidity, causticIntensity) control the browser
    visual presentation.  Observation fields (noiseScale, visibilityRange,
    dropoutProb) directly corrupt the feature vector seen by the agent.

    Mirrors TypeScript DegradationSpec in packages/worldgen/src/worldSpec.ts.
    """

    preset: DegradationPreset = "clear"
    turbidity: Annotated[float, Field(ge=0.0, le=1.0, description="Turbidity coefficient (0-1)")] = 0.0
    visibilityRange: Annotated[float, Field(gt=0.0, description="Max observation range for obstacles (metres)")] = 30.0
    causticIntensity: Annotated[float, Field(ge=0.0, le=1.0, description="Caustic noise intensity (0-1)")] = 0.0
    noiseScale: Annotated[float, Field(ge=0.0, description="Std dev (metres) of Gaussian noise on positional features")] = 0.0
    dropoutProb: Annotated[float, Field(ge=0.0, le=1.0, description="Per-slot obstacle dropout probability")] = 0.0


# ─── Named Preset Catalogue ──────────────────────────────────────────────────

DEGRADATION_PRESETS: dict = {
    "clear": DegradationSpec(
        preset="clear",
        turbidity=0.00,
        visibilityRange=30.0,
        causticIntensity=0.00,
        noiseScale=0.00,
        dropoutProb=0.00,
    ),
    "mild": DegradationSpec(
        preset="mild",
        turbidity=0.30,
        visibilityRange=18.0,
        causticIntensity=0.10,
        noiseScale=1.50,
        dropoutProb=0.00,
    ),
    # Phase 9 calibration (2026-03-16): empirically validated via tune_degradation.py
    # against the demo-20260315-182713 PPO model, 25 episodes, world_seed=42.
    #
    # Chosen candidate: vis=12.5 / noise=2.3 / drop=0.10 → PPO 44% success.
    # This lands in the 30–50% target band, giving meaningful differentiation
    # between agents:
    #   heuristic ~100%  (goal-direction only, immune to obs noise)
    #   ppo       ~44%
    #   cautious_ppo  ~TBD (expects ~30-40%)
    #   random      0%
    #
    # Original Phase 7 values (vis=8, noise=5, drop=0.20) produced PPO=10% —
    # too harsh for meaningful comparison.
    "heavy": DegradationSpec(
        preset="heavy",
        turbidity=0.65,
        visibilityRange=12.5,
        causticIntensity=0.25,
        noiseScale=2.30,
        dropoutProb=0.10,
    ),
}


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

def generate_world_spec(
    seed: int,
    degradation_preset: str = "clear",
    **overrides: object,
) -> WorldSpec:
    """
    Generate a fully-populated WorldSpec from a single integer seed.

    Mirrors generateWorldSpec() in packages/worldgen/src/worldSpec.ts.

    Args:
        seed:               Integer world seed (any non-negative 32-bit integer).
        degradation_preset: Named degradation preset ("clear", "mild", "heavy").
                            Defaults to "clear" (no degradation).
        **overrides:        Keyword overrides applied after deterministic generation.
                            Top-level fields only; nested structures must be replaced
                            as complete sub-model instances.

    Returns:
        A fully validated WorldSpec.
    """
    if degradation_preset not in DEGRADATION_PRESETS:
        raise ValueError(
            f"Unknown degradation_preset '{degradation_preset}'. "
            f"Valid options: {list(DEGRADATION_PRESETS)}"
        )

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
        "degradation": DEGRADATION_PRESETS[degradation_preset],
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
