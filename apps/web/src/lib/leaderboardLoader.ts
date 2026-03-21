/**
 * leaderboardLoader.ts — Dynamic public leaderboard loading (Phase C)
 *
 * Loads the canonical leaderboard manifest from the published public data
 * store at /public/data/leaderboard/leaderboard.json.
 *
 * All loading is static-first (fetch from /public). No backend required.
 * Gracefully degrades if manifest is missing or malformed.
 */

import {
  safeValidateLeaderboardManifest,
  type LeaderboardManifest,
  type LeaderboardEntry,
} from "@abyssal/replay-schema";
import type { LoadResult } from "./benchmarkLoader";

// ─── URL root ────────────────────────────────────────────────────────────────

const _BASE_PATH =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
    : "";

/** Root of the published data store — mirrors /public/data at runtime */
export const DATA_ROOT = `${_BASE_PATH}/data`;

// ─── Manifest loader ─────────────────────────────────────────────────────────

/**
 * Fetch and validate the canonical public leaderboard manifest.
 *
 * Returns a LoadResult so the caller can show a meaningful error state
 * instead of crashing.
 */
export async function loadLeaderboardManifest(): Promise<
  LoadResult<LeaderboardManifest>
> {
  const url = `${DATA_ROOT}/leaderboard/leaderboard.json`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    return { success: false, error: `Network error: ${String(e)}` };
  }
  if (!res.ok) {
    return {
      success: false,
      error: `Leaderboard manifest not found (HTTP ${res.status}). Run publish_submission.py to generate it.`,
    };
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return { success: false, error: "Leaderboard manifest is not valid JSON." };
  }
  const result = safeValidateLeaderboardManifest(raw);
  if (!result.success) {
    return {
      success: false,
      error: "Leaderboard manifest failed schema validation.",
    };
  }
  return { success: true, data: result.data };
}

// ─── Entry helpers ────────────────────────────────────────────────────────────

/** True if this entry belongs to the official benchmark team. */
export function isBaseline(entry: LeaderboardEntry): boolean {
  return entry.team_name === "Abyssal Benchmark (baseline)";
}

/** Filter entries by status (excludes "rejected" by default). */
export function filterEntries(
  entries: LeaderboardEntry[],
  opts: { status?: "all" | "verified" | "provisional"; hideRejected?: boolean }
): LeaderboardEntry[] {
  let result = entries;
  if (opts.hideRejected !== false) {
    result = result.filter((e) => e.status !== "rejected");
  }
  if (opts.status && opts.status !== "all") {
    result = result.filter((e) => e.status === opts.status);
  }
  return result;
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

export type SortKey =
  | "clear_success_rate"
  | "heavy_success_rate"
  | "date_submitted"
  | "display_name";

export type SortDir = "asc" | "desc";

/** Return a new sorted array — does not mutate the input. */
export function sortEntries(
  entries: LeaderboardEntry[],
  key: SortKey,
  dir: SortDir
): LeaderboardEntry[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (key === "clear_success_rate") {
      av = a.clear_success_rate ?? -1;
      bv = b.clear_success_rate ?? -1;
    } else if (key === "heavy_success_rate") {
      av = a.heavy_success_rate ?? -1;
      bv = b.heavy_success_rate ?? -1;
    } else if (key === "date_submitted") {
      av = a.date_submitted ?? "";
      bv = b.date_submitted ?? "";
    } else {
      av = a.display_name.toLowerCase();
      bv = b.display_name.toLowerCase();
    }
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}

// ─── Color palette (consistent with sampleBenchmark AGENT_COLORS) ─────────────

const AGENT_COLOR_MAP: Record<string, string> = {
  heuristic:    "#88ff00",
  ppo:          "#4ab8ff",
  cautious:     "#ffcc44",
  cautious_ppo: "#ffcc44",
  random:       "#ff6060",
};

const PALETTE = [
  "#ff9944", "#cc88ff", "#44ffcc", "#ffaa00",
  "#88ccff", "#ff88aa", "#aaffcc", "#ffdd66",
];

export function entryColor(entry: LeaderboardEntry, index = 0): string {
  return (
    AGENT_COLOR_MAP[entry.agent_id] ??
    PALETTE[index % PALETTE.length]
  );
}
