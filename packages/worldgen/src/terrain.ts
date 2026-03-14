/**
 * terrain.ts — Seabed terrain height grid generation
 *
 * Converts a WorldSpec into a flat array of height values suitable
 * for constructing a Three.js BufferGeometry or any other mesh consumer.
 *
 * Coordinate conventions:
 *   - The grid covers a 2*worldRadius × 2*worldRadius area centred at origin.
 *   - heights[row * resolution + col] is the height at world position:
 *       x = -worldRadius + col  * (2*worldRadius / (resolution - 1))
 *       z = -worldRadius + row  * (2*worldRadius / (resolution - 1))
 *   - Heights are in [-amplitude/2, +amplitude/2] (world metres).
 *     The rendering layer adds a base depth offset to position the seabed.
 */

import { type WorldSpec } from "./worldSpec";
import { fbm2D } from "./noise";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerrainGrid {
  /** Full world-space width of the grid (= 2 * worldRadius, metres). */
  readonly width: number;
  /** Full world-space depth of the grid (= 2 * worldRadius, metres). */
  readonly depth: number;
  /** Number of sample points along each axis (square grid). */
  readonly resolution: number;
  /**
   * Row-major flat array of height values in metres.
   * Length = resolution * resolution.
   * Range = [-amplitude/2, +amplitude/2].
   */
  readonly heights: Float32Array;
}

// ─── Generator ────────────────────────────────────────────────────────────────

/** Default terrain resolution (sample points per axis). */
export const DEFAULT_TERRAIN_RESOLUTION = 64;

/**
 * Generate a terrain height grid from a WorldSpec.
 *
 * @param spec        The world specification.
 * @param resolution  Number of sample points per axis (default 64).
 *                    Must be ≥ 2.
 * @returns           A TerrainGrid ready for mesh construction.
 */
export function generateTerrainGrid(
  spec: WorldSpec,
  resolution: number = DEFAULT_TERRAIN_RESOLUTION
): TerrainGrid {
  if (resolution < 2) {
    throw new RangeError(`terrain resolution must be ≥ 2, got ${resolution}`);
  }

  const { worldRadius, terrain, worldSeed } = spec;
  const size = 2 * worldRadius; // total extent (metres)
  const step = size / (resolution - 1);
  const amp = terrain.amplitude;

  const heights = new Float32Array(resolution * resolution);

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const wx = -worldRadius + col * step;
      const wz = -worldRadius + row * step;

      // fBM noise → [0, 1)
      const raw = fbm2D(wx, wz, worldSeed, {
        noiseScale: terrain.noiseScale,
        octaves: terrain.octaves,
        persistence: terrain.persistence,
        lacunarity: terrain.lacunarity,
      });

      // Centre heights around 0 so they're symmetric around the base depth
      heights[row * resolution + col] = (raw - 0.5) * amp;
    }
  }

  return { width: size, depth: size, resolution, heights };
}
