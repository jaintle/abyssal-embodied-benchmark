/**
 * Replay Schema Contract — Phase 0
 *
 * Defines the serialisation format for recorded benchmark episodes.
 * A replay file is a newline-delimited JSON stream (JSONL):
 *   - Line 0:   ReplayHeader  (serialised as JSON)
 *   - Lines 1…N: ReplayStep   (one JSON object per timestep)
 *
 * Both the Python benchmark runner and the browser replay UI must
 * consume this format without modification.
 */

import { z } from "zod";

// ─── Benchmark Protocol Version ───────────────────────────────────────────────

/**
 * Current benchmark contract version.
 * Must stay in sync with:
 *   - packages/worldgen/src/worldSpec.ts :: BENCHMARK_VERSION
 *   - python/benchmark/src/abyssal_benchmark/schemas/world_spec.py :: BENCHMARK_VERSION
 *   - python/benchmark/src/abyssal_benchmark/eval/replay_export.py :: BENCHMARK_VERSION
 */
export const BENCHMARK_VERSION = "1.0.0" as const;

/**
 * Soft version check: returns a human-readable warning if the replay header
 * declares a different benchmarkVersion than the current BENCHMARK_VERSION,
 * or null if the versions match.
 *
 * This does NOT throw — older artifacts remain loadable.
 * See docs/protocol/schema_migration.md for guidance.
 */
export function checkReplayVersion(header: ReplayHeader): string | null {
  if (header.benchmarkVersion !== BENCHMARK_VERSION) {
    return (
      `Replay benchmarkVersion "${header.benchmarkVersion}" ` +
      `does not match current "${BENCHMARK_VERSION}". ` +
      `Artifact may need regeneration — see docs/protocol/schema_migration.md.`
    );
  }
  return null;
}

// ─── Header ───────────────────────────────────────────────────────────────────

/**
 * ReplayHeader is the first record in every replay file.
 * It records all metadata required to reproduce or compare an episode.
 */
export const ReplayHeaderSchema = z.object({
  /** Semantic version of the benchmark contract (e.g. "0.1.0") */
  benchmarkVersion: z.string(),

  /** Primary seed used to generate the world */
  worldSeed: z.number().int().nonnegative(),

  /** Per-episode seed used for random event ordering */
  episodeSeed: z.number().int().nonnegative(),

  /** Identifier of the policy that produced this replay */
  policyId: z.string(),

  /** Version string of the Gymnasium environment */
  envVersion: z.string(),

  /** ISO-8601 UTC timestamp of when the episode was recorded */
  recordedAt: z.string(),

  /** Git commit hash of the benchmark codebase (optional, for audit) */
  gitCommit: z.string().nullish(),
});

export type ReplayHeader = z.infer<typeof ReplayHeaderSchema>;

// ─── Step ─────────────────────────────────────────────────────────────────────

/**
 * ReplayStep is one record per environment timestep.
 * Each step captures the full observable state transition.
 */
export const ReplayStepSchema = z.object({
  /** Zero-based timestep index within the episode */
  timestep: z.number().int().nonnegative(),

  /** Agent position in world coordinates [x, y, z] */
  position: z.tuple([z.number(), z.number(), z.number()]),

  /** Agent velocity vector [vx, vy, vz] in m/s */
  velocity: z.tuple([z.number(), z.number(), z.number()]),

  /** Scalar reward received at this step */
  reward: z.number(),

  /** Whether a collision was detected this step */
  collisionFlag: z.boolean(),

  /** Whether the episode terminated at or before this step */
  doneFlag: z.boolean(),

  /**
   * Action taken by the agent at this step [ax, ay, az].
   * Optional to support replays that only log observations.
   */
  action: z.tuple([z.number(), z.number(), z.number()]).optional(),
});

export type ReplayStep = z.infer<typeof ReplayStepSchema>;

// ─── Full Replay File ─────────────────────────────────────────────────────────

/**
 * ReplayFile is the in-memory representation of a complete replay.
 *
 * On disk this is stored as JSONL:
 *   header (one JSON line) + steps (one JSON line each).
 *
 * The schema validator works on the parsed, in-memory form.
 */
export const ReplayFileSchema = z.object({
  header: ReplayHeaderSchema,
  steps: z.array(ReplayStepSchema),
});

export type ReplayFile = z.infer<typeof ReplayFileSchema>;

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validate an unknown value against the ReplayFile schema.
 *
 * Returns a typed ReplayFile on success, or throws a ZodError with
 * detailed path + message information on failure.
 *
 * @example
 *   const replay = validateReplayFile(JSON.parse(rawJson));
 */
export function validateReplayFile(data: unknown): ReplayFile {
  return ReplayFileSchema.parse(data);
}

/**
 * Safe variant: returns `{ success: true, data }` or `{ success: false, error }`.
 */
export type SafeValidateResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

export function safeValidateReplayFile(data: unknown): SafeValidateResult<ReplayFile> {
  const result = ReplayFileSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
