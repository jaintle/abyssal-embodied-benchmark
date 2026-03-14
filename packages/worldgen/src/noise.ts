/**
 * noise.ts — Deterministic seeded RNG and 2D fBM noise
 *
 * All functions are pure and produce identical output for identical inputs.
 * No global state. No Math.random().
 */

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

/**
 * Create a Mulberry32 pseudo-random number generator from a 32-bit seed.
 *
 * Returns a function that yields floats in [0, 1) with each call.
 * The sequence is fully deterministic for a given seed.
 *
 * @example
 *   const rng = createRNG(42);
 *   rng(); // 0.37...
 *   rng(); // 0.11...
 */
export function createRNG(seed: number): () => number {
  let s = seed >>> 0; // coerce to uint32
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
  };
}

// ─── 2D Value Noise ───────────────────────────────────────────────────────────

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothstep (quintic) easing for C2 continuity. */
function smoothstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Deterministic integer hash → float in [0, 1).
 * Mixing based on Murmur3 finaliser; depends on a seed to shift the lattice.
 */
function latticeValue(ix: number, iy: number, seed: number): number {
  // Combine ix, iy, seed into a single uint32
  let h = (seed ^ (ix * 1619 + iy * 31337)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

/**
 * Single-octave 2D value noise.
 * Bilinearly interpolates corner lattice values with smoothstep easing.
 *
 * @param x       World x coordinate
 * @param z       World z coordinate
 * @param scale   Frequency scaling (higher = more zoomed-in features)
 * @param seed    Integer lattice seed
 * @returns       Float in [0, 1)
 */
function valueNoise2D(
  x: number,
  z: number,
  scale: number,
  seed: number
): number {
  const sx = x * scale;
  const sz = z * scale;
  const xi = Math.floor(sx);
  const zi = Math.floor(sz);
  const fx = smoothstep(sx - xi);
  const fz = smoothstep(sz - zi);

  const v00 = latticeValue(xi, zi, seed);
  const v10 = latticeValue(xi + 1, zi, seed);
  const v01 = latticeValue(xi, zi + 1, seed);
  const v11 = latticeValue(xi + 1, zi + 1, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz);
}

// ─── Fractal Brownian Motion ──────────────────────────────────────────────────

export interface FBMConfig {
  /** Base frequency scale (world units). Mirrors TerrainSpec.noiseScale. */
  noiseScale: number;
  /** Number of octaves to layer. */
  octaves: number;
  /** Amplitude decay per octave (0–1). */
  persistence: number;
  /** Frequency multiplier per octave (> 1). */
  lacunarity: number;
}

/**
 * Fractal Brownian Motion — layers multiple octaves of value noise.
 *
 * @returns Float in [0, 1)
 */
export function fbm2D(
  x: number,
  z: number,
  seed: number,
  config: FBMConfig
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = config.noiseScale;
  let maxValue = 0;

  for (let i = 0; i < config.octaves; i++) {
    // Offset seed per octave so layers aren't correlated
    value += valueNoise2D(x, z, frequency, seed + i * 1327) * amplitude;
    maxValue += amplitude;
    amplitude *= config.persistence;
    frequency *= config.lacunarity;
  }

  return value / maxValue; // normalise to [0, 1)
}
