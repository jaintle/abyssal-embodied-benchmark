/**
 * underwaterMedium.ts
 *
 * Central source of truth for all visual underwater rendering parameters.
 *
 * These are VISUAL presets — distinct from benchmark degradation logic.
 * Benchmark degradation affects what the agent perceives; these parameters
 * control what the human viewer sees.
 *
 * Phase 11 adds photographic presets derived from real underwater reference
 * imagery: bright tropical cyan-blue palette, strong sun, shallow-water feel.
 *
 * Presets:
 *   photographic_clear  — bright shallow tropical water (default)
 *   photographic_murky  — deeper, muted, reduced visibility
 *   cinematic_clear     — original dark deep-sea palette (kept for compat)
 *   cinematic_mild      — slightly turbid dark variant
 *   cinematic_heavy     — near-zero visibility deep murk
 *
 * All colours are sRGB hex strings suitable for THREE.Color construction.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnderwaterMediumConfig {
  // ── Fog / volume ──────────────────────────────────────────────────────────
  /** Exponential fog density.  Higher = more opaque medium. */
  fogDensity: number;
  /** Hex colour of the fog / water volume (deep-water absorption). */
  fogColor: string;
  /** Scene background colour (slightly darker than fog for depth). */
  backgroundColor: string;

  // ── Lighting ──────────────────────────────────────────────────────────────
  /** Hemisphere sky colour — overhead scattered light from surface. */
  hemisphereSkyCColor: string;
  /** Hemisphere ground colour — bounce from dark seabed. */
  hemisphereGroundColor: string;
  /** Hemisphere light intensity. */
  hemisphereIntensity: number;
  /** Primary directional light colour (sun-from-surface effect). */
  sunColor: string;
  /** Directional light intensity. */
  sunIntensity: number;
  /** Directional light world-space position (for angle only). */
  sunPosition: [number, number, number];

  // ── Caustics ──────────────────────────────────────────────────────────────
  /** 0–1 brightness of the caustic projector layer. */
  causticsIntensity: number;
  /** World-space scale of the caustic pattern (smaller = larger features). */
  causticsScale: number;
  /** Animation speed multiplier. */
  causticsSpeed: number;

  // ── Suspended particulates (marine snow) ─────────────────────────────────
  /** Number of particle points in the volume. */
  particleCount: number;
  /** Base opacity of each particle point. */
  particleOpacity: number;

  // ── Post-processing ───────────────────────────────────────────────────────
  /** Bloom: luminance threshold above which pixels are brightened. */
  bloomLuminanceThreshold: number;
  /** Bloom: intensity of the bloom contribution. */
  bloomIntensity: number;
  /** Vignette: offset of the dark edge (0 = full frame, 1 = no vignette). */
  vignetteOffset: number;
  /** Vignette: darkness at the edge (0 = transparent, 1 = black). */
  vignetteDarkness: number;

  // ── Renderer tone mapping ─────────────────────────────────────────────────
  /** THREE ACESFilmicToneMapping exposure (1.0 = neutral). */
  exposure: number;
}

// ─── Presets ─────────────────────────────────────────────────────────────────

/**
 * cinematic_clear
 * Deep clear ocean water.  Strong blue absorption, bright caustics, moderate
 * fog density.  Feels like being at ~10–20 m depth on a calm day.
 */
const CINEMATIC_CLEAR: UnderwaterMediumConfig = {
  fogDensity:             0.024,
  fogColor:               "#011826",
  backgroundColor:        "#010e1a",

  hemisphereSkyCColor:    "#0a2a40",
  hemisphereGroundColor:  "#060a08",
  hemisphereIntensity:    1.1,

  sunColor:               "#1a4a72",
  sunIntensity:           0.9,
  sunPosition:            [15, 50, 20],

  causticsIntensity:      0.38,
  causticsScale:          0.28,
  causticsSpeed:          0.55,

  particleCount:          600,
  particleOpacity:        0.38,

  bloomLuminanceThreshold: 0.72,
  bloomIntensity:          0.45,
  vignetteOffset:          0.46,
  vignetteDarkness:        0.52,

  exposure: 0.88,
};

/**
 * cinematic_mild
 * Moderately turbid — silty water with reduced visibility and warmer haze.
 * Caustics are dimmer and pattern is larger (more diffuse).
 */
