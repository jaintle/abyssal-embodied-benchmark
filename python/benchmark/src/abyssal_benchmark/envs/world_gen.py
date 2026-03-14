"""
world_gen.py — Python-side deterministic world generation

Mirrors the TypeScript obstacle placement in packages/worldgen/src/obstacles.ts
so that Python and browser worlds share the same high-level layout for a given
seed. The terrain mesh is not reproduced (it is rendering-only); obstacles and
goal are the semantically load-bearing components.

The main entry point is generate_world(seed) → GeneratedWorld.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Tuple

from ..schemas.world_spec import WorldSpec, generate_world_spec
from ..utils.seeding import make_rng

# ─── Constants — mirror obstacles.ts ─────────────────────────────────────────

_GOAL_BUFFER: float = 4.0       # extra clearance around goal (metres)
_OVERLAP_FACTOR: float = 0.85   # fraction of summed radii for overlap rejection
_MAX_ATTEMPTS: int = 64         # rejection-sampling attempts per obstacle

# ─── Data types ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PlacedObstacle:
    """A single placed obstacle in the 2-D navigation plane (XZ)."""

    x: float
    """World-space X centre (metres)."""

    z: float
    """World-space Z centre (metres)."""

    radius: float
    """Sphere radius (metres) — same radius used for collision in 2-D."""

    index: int
    """Zero-based placement order (determines RNG sequence)."""


@dataclass(frozen=True)
class GeneratedWorld:
    """
    Complete semantic description of one benchmark episode world.

    This object is consumed by the Gymnasium environment; it contains
    everything needed for reset, step, reward, and termination logic.
    """

    spec: WorldSpec
    """Full world specification (seed, terrain params, etc.)."""

    obstacles: List[PlacedObstacle]
    """Deterministically placed obstacles in XZ plane."""

    goal_x: float
    """Goal X position (metres)."""

    goal_z: float
    """Goal Z position (metres)."""

    goal_acceptance_radius: float
    """Agent must come within this radius to complete the episode (metres)."""

    world_radius: float
    """Cylindrical world boundary radius (metres)."""

    spawn_x: float = 0.0
    """Agent spawn X position (metres). Default: world centre."""

    spawn_z: float = 0.0
    """Agent spawn Z position (metres). Default: world centre."""


# ─── Obstacle placement ───────────────────────────────────────────────────────


def _place_obstacles(spec: WorldSpec) -> List[PlacedObstacle]:
    """
    Place obstacles deterministically from spec.obstacles.obstacleSeed.

    Mirrors generateObstacles() in packages/worldgen/src/obstacles.ts:
      - All centres inside worldRadius.
      - No centre within (acceptanceRadius + maxRadius + GOAL_BUFFER) of goal.
      - No two centres overlap (coarse: dist < (r1 + r2) * OVERLAP_FACTOR).
      - Deterministic for the same seed.
    """
    rng = make_rng(spec.obstacles.obstacleSeed)

    gx, _gy, gz = spec.goal.position
    goal_excl_r = (
        spec.goal.acceptanceRadius + spec.obstacles.maxRadius + _GOAL_BUFFER
    )
    max_place_r = spec.worldRadius - spec.obstacles.maxRadius

    placed: List[PlacedObstacle] = []

    for i in range(spec.obstacles.count):
        for _ in range(_MAX_ATTEMPTS):
            # Sample radius
            radius = spec.obstacles.minRadius + rng() * (
                spec.obstacles.maxRadius - spec.obstacles.minRadius
            )
            # Uniform disc via sqrt for uniform area distribution
            r = math.sqrt(rng()) * max_place_r
            theta = rng() * 2 * math.pi
            x = r * math.cos(theta)
            z = r * math.sin(theta)

            # Goal exclusion
            if math.hypot(x - gx, z - gz) < goal_excl_r:
                continue

            # Overlap check
            overlapping = False
            for p in placed:
                if math.hypot(x - p.x, z - p.z) < (radius + p.radius) * _OVERLAP_FACTOR:
                    overlapping = True
                    break
            if overlapping:
                continue

            placed.append(PlacedObstacle(x=x, z=z, radius=radius, index=i))
            break
        # If MAX_ATTEMPTS exhausted, obstacle is skipped — world still valid

    return placed


# ─── Public API ───────────────────────────────────────────────────────────────


def generate_world(seed: int) -> GeneratedWorld:
    """
    Generate a complete world description from an integer seed.

    This is the primary factory used by the Gymnasium environment on reset.

    Args:
        seed: Non-negative integer world seed.

    Returns:
        A GeneratedWorld ready for the navigation environment.
    """
    spec = generate_world_spec(seed)
    obstacles = _place_obstacles(spec)

    gx, _gy, gz = spec.goal.position

    return GeneratedWorld(
        spec=spec,
        obstacles=obstacles,
        goal_x=gx,
        goal_z=gz,
        goal_acceptance_radius=spec.goal.acceptanceRadius,
        world_radius=spec.worldRadius,
        spawn_x=0.0,
        spawn_z=0.0,
    )
