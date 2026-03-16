/**
 * validate_replay.ts — Phase 2: cross-contract replay validator CLI
 *
 * Reads a JSONL replay file written by the Python benchmark pipeline and
 * validates it against the shared @abyssal/replay-schema Zod schema.
 *
 * Run with tsx (no pre-build required):
 *   npx tsx tools/validate_replay.ts <path-to-replay.jsonl>
 *
 * Exit codes:
 *   0 — replay is valid
 *   1 — validation error or file not found
 *
 * Used by:
 *   tools/contract_test.sh
 *   .github/workflows/ci.yml
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import {
  safeValidateReplayFile,
  checkReplayVersion,
  BENCHMARK_VERSION,
} from "@abyssal/replay-schema";

// ─── Entry ────────────────────────────────────────────────────────────────────

const [, , inputArg] = process.argv;

if (!inputArg) {
  console.error("Usage: npx tsx tools/validate_replay.ts <path-to-replay.jsonl>");
  process.exit(1);
}

const filePath = resolve(inputArg);

console.log(`validate_replay  benchmarkVersion=${BENCHMARK_VERSION}`);
console.log(`  file: ${filePath}`);

// ─── Read file ────────────────────────────────────────────────────────────────

let raw: string;
try {
  raw = readFileSync(filePath, "utf-8");
} catch (e) {
  console.error(`✗ Cannot read file: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

const lines = raw.trim().split("\n").filter((l) => l.trim().length > 0);
if (lines.length < 2) {
  console.error(`✗ JSONL file has fewer than 2 lines (expected header + ≥1 step). Got ${lines.length}.`);
  process.exit(1);
}

// ─── Parse JSONL ──────────────────────────────────────────────────────────────

let header: unknown;
const steps: unknown[] = [];

try {
  header = JSON.parse(lines[0]);
} catch (e) {
  console.error(`✗ Line 0 (header) is not valid JSON: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

for (let i = 1; i < lines.length; i++) {
  try {
    steps.push(JSON.parse(lines[i]));
  } catch (e) {
    console.error(`✗ Line ${i} (step ${i - 1}) is not valid JSON: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

// Reconstruct { header, steps } from flat JSONL
const replayObject = { header, steps };

// ─── Schema validation ────────────────────────────────────────────────────────

const result = safeValidateReplayFile(replayObject);

if (!result.success) {
  console.error("✗ Schema validation failed:");
  const issues = (result.error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (issues) {
    for (const issue of issues.slice(0, 10)) {
      console.error(`    ${issue.path.join(".")} — ${issue.message}`);
    }
  } else {
    console.error(`    ${result.error}`);
  }
  process.exit(1);
}

// ─── Soft version check ───────────────────────────────────────────────────────

const versionWarning = checkReplayVersion(result.data.header);
if (versionWarning) {
  console.warn(`  ⚠  ${versionWarning}`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const { header: h, steps: s } = result.data;
console.log(`  benchmarkVersion : ${h.benchmarkVersion}`);
console.log(`  worldSeed        : ${h.worldSeed}`);
console.log(`  episodeSeed      : ${h.episodeSeed}`);
console.log(`  policyId         : ${h.policyId}`);
console.log(`  envVersion       : ${h.envVersion}`);
console.log(`  steps            : ${s.length}`);
console.log(`✓ Replay valid`);
process.exit(0);