const CINEMATIC_MILD: UnderwaterMediumConfig = {
  fogDensity:             0.038,
  fogColor:               "#021420",
  backgroundColor:        "#010c18",

  hemisphereSkyCColor:    "#071e30",
  hemisphereGroundColor:  "#050808",
  hemisphereIntensity:    0.85,

  sunColor:               "#123a58",
  sunIntensity:           0.6,
  sunPosition:            [15, 50, 20],

  causticsIntensity:      0.22,
  causticsScale:          0.18,
  causticsSpeed:          0.38,

  particleCount:          900,
  particleOpacity:        0.45,

  bloomLuminanceThreshold: 0.78,
  bloomIntensity:          0.35,
  vignetteOffset:          0.40,
  vignetteDarkness:        0.60,

  exposure: 0.80,
};

/**
 * cinematic_heavy
 * Heavy silt / deep murk.  Almost no caustics, thick exponential fog,
 * very compressed colour range.  Benchmark markers must still be legible.
 */
const CINEMATIC_HEAVY: UnderwaterMediumConfig = {
  fogDensity:             0.062,
  fogColor:               "#020e18",
  backgroundColor:        "#010910",

  hemisphereSkyCColor:    "#051525",
  hemisphereGroundColor:  "#040606",
  hemisphereIntensity:    0.65,

  sunColor:               "#0c2a40",
  sunIntensity:           0.35,
  sunPosition:            [15, 50, 20],

  causticsIntensity:      0.08,
  causticsScale:          0.14,
  causticsSpeed:          0.22,

  particleCount:          1400,
  particleOpacity:        0.50,

  bloomLuminanceThreshold: 0.65,
  bloomIntensity:          0.50,
  vignetteOffset:          0.35,
  vignetteDarkness:        0.68,

  exposure: 0.72,
};

// ─── Phase 11: Photographic presets ──────────────────────────────────────────

/**
 * photographic_clear
 * Bright shallow tropical ocean — matches real underwater photography at 5-15m.
 * Strong cyan palette, near-white sun, vivid caustics.
 * This is the default rendering preset.
 */
const PHOTOGRAPHIC_CLEAR: UnderwaterMediumConfig = {
  fogDensity:             0.010,
  fogColor:               "#197a96",  // saturated cyan-blue water medium
  backgroundColor:        "#073a52",  // deep teal horizon

  hemisphereSkyCColor:    "#42c8e5",  // bright turquoise surface-scatter light
  hemisphereGroundColor:  "#070e06",  // near-black seabed bounce
  hemisphereIntensity:    2.6,

  sunColor:               "#e0f0ff",  // near-white with cool tint (surface sun)
  sunIntensity:           3.4,
  sunPosition:            [12, 50, 18],

  causticsIntensity:      0.20,
  causticsScale:          0.28,
  causticsSpeed:          0.62,

  particleCount:          480,
  particleOpacity:        0.28,

  bloomLuminanceThreshold: 0.72,
  bloomIntensity:          0.45,
  vignetteOffset:          0.46,
  vignetteDarkness:        0.52,

  exposure: 1.05,
};

/**
 * photographic_murky
 * Deeper, silty water with reduced visibility and greener tones.
 * Benchmark agents still legible; caustics dimmer and diffuse.
 */
const PHOTOGRAPHIC_MURKY: UnderwaterMediumConfig = {
  fogDensity:             0.022,
  fogColor:               "#0f5a6e",
  backgroundColor:        "#052840",

  hemisphereSkyCColor:    "#28a0b8",
  hemisphereGroundColor:  "#060a05",
  hemisphereIntensity:    1.8,

  sunColor:               "#c0dff0",
  sunIntensity:           2.0,
  sunPosition:            [12, 50, 18],

  causticsIntensity:      0.12,
  causticsScale:          0.22,
  causticsSpeed:          0.40,

  particleCount:          750,
  particleOpacity:        0.38,

  bloomLuminanceThreshold: 0.75,
  bloomIntensity:          0.35,
  vignetteOffset:          0.40,
  vignetteDarkness:        0.62,

  exposure: 0.92,
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const UNDERWATER_MEDIUM_PRESETS = {
  photographic_clear:  PHOTOGRAPHIC_CLEAR,
  photographic_murky:  PHOTOGRAPHIC_MURKY,
  cinematic_clear:     CINEMATIC_CLEAR,
  cinematic_mild:      CINEMATIC_MILD,
  cinematic_heavy:     CINEMATIC_HEAVY,
} as const;

export type UnderwaterMediumPreset = keyof typeof UNDERWATER_MEDIUM_PRESETS;

/** Default visual preset — photographic shallow tropical ocean. */
export const DEFAULT_MEDIUM = PHOTOGRAPHIC_CLEAR;
