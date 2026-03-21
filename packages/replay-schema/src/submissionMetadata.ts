/**
 * Submission Metadata Schema — Phase A
 *
 * Defines the structure of ``metadata.json`` included in every community
 * benchmark submission.
 *
 * Mirrors ``python/benchmark/src/abyssal_benchmark/schemas/submission_metadata.py``.
 * Both files must stay in sync whenever fields are added or renamed.
 */

import { z } from "zod";

// ─── Constants ────────────────────────────────────────────────────────────────

export const SUPPORTED_BENCHMARK_VERSIONS = ["1.0.0"] as const;

export const ALGORITHM_FAMILIES = [
  "ppo",
  "sac",
  "td3",
  "dqn",
  "diffusion",
  "heuristic",
  "other",
] as const;

export const OBSERVATION_TYPES = ["standard", "uncertainty"] as const;

export const SUBMISSION_STATUSES = [
  "provisional",
  "verified",
  "rejected",
] as const;

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * SubmissionMetadataSchema — validates the metadata.json in a submission bundle.
 *
 * All field names use snake_case to match the JSON file on disk (and the
 * Python Pydantic model).
 */
export const SubmissionMetadataSchema = z.object({
  // ── Identity ───────────────────────────────────────────────────────────────

  /** Human-readable name for this submission. Max 80 chars. */
  submission_name: z.string().min(1).max(80),

  /**
   * Unique kebab-case identifier.
   * Format: <agent-name>-v<N>. Example: "cautious-ppo-v2".
   * Used in artifact paths and leaderboard references.
   */
  submission_id: z.string().regex(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/, {
    message: "submission_id must be kebab-case (lowercase alphanumeric + hyphens)",
  }),

  /**
   * Short stable policy id.
   * Must match the policyId field in all submitted replay headers.
   */
  agent_id: z.string().regex(/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/, {
    message: "agent_id must be kebab-case (lowercase alphanumeric + hyphens)",
  }),

  // ── Authorship ─────────────────────────────────────────────────────────────

  /** Team or lab name. */
  team_name: z.string().min(1),

  /** Primary contact full name. */
  author_name: z.string().min(1),

  /** Contact email address. */
  contact: z.string().email({ message: "contact must be a valid email address" }),

  /** Affiliated institution or company (optional). */
  institution: z.string().optional(),

  // ── Provenance ─────────────────────────────────────────────────────────────

  /** URL to the public repository containing the adapter and training code. */
  repo_url: z.string().url({ message: "repo_url must be a valid URL" }),

  /**
   * Git commit hash of the adapter at submission time.
   * At least 7 characters (short hash).
   */
  commit_hash: z.string().min(7),

  /** URL to an associated paper or preprint (optional). */
  paper_url: z.string().url().optional(),

  // ── Benchmark compatibility ─────────────────────────────────────────────────

  /**
   * Benchmark protocol version this submission targets.
   * Must be one of SUPPORTED_BENCHMARK_VERSIONS (currently "1.0.0").
   */
  benchmark_version: z.enum(SUPPORTED_BENCHMARK_VERSIONS),

  // ── Algorithm characterisation ──────────────────────────────────────────────

  /** High-level algorithm family. */
  algorithm_family: z.enum(ALGORITHM_FAMILIES),

  /**
   * Observation space variant used by this agent.
   * "standard" = 38-dim; "uncertainty" = 41-dim (includes sensor confidence).
   */
  observation_type: z.enum(OBSERVATION_TYPES),

  /**
   * Brief description of training procedure.
   * Max 500 characters.
   */
  training_notes: z.string().max(500),

  /** Approximate model size, e.g. "2.1 M params" (optional). */
  model_size: z.string().optional(),

  /** Training hardware description, e.g. "1× RTX 3090, 4 h" (optional). */
  hardware_notes: z.string().optional(),

  // ── Licensing ──────────────────────────────────────────────────────────────

  /**
   * SPDX license identifier for the adapter and associated weights.
   * Examples: "MIT", "Apache-2.0", "CC-BY-4.0".
   */
  license: z.string().min(2),

  // ── Status ─────────────────────────────────────────────────────────────────

  /**
   * Submission lifecycle status.
   * Must be "provisional" on initial submission.
   * Only maintainers set "verified" or "rejected".
   */
  submission_status: z.enum(SUBMISSION_STATUSES),
});

export type SubmissionMetadata = z.infer<typeof SubmissionMetadataSchema>;

// ─── Validators ───────────────────────────────────────────────────────────────

/** Validate an unknown value against SubmissionMetadataSchema. Throws ZodError on failure. */
export function validateSubmissionMetadata(data: unknown): SubmissionMetadata {
  return SubmissionMetadataSchema.parse(data);
}

/** Safe variant — returns success/error discriminated union. */
export function safeValidateSubmissionMetadata(
  data: unknown
): { success: true; data: SubmissionMetadata } | { success: false; error: z.ZodError } {
  const result = SubmissionMetadataSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
