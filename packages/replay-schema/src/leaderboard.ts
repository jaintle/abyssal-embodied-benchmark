/**
 * Leaderboard Manifest Schema — Phase A
 *
 * Defines the data model for the canonical public leaderboard manifest:
 *   apps/web/public/data/leaderboard/leaderboard.json
 *
 * The web viewer reads this file to populate the leaderboard table and
 * to locate submission artifact bundles.
 *
 * Mirrors ``python/benchmark/src/abyssal_benchmark/schemas/leaderboard.py``.
 * Both files must stay in sync.
 *
 * Status semantics:
 *   "verified"    — officially re-run under the benchmark protocol; results are authoritative
 *   "provisional" — submitted artifacts accepted; not yet officially re-run
 *   "rejected"    — invalid or incompatible; must NOT appear in the public manifest
 */

import { z } from "zod";
import { SUBMISSION_STATUSES } from "./submissionMetadata";

// ─── Leaderboard Entry ────────────────────────────────────────────────────────

/**
 * One row in the public leaderboard.
 *
 * Artifact paths are relative to the web app's public data root
 * (apps/web/public/data/).
 */
export const LeaderboardEntrySchema = z.object({
  // ── Identity ───────────────────────────────────────────────────────────────

  /** Unique submission id (kebab-case). Matches the submission bundle root. */
  submission_id: z.string(),

  /** Human-readable name displayed in the leaderboard UI. */
  display_name: z.string(),

  /** Short policy id. Matches policyId in all replay headers. */
  agent_id: z.string(),

  /** Team or lab name. */
  team_name: z.string(),

  // ── Status ─────────────────────────────────────────────────────────────────

  /**
   * Lifecycle status. Rejected entries must not appear in the public manifest.
   * verified    → results are authoritative (official re-run confirmed)
   * provisional → submitted but not yet officially re-run
   */
  status: z.enum(SUBMISSION_STATUSES),

  // ── Compatibility ──────────────────────────────────────────────────────────

  /** Benchmark protocol version this entry was evaluated against. */
  benchmark_version: z.string(),

  /** High-level algorithm family label. */
  algorithm_family: z.string(),

  /** "standard" or "uncertainty". */
  observation_type: z.string(),

  // ── Artifact paths (relative to apps/web/public/data/) ────────────────────

  /** Path to aggregate_summary.json. E.g. "submissions/cautious-ppo-v2/summary.json" */
  summary_path: z.string(),

  /** Path to the replays directory. E.g. "submissions/cautious-ppo-v2/replays/" */
  replay_path: z.string(),

  /** Path to the submission metadata.json. E.g. "submissions/cautious-ppo-v2/metadata.json" */
  metadata_path: z.string(),

  // ── Dates ──────────────────────────────────────────────────────────────────

  /** ISO-8601 date of initial submission. E.g. "2026-03-21" */
  date_submitted: z.string(),

  /** ISO-8601 date of verification. Null until status becomes "verified". */
  date_verified: z.string().nullish(),

  // ── Denormalised key metrics (for fast UI rendering) ───────────────────────

  /** Success rate on the "clear" preset (0–1). Null if not yet evaluated. */
  clear_success_rate: z.number().min(0).max(1).nullish(),

  /** Success rate on the "heavy" preset (0–1). Null if not yet evaluated. */
  heavy_success_rate: z.number().min(0).max(1).nullish(),

  /** Public repository URL (optional, displayed in UI). */
  repo_url: z.string().url().optional(),

  /** Paper or preprint URL (optional, displayed in UI). */
  paper_url: z.string().url().optional(),
});

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

// ─── Manifest ─────────────────────────────────────────────────────────────────

/**
 * Root manifest consumed by the web leaderboard.
 *
 * Maintained by benchmark maintainers. Do NOT include "rejected" entries.
 * Entries are ordered newest-first by date_submitted.
 */
export const LeaderboardManifestSchema = z.object({
  /** Schema version for the manifest format itself. Currently "1.0". */
  manifest_version: z.string(),

  /** Benchmark protocol version all entries are evaluated against. */
  benchmark_version: z.string(),

  /** ISO-8601 date this manifest was last modified. */
  last_updated: z.string(),

  /** All public (non-rejected) leaderboard entries, newest first. */
  entries: z.array(LeaderboardEntrySchema),
});

export type LeaderboardManifest = z.infer<typeof LeaderboardManifestSchema>;

// ─── Validators ───────────────────────────────────────────────────────────────

/** Validate an unknown value against LeaderboardManifestSchema. Throws ZodError on failure. */
export function validateLeaderboardManifest(data: unknown): LeaderboardManifest {
  return LeaderboardManifestSchema.parse(data);
}

/** Safe variant. */
export function safeValidateLeaderboardManifest(
  data: unknown
): { success: true; data: LeaderboardManifest } | { success: false; error: z.ZodError } {
  const result = LeaderboardManifestSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
