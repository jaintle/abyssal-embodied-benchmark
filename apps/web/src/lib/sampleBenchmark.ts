/**
 * sampleBenchmark.ts — Static paths for the bundled sample benchmark (Phase 6 / Phase 7)
 *
 * Points to benchmark artifacts copied into /public/benchmark/.
 *
 * Phase 6 bundle: ppo-vs-baselines, world seed 42, 20 episodes.
 *   Agents: heuristic, ppo, random
 *
 * Phase 7 robustness bundle: all 4 agents (heuristic, ppo, cautious_ppo, random),
 *   clear and heavy presets.
 *   Artifacts live in /public/benchmark/clear/ and /public/benchmark/heavy/.
 */

import {
  loadBenchmarkBundle,
  loadRobustnessSummary,
  type BenchmarkBundle,
  type RobustnessSummaryRow,
  type LoadResult,
} from "./benchmarkLoader";

// ─── Paths ────────────────────────────────────────────────────────────────────

// When deployed to a sub-path (e.g. GitHub Pages), NEXT_PUBLIC_BASE_PATH is set
// at build time so that fetch() calls resolve to the correct URLs.
// Locally (npm run dev) the env var is unset and BASE stays "/benchmark".
const _BASE_PATH =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
    : "";

const BASE = `${_BASE_PATH}/benchmark`;

export const SAMPLE_CONFIG_PATH = `${BASE}/benchmark_config.json`;
export const SAMPLE_SUMMARY_PATH = `${BASE}/aggregate_summary.json`;

/** Episode seed shared by all sample replays */
export const SAMPLE_EPISODE_SEED = 1338301409;

/** One JSONL replay per agent for SAMPLE_EPISODE_SEED (Phase 6 bundle) */
export const SAMPLE_REPLAY_PATHS: Record<string, string> = {
  heuristic: `${BASE}/replays/replay_heuristic_seed_${SAMPLE_EPISODE_SEED}.jsonl`,
  ppo:       `${BASE}/replays/replay_ppo_seed_${SAMPLE_EPISODE_SEED}.jsonl`,
  random:    `${BASE}/replays/replay_random_seed_${SAMPLE_EPISODE_SEED}.jsonl`,
};

// ─── Phase 7 robustness paths ─────────────────────────────────────────────────

/** Available degradation presets in the bundled robustness run */
export const ROBUSTNESS_PRESETS = ["clear", "heavy"] as const;
export type SamplePreset = (typeof ROBUSTNESS_PRESETS)[number];

export const ROBUSTNESS_SUMMARY_PATH = `${BASE}/robustness_summary.json`;

/** Config / summary / replay paths per preset */
export const PRESET_CONFIG_PATHS: Record<SamplePreset, string> = {
  clear: `${BASE}/clear/benchmark_config.json`,
  heavy: `${BASE}/heavy/benchmark_config.json`,
};

export const PRESET_SUMMARY_PATHS: Record<SamplePreset, string> = {
  clear: `${BASE}/clear/aggregate_summary.json`,
  heavy: `${BASE}/heavy/aggregate_summary.json`,
};

/** Agents in the robustness bundle (Phase 7: heuristic+random; Phase 8: +cautious_ppo; Phase 9: +ppo) */
const ROBUSTNESS_AGENTS = ["heuristic", "ppo", "cautious_ppo", "random"] as const;

export function presetReplayPaths(preset: SamplePreset): Record<string, string> {
  return Object.fromEntries(
    ROBUSTNESS_AGENTS.map((id) => [
      id,
      `${BASE}/${preset}/replays/replay_${id}_seed_${SAMPLE_EPISODE_SEED}.jsonl`,
    ])
  );
}

// ─── Convenience loaders ─────────────────────────────────────────────────────

/**
 * Load the Phase 6 bundled sample benchmark (3 agents, no degradation preset).
 */
export async function loadSampleBenchmark(): Promise<LoadResult<BenchmarkBundle>> {
  return loadBenchmarkBundle(
    SAMPLE_CONFIG_PATH,
    SAMPLE_SUMMARY_PATH,
    SAMPLE_REPLAY_PATHS,
    SAMPLE_EPISODE_SEED
  );
}

/**
 * Load the Phase 7 bundled benchmark for a specific degradation preset.
 */
export async function loadPresetBenchmark(
  preset: SamplePreset
): Promise<LoadResult<BenchmarkBundle>> {
  return loadBenchmarkBundle(
    PRESET_CONFIG_PATHS[preset],
    PRESET_SUMMARY_PATHS[preset],
    presetReplayPaths(preset),
    SAMPLE_EPISODE_SEED
  );
}

/**
 * Load the flat robustness summary (all agents × all presets).
 */
export async function loadSampleRobustnessSummary(): Promise<
  LoadResult<RobustnessSummaryRow[]>
> {
  return loadRobustnessSummary(ROBUSTNESS_SUMMARY_PATH);
}

// ─── Agent color palette ──────────────────────────────────────────────────────

/** Consistent agent color map used by both the leaderboard and the 3D scene */
export const AGENT_COLORS: Record<string, string> = {
  heuristic:    "#00ffa0",   // teal-green
  ppo:          "#4ab8ff",   // sky-blue
  cautious_ppo: "#ffcc44",   // amber — signals cautious/safe behaviour
  random:       "#ff6060",   // coral-red
};

/** Fallback colors for agents not in AGENT_COLORS */
const FALLBACKS = ["#ffaa00", "#cc88ff", "#ff8844", "#aaffcc"];

export function agentColor(agentId: string, fallbackIndex = 0): string {
  return AGENT_COLORS[agentId] ?? FALLBACKS[fallbackIndex % FALLBACKS.length];
}
