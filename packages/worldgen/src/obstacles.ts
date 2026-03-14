/**
 * obstacles.ts — Deterministic seeded obstacle placement
 *
 * Rules (enforced):
 *   1. Every obstacle centre lies within worldRadius of origin.
 *   2. No obstacle centre is placed within (goalAcceptanceRadius + maxRadius + GOAL_BUFFER)
 *      of the goal position.
 *   3. No two obstacle centres are placed closer than (r1 + r2) * OVERLAP_FACTOR
 *      (coarse overlap avoidance — not exact collision detection).
 *   4. Placement is 100 % deterministic for a given WorldSpec.
 */

import { type WorldSpec } from "./worldSpec";
import { createRNG } from "./noise";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Extra clearance around the goal beyond its acceptance radius (metres). */
const GOAL_BUFFER = 4.0;

/** Fraction of summed radii used for overlap rejection. */
const OVERLAP_FACTOR = 0.85;

/** Maximum rejection-sampling attempts before giving up on one obstacle. */
const MAX_ATTEMPTS = 64;

/** Obstacle Y position in world space — places them in the navigation channel. */
const OBSTACLE_Y = 0.0;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ObstacleData {
  /** World-space centre position. */
  readonly position: readonly [number, number, number];
  /** Sphere radius (metres). */
  readonly radius: number;
  /** Unique index within the episode (0-based). */
  readonly index: number;
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate obstacle placement data from a WorldSpec.
 *
 * The returned array may have fewer entries than spec.obstacles.count if
 * the rejection sampler could not place all obstacles within MAX_ATTEMPTS.
 * In practice this is rare for default world parameters.
 *
 * @param spec  The world specification.
 * @returns     Array of placed obstacles in seeded order.
 */
export function generateObstacles(spec: WorldSpec): ObstacleData[] {
  const { worldRadius, obstacles, goal } = spec;
  const rng = createRNG(obstacles.obstacleSeed);

  const [gx, _gy, gz] = goal.position;
  const goalExclusionR =
    goal.acceptanceRadius + obstacles.maxRadius + GOAL_BUFFER;

  const placed: ObstacleData[] = [];

  for (let i = 0; i < obstacles.count; i++) {
    let success = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Sample radius
      const radius =
        obstacles.minRadius +
        rng() * (obstacles.maxRadius - obstacles.minRadius);

      // Sample position in XZ disc of (worldRadius - maxRadius)
      const maxR = worldRadius - obstacles.maxRadius;
      const r = Math.sqrt(rng()) * maxR; // sqrt for uniform disc sampling
      const theta = rng() * 2 * Math.PI;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      // Rule 2: goal exclusion
      const dxG = x - gx;
      const dzG = z - gz;
      if (Math.sqrt(dxG * dxG + dzG * dzG) < goalExclusionR) continue;

      // Rule 3: overlap check against already-placed obstacles
      let overlapping = false;
      for (const p of placed) {
        const dxP = x - p.position[0];
        const dzP = z - p.position[2];
        const dist = Math.sqrt(dxP * dxP + dzP * dzP);
        if (dist < (radius + p.radius) * OVERLAP_FACTOR) {
          overlapping = true;
          break;
        }
      }
      if (overlapping) continue;

      // Accept
      placed.push({
        position: [x, OBSTACLE_Y, z] as const,
        radius,
        index: i,
      });
      success = true;
      break;
    }

    if (!success) {
      // Could not place this obstacle; skip and continue
      // (world remains valid — fewer obstacles than requested)
    }
  }

  return placed;
}
