/**
 * benchmarkLoader.ts — Browser-side benchmark artifact loading (Phase 6)
 *
 * Loads the three artifacts produced by Phase 5's BenchmarkRunner:
 *   benchmark_config.json   — run metadata and seed list
 *   aggregate_summary.json  — one row per agent
 *   replays/*.jsonl         — one JSONL replay per agent for one episode seed
 *
 * All loading is static-first (fetch from /public).  No backend required.
 *
 * JSONL replay format (from Python benchmark):
 *   Line 0:   ReplayHeader fields as flat JSON (no "header" wrapper)
 *   Lines 1+: ReplayStep objects
 *
 * The loader reconstructs { header, steps } and validates via the shared schema.
 */

import {
  safeValidateReplayFile,
  type ReplayFile,
  type SafeValidateResult,
} from "@abyssal/replay-schema";

// ─── Domain types ──────────────────────────────────────────────────────────────

/** One row from aggregate_summary.json */
export interface AgentSummary {
  agent_id: string;
  world_seed: number;
  /** Named degradation preset (Phase 7). Absent in Phase 5/6 bundles — treat as "clear". */
  degradation_preset?: string;
  n_episodes: number;
  benchmark_version: string;
  env_version: string;
  success_rate: number;
  collision_rate: number;
  timeout_rate: number;
  oob_rate: number;
  mean_reward: number;
  std_reward: number;
  mean_steps: number;
  std_steps: number;
  mean_final_dist: number;
  std_final_dist: number;
}

/** Contents of benchmark_config.json */
export interface BenchmarkConfig {
  benchmark_version: string;
  env_version: string;
  world_seed: number;
  /** Named degradation preset (Phase 7). Absent in Phase 5/6 bundles — treat as "clear". */
  degradation_preset?: string;
  episode_seeds: number[];
  n_episodes: number;
  max_steps: number;
  agent_ids: string[];
  recorded_at: string;
  git_commit: string | null;
}

/**
 * One row from robustness_summary.json — one row per (degradation_preset, agent_id).
 * Phase 7 only.
 */
export interface RobustnessSummaryRow {
  degradation_preset: string;
  agent_id: string;
  world_seed: number;
  n_episodes: number;
  success_rate: number;
  collision_rate: number;
  timeout_rate: number;
  oob_rate: number;
  mean_reward: number;
  std_reward: number;
  mean_steps: number;
  std_steps: number;
  mean_final_dist: number;
  std_final_dist: number;
  benchmark_version: string;
  env_version: string;
}

/** A fully loaded and validated benchmark bundle. */
export interface BenchmarkBundle {
  config: BenchmarkConfig;
  summaries: AgentSummary[];
  /** agent_id → validated ReplayFile for the comparison episode */
  replays: Record<string, ReplayFile>;
  /** The episode seed shared by all loaded replays */
  episodeSeed: number;
}

/** Generic result wrapper (mirrors SafeValidateResult shape) */
export type LoadResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Load a full benchmark bundle from three static paths.
 *
 * @param configPath      Path to benchmark_config.json
 * @param summaryPath     Path to aggregate_summary.json
 * @param replayPaths     Map of agent_id → path to .jsonl replay file
 * @param episodeSeed     The episode seed shared by all replays (for display)
 */
export async function loadBenchmarkBundle(
  configPath: string,
  summaryPath: string,
  replayPaths: Record<string, string>,
  episodeSeed: number
): Promise<LoadResult<BenchmarkBundle>> {
  // ── Load config ────────────────────────────────────────────────────────────
  const configResult = await fetchJson<BenchmarkConfig>(configPath);
  if (!configResult.success) {
    return { success: false, error: `Config: ${configResult.error}` };
  }

  // ── Load aggregate summary ─────────────────────────────────────────────────
  const summaryResult = await fetchJson<AgentSummary[]>(summaryPath);
  if (!summaryResult.success) {
    return { success: false, error: `Summary: ${summaryResult.error}` };
  }

  // ── Load replays ───────────────────────────────────────────────────────────
  const replays: Record<string, ReplayFile> = {};
  for (const [agentId, path] of Object.entries(replayPaths)) {
    const replayResult = await loadJsonlReplay(path);
    if (replayResult.success) {
      replays[agentId] = replayResult.data;
    } else {
      // Non-fatal: missing replays just won't show in comparison view
      console.warn(`[BenchmarkLoader] Could not load replay for ${agentId}: ${replayResult.error}`);
    }
  }

  if (Object.keys(replays).length === 0) {
    return {
      success: false,
      error: "No valid replays could be loaded. Check that replay files exist in /public/benchmark/replays/.",
    };
  }

  return {
    success: true,
    data: {
      config: configResult.data,
      summaries: summaryResult.data,
      replays,
      episodeSeed,
    },
  };
}

/**
 * Load a single JSONL replay file.
 *
 * JSONL format (Python benchmark output):
 *   Line 0:   flat ReplayHeader JSON  { benchmarkVersion, worldSeed, ... }
 *   Lines 1+: ReplayStep JSON         { timestep, position, ... }
 *
 * We reconstruct { header, steps } and validate against the shared schema.
 */
export async function loadJsonlReplay(
  path: string
): Promise<SafeValidateResult<ReplayFile>> {
  let text: string;

  let res: Response;
  try {
    res = await fetch(path);
  } catch (e) {
    return {
      success: false,
      error: makeZodError(`Replay not reachable: ${path} (${String(e)})`),
    };
  }

  if (res.status === 404) {
    return {
      success: false,
      error: makeZodError(`Replay not found: ${path}`),
    };
  }
  if (!res.ok) {
    return {
      success: false,
      error: makeZodError(`HTTP ${res.status} loading replay from ${path}`),
    };
  }

  try {
    text = await res.text();
  } catch (e) {
    return {
      success: false,
      error: makeZodError(`Failed to read replay text: ${String(e)}`),
    };
  }

  const lines = text.trim().split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      success: false,
      error: makeZodError(`Replay file has fewer than 2 lines (header + steps): ${path}`),
    };
  }

  let headerData: unknown;
  let stepsData: unknown[];
  try {
    headerData = JSON.parse(lines[0]);
    stepsData = lines.slice(1).map((l) => JSON.parse(l));
  } catch (e) {
    return {
      success: false,
      error: makeZodError(`Replay JSONL parse error: ${String(e)}`),
    };
  }

  // Reconstruct the { header, steps } shape expected by safeValidateReplayFile
  const raw = { header: headerData, steps: stepsData };
  const result = safeValidateReplayFile(raw);

  if (!result.success) {
    const issues = (result.error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
    const summary = issues && issues.length > 0
      ? issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ")
      : "Replay schema validation failed";
    return { success: false, error: makeZodError(summary) };
  }

  return result;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<LoadResult<T>> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch (e) {
    return { success: false, error: `Network error fetching ${path}: ${String(e)}` };
  }
  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status} from ${path}` };
  }
  try {
    const data = (await res.json()) as T;
    return { success: true, data };
  } catch {
    return { success: false, error: `Invalid JSON at ${path}` };
  }
}

function makeZodError(message: string) {
  return { message } as unknown as import("zod").ZodError;
}

// ─── Robustness summary loader (Phase 7) ──────────────────────────────────────

/**
 * Load robustness_summary.json — all agents × all presets in one flat array.
 */
export async function loadRobustnessSummary(
  path: string
): Promise<LoadResult<RobustnessSummaryRow[]>> {
  return fetchJson<RobustnessSummaryRow[]>(path);
}
