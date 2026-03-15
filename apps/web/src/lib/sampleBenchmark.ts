/**
 * sampleBenchmark.ts — Static paths for the bundled sample benchmark (Phase 6)
 *
 * Points to the real Phase 5 outputs copied into /public/benchmark/.
 * Bundle: ppo-vs-baselines run, world seed 42, 20 episodes, seed 1338301409.
 *
 * Agents: heuristic, ppo, random
 */

import { loadBenchmarkBundle, type BenchmarkBundle, type LoadResult } from "./benchmarkLoader";

// ─── Paths ────────────────────────────────────────────────────────────────────

const BASE = "/benchmark";

export const SAMPLE_CONFIG_PATH = `${BASE}/benchmark_config.json`;
export const SAMPLE_SUMMARY_PATH = `${BASE}/aggregate_summary.json`;

/** Episode seed shared by all three sample replays */
export const SAMPLE_EPISODE_SEED = 1338301409;

/** One JSONL replay per agent for SAMPLE_EPISODE_SEED */
export const SAMPLE_REPLAY_PATHS: Record<string, string> = {
  heuristic: `${BASE}/replays/replay_heuristic_seed_${SAMPLE_EPISODE_SEED}.jsonl`,
  ppo:       `${BASE}/replays/replay_ppo_seed_${SAMPLE_EPISODE_SEED}.jsonl`,
  random:    `${BASE}/replays/replay_random_seed_${SAMPLE_EPISODE_SEED}.jsonl`,
};

// ─── Convenience loader ───────────────────────────────────────────────────────

/**
 * Load the bundled sample benchmark.
 * Returns a LoadResult so callers handle errors without try/catch.
 */
export async function loadSampleBenchmark(): Promise<LoadResult<BenchmarkBundle>> {
  return loadBenchmarkBundle(
    SAMPLE_CONFIG_PATH,
    SAMPLE_SUMMARY_PATH,
    SAMPLE_REPLAY_PATHS,
    SAMPLE_EPISODE_SEED
  );
}

// ─── Agent color palette ──────────────────────────────────────────────────────

/** Consistent agent color map used by both the leaderboard and the 3D scene */
export const AGENT_COLORS: Record<string, string> = {
  heuristic: "#00ffa0",   // teal-green
  ppo:       "#4ab8ff",   // sky-blue
  random:    "#ff6060",   // coral-red
};

/** Fallback colors for agents not in AGENT_COLORS */
const FALLBACKS = ["#ffaa00", "#cc88ff", "#ff8844", "#aaffcc"];

export function agentColor(agentId: string, fallbackIndex = 0): string {
  return AGENT_COLORS[agentId] ?? FALLBACKS[fallbackIndex % FALLBACKS.length];
}
