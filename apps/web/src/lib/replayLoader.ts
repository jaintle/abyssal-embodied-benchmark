/**
 * replayLoader.ts — Browser-side replay loading utilities (Phase 4)
 *
 * Supports two loading modes:
 *   1. Static JSON file from /public (default, used by demo)
 *   2. Raw object (for testing / programmatic use)
 *
 * All loaded replays are validated against the shared schema before
 * being returned.  Invalid replays produce a typed error result rather
 * than throwing, so callers can display a non-crashing error state.
 */

import {
  safeValidateReplayFile,
  checkReplayVersion,
  type ReplayFile,
  type SafeValidateResult,
} from "@abyssal/replay-schema";

// ─── Public API ───────────────────────────────────────────────────────────────

/** Path served from Next.js /public folder */
export const SAMPLE_REPLAY_PATH = "/sample-replay.json";

/**
 * Fetch and validate a replay JSON file from the given URL path.
 *
 * The file must be a plain JSON object (not JSONL) with shape:
 *   { header: ReplayHeader, steps: ReplayStep[] }
 *
 * Returns a SafeValidateResult so callers handle errors without try/catch.
 */
export async function loadReplayFromPath(
  path: string = SAMPLE_REPLAY_PATH
): Promise<SafeValidateResult<ReplayFile>> {
  let raw: unknown;

  // ── Network / fetch errors ─────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(path);
  } catch (e) {
    const msg = e instanceof TypeError
      ? `Replay file not reachable: ${path}`
      : `Network error loading replay: ${String(e)}`;
    return { success: false, error: makeZodLikeError(msg) };
  }

  if (res.status === 404) {
    return {
      success: false,
      error: makeZodLikeError(`Replay file not found: ${path}`),
    };
  }
  if (!res.ok) {
    return {
      success: false,
      error: makeZodLikeError(`HTTP ${res.status} loading replay from ${path}`),
    };
  }

  // ── JSON parse errors ──────────────────────────────────────────────────────
  try {
    raw = await res.json();
  } catch {
    return {
      success: false,
      error: makeZodLikeError(
        `Replay file is not valid JSON. Check that ${path} was not corrupted.`
      ),
    };
  }

  // ── Schema validation errors — format concisely ────────────────────────────
  const result = safeValidateReplayFile(raw);
  if (!result.success) {
    const issues = (result.error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
    const summary = issues && issues.length > 0
      ? issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" | ")
      : "Schema mismatch — check replay format matches benchmark version 1.0.0";
    return { success: false, error: makeZodLikeError(summary) };
  }

  // ── Soft version check — log warning, never hard-fail ────────────────────
  const versionWarning = checkReplayVersion(result.data.header);
  if (versionWarning) {
    console.warn(`[replayLoader] ${versionWarning}`);
  }

  return result;
}

/**
 * Validate a raw object against the replay schema without fetching.
 * Useful for testing or passing an in-memory object.
 */
export function loadReplayFromObject(
  raw: unknown
): SafeValidateResult<ReplayFile> {
  return safeValidateReplayFile(raw);
}

// ─── Derived metrics helpers ──────────────────────────────────────────────────

/** Summary metrics derived from a validated ReplayFile. */
export interface ReplaySummaryMetrics {
  totalReward: number;
  stepCount: number;
  goalReached: boolean;
  collisionOccurred: boolean;
  /** true if episode ended via timeout (last doneFlag but no collision/goal) */
  timedOut: boolean;
}

/**
 * Derive episode-level summary metrics from a ReplayFile.
 *
 * These are computed purely from the step data — no env info required.
 */
export function deriveMetrics(replay: ReplayFile): ReplaySummaryMetrics {
  const { steps } = replay;
  if (steps.length === 0) {
    return {
      totalReward: 0,
      stepCount: 0,
      goalReached: false,
      collisionOccurred: false,
      timedOut: false,
    };
  }

  const last = steps[steps.length - 1];
  const totalReward = steps.reduce((sum, s) => sum + s.reward, 0);
  const collisionOccurred = steps.some((s) => s.collisionFlag);

  // Goal reached: episode terminated without collision
  const goalReached = last.doneFlag && !collisionOccurred;
  // Timed out: episode terminated but not by goal or collision
  const timedOut = !goalReached && !collisionOccurred;

  return {
    totalReward: Math.round(totalReward * 100) / 100,
    stepCount: steps.length,
    goalReached,
    collisionOccurred,
    timedOut,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Produce a minimal ZodError-compatible object for non-Zod errors. */
function makeZodLikeError(message: string) {
  // Cast is safe here — callers only use .message for display
  return { message } as unknown as import("zod").ZodError;
}
