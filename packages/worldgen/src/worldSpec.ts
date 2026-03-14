/**
 * World Specification Contract — Phase 0
 *
 * Defines the deterministic world description schema shared between the
 * browser renderer and the Python benchmark environment.
 *
 * ALL world generation must be seeded and reproducible from WorldSpec alone.
 */

// ─── Benchmark Protocol Version ──────────────────────────────────────────────

export const BENCHMARK_VERSION = "0.1.0" as const;

// ─── Sub-specs ────────────────────────────────────────────────────────────────

/**
 * Procedural terrain generation parameters.
 * Controls the shape of the underwater floor via noise-based heightmaps.
 */
export interface TerrainSpec {
  /** Scale of the noise pattern; higher = wider features */
  noiseScale: number;
  /** Maximum vertical displacement of terrain (metres) */
  amplitude: number;
  /** Number of octaves for fractal noise layering */
  octaves: number;
  /** Persistence factor controlling amplitude decay per octave */
  persistence: number;
  /** Lacunarity factor controlling frequency growth per octave */
  lacunarity: number;
}

/**
 * Obstacle placement parameters.
 * All obstacle positions are deterministically derived from obstacleSeed.
 */
export interface ObstacleSpec {
  /** Seed used to deterministically place obstacles */
  obstacleSeed: number;
  /** Number of obstacles to generate in the world */
  count: number;
  /** Minimum radius of a spherical obstacle (metres) */
  minRadius: number;
  /** Maximum radius of a spherical obstacle (metres) */
  maxRadius: number;
}

/**
 * Goal (target) specification.
 * The agent must navigate to this position to complete an episode.
 */
export interface GoalSpec {
  /** Goal position in world coordinates [x, y, z] */
  position: [number, number, number];
  /** Radius of the goal acceptance zone (metres) */
  acceptanceRadius: number;
}

/**
 * Visual degradation preset applied to the agent's observations.
 * Used to benchmark robustness under perceptual noise.
 */
export type DegradationPreset =
  | "none"
  | "low_turbidity"
  | "high_turbidity"
  | "caustic_noise"
  | "low_visibility";

/**
 * Full degradation configuration for one benchmark episode.
 */
export interface DegradationSpec {
  /** Named preset controlling which degradation pipeline to activate */
  preset: DegradationPreset;
  /** Turbidity coefficient — higher = more scattering (0–1) */
  turbidity: number;
  /** Maximum visibility range (metres) */
  visibilityRange: number;
  /** Caustic noise intensity (0–1) */
  causticIntensity: number;
}

// ─── Root World Spec ──────────────────────────────────────────────────────────

/**
 * Complete world specification.
 *
 * This is the single source of truth for a benchmark episode.
 * Given the same WorldSpec, both the browser renderer and the
 * Python Gymnasium environment must produce identical geometry and
 * identical initial conditions.
 */
export interface WorldSpec {
  /** Semantic version of the benchmark contract */
  benchmarkVersion: string;

  /** Primary seed for reproducible world generation */
  worldSeed: number;

  /** Radius of the cylindrical world boundary (metres) */
  worldRadius: number;

  /** Terrain generation parameters */
  terrain: TerrainSpec;

  /** Obstacle generation parameters (seed derived from worldSeed) */
  obstacles: ObstacleSpec;

  /** Goal / target specification */
  goal: GoalSpec;

  /** Visual degradation applied to observations */
  degradation: DegradationSpec;
}

// ─── Default Ranges (for generation) ─────────────────────────────────────────

const DEFAULTS = {
  worldRadius: 50,
  terrain: {
    noiseScale: 0.05,
    amplitude: 4.0,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0,
  },
  obstacles: {
    count: 12,
    minRadius: 0.5,
    maxRadius: 2.5,
  },
  goal: {
    acceptanceRadius: 1.5,
  },
  degradation: {
    preset: "none" as DegradationPreset,
    turbidity: 0.0,
    visibilityRange: 30.0,
    causticIntensity: 0.0,
  },
} as const;

// ─── Deterministic Seed Derivation ───────────────────────────────────────────

/**
 * Derive a child seed from a parent seed + a salt integer.
 * Uses a simple multiplicative hash that fits within safe integer range.
 * This must be kept identical in the Python mirror.
 */
function deriveChildSeed(parentSeed: number, salt: number): number {
  // xorshift-inspired mixing — stays deterministic and integer-safe
  const a = (parentSeed ^ (parentSeed >>> 16)) * 0x45d9f3b;
  const b = (a ^ (a >>> 16)) * (salt + 0x9e3779b9);
  return ((b ^ (b >>> 16)) >>> 0) % 2 ** 31;
}

/**
 * Deterministically place a goal position within the world radius.
 * Goal is always on the "far side" of the world from the origin spawn.
 */
function deriveGoalPosition(
  worldSeed: number,
  worldRadius: number
): [number, number, number] {
  const goalSeed = deriveChildSeed(worldSeed, 2);
  // Normalise seed to [0, 1]
  const t = (goalSeed % 10_000) / 10_000;
  // Place goal in the outer ring (60–85 % of worldRadius) on XZ plane
  const r = worldRadius * (0.6 + t * 0.25);
  const angle = t * 2 * Math.PI;
  const x = Math.round(r * Math.cos(angle) * 100) / 100;
  const z = Math.round(r * Math.sin(angle) * 100) / 100;
  // Y (vertical) sits slightly above the terrain floor
  const y = 2.0;
  return [x, y, z];
}

// ─── Public Generator ─────────────────────────────────────────────────────────

/**
 * Generate a fully-populated WorldSpec from a single integer seed.
 *
 * The spec is fully deterministic: the same seed always produces the
 * same world. Sub-seeds (obstacle placement, etc.) are derived from
 * the primary worldSeed so no additional seed management is required.
 *
 * @param seed  Integer world seed. Any 32-bit non-negative integer.
 * @param overrides  Partial overrides applied after deterministic generation.
 */
export function generateWorldSpec(
  seed: number,
  overrides: Partial<WorldSpec> = {}
): WorldSpec {
  const worldSeed = seed >>> 0; // coerce to uint32
  const obstacleSeed = deriveChildSeed(worldSeed, 1);
  const goalPosition = deriveGoalPosition(worldSeed, DEFAULTS.worldRadius);

  const spec: WorldSpec = {
    benchmarkVersion: BENCHMARK_VERSION,
    worldSeed,
    worldRadius: DEFAULTS.worldRadius,
    terrain: { ...DEFAULTS.terrain },
    obstacles: {
      obstacleSeed,
      count: DEFAULTS.obstacles.count,
      minRadius: DEFAULTS.obstacles.minRadius,
      maxRadius: DEFAULTS.obstacles.maxRadius,
    },
    goal: {
      position: goalPosition,
      acceptanceRadius: DEFAULTS.goal.acceptanceRadius,
    },
    degradation: { ...DEFAULTS.degradation },
    ...overrides,
  };

  return spec;
}
