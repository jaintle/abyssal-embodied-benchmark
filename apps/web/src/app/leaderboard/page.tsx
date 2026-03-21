"use client";

/**
 * /leaderboard — Public benchmark leaderboard page (Phase C)
 *
 * Loads the canonical leaderboard manifest dynamically and renders:
 *   - Official baseline entries (highlighted)
 *   - Community submissions (with sorting + filtering)
 *   - Submission detail inspector (slide-in panel)
 *
 * Fully data-driven — no hardcoded agent lists.
 * Static-host compatible (all data loaded from /public/data/).
 */

import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import type { LeaderboardEntry, LeaderboardManifest } from "@abyssal/replay-schema";
import { loadLeaderboardManifest } from "@/lib/leaderboardLoader";
import PublicLeaderboardTable from "@/components/PublicLeaderboardTable";
import SubmissionDetailsPanel from "@/components/SubmissionDetailsPanel";

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAGE: CSSProperties = {
  minHeight: "100vh",
  background: "#020a12",
  color: "#7ab8d0",
  paddingTop: 36, // NavBar height
};

const CONTENT: CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "32px 28px",
};

const PAGE_TITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "1.1rem",
  letterSpacing: "0.14em",
  color: "#4ab8ff",
  marginBottom: 4,
  textTransform: "uppercase" as const,
};

const PAGE_SUB: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.68rem",
  color: "#2a6a9e",
  letterSpacing: "0.06em",
  marginBottom: 28,
};

const META_ROW: CSSProperties = {
  display: "flex",
  gap: 20,
  marginBottom: 28,
  flexWrap: "wrap" as const,
};

const META_CHIP: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  color: "#4a8aaa",
  background: "rgba(13,59,82,0.35)",
  border: "1px solid #0d3b52",
  borderRadius: 4,
  padding: "4px 10px",
};

const SPINNER: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  color: "#2a6a9e",
  letterSpacing: "0.1em",
  padding: "80px 0",
  textAlign: "center" as const,
};

const ERROR_BOX: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  color: "#ff9944",
  background: "rgba(255,80,0,0.08)",
  border: "1px solid rgba(255,80,0,0.2)",
  borderRadius: 5,
  padding: "20px 24px",
  marginTop: 40,
};

const HOW_TO: CSSProperties = {
  marginTop: 40,
  fontFamily: "monospace",
  fontSize: "0.65rem",
  color: "#2a6a9e",
  background: "rgba(13,59,82,0.15)",
  border: "1px solid #0d3b52",
  borderRadius: 5,
  padding: "18px 20px",
  lineHeight: 1.8,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [manifest, setManifest] = useState<LeaderboardManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    loadLeaderboardManifest().then((result) => {
      setLoading(false);
      if (result.success) {
        setManifest(result.data);
      } else {
        setLoadError(result.error);
      }
    });
  }, []);

  const visibleEntries =
    manifest?.entries.filter((e) => e.status !== "rejected") ?? [];

  const verifiedCount = visibleEntries.filter((e) => e.status === "verified").length;
  const provCount = visibleEntries.filter((e) => e.status === "provisional").length;

  return (
    <div style={PAGE}>
      <div style={{ ...CONTENT, paddingRight: selectedEntry ? 420 : 28 }}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={PAGE_TITLE}>Benchmark Leaderboard</div>
        <div style={PAGE_SUB}>
          Vision-conditioned underwater navigation · abyssal-embodied-benchmark v1.0.0
        </div>

        {manifest && (
          <div style={META_ROW}>
            <span style={META_CHIP}>
              {verifiedCount} verified
            </span>
            <span style={META_CHIP}>
              {provCount} provisional
            </span>
            <span style={META_CHIP}>
              updated {manifest.last_updated}
            </span>
            <span style={META_CHIP}>
              benchmark {manifest.benchmark_version}
            </span>
          </div>
        )}

        {/* ── Loading / error states ───────────────────────────────────── */}
        {loading && (
          <div style={SPINNER}>LOADING LEADERBOARD…</div>
        )}

        {loadError && (
          <div style={ERROR_BOX}>
            <div style={{ marginBottom: 8, color: "#ff6060" }}>
              Could not load leaderboard manifest
            </div>
            <div style={{ color: "#ff9944", lineHeight: 1.7 }}>{loadError}</div>
            <div style={{ marginTop: 12, color: "#4a8aaa", fontSize: "0.62rem" }}>
              Run <code style={{ background: "rgba(255,255,255,0.05)", padding: "1px 4px" }}>
                python python/benchmark/scripts/publish_submission.py …
              </code> to generate public data.
            </div>
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────── */}
        {manifest && visibleEntries.length > 0 && (
          <PublicLeaderboardTable
            entries={visibleEntries}
            selectedId={selectedEntry?.submission_id}
            onSelect={(e) =>
              setSelectedEntry((prev) =>
                prev?.submission_id === e.submission_id ? null : e
              )
            }
          />
        )}

        {/* ── How to submit ─────────────────────────────────────────────── */}
        <div style={HOW_TO}>
          <strong style={{ color: "#4ab8ff" }}>SUBMIT YOUR AGENT</strong>
          {"  "}See{" "}
          <a
            href="https://github.com/janintle/abyssal-embodied-benchmark/blob/main/docs/submissions/how_to_submit.md"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#4ab8ff" }}
          >
            docs/submissions/how_to_submit.md
          </a>{" "}
          for the full guide. Submissions are verified against the official evaluation
          harness before appearing on this board.
          <br />
          Status: <span style={{ color: "#00ffa0" }}>verified</span> = official re-run
          confirmed · <span style={{ color: "#ffcc44" }}>provisional</span> = submitted,
          not yet re-run.
        </div>
      </div>

      {/* ── Submission detail panel ──────────────────────────────────────── */}
      <SubmissionDetailsPanel
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
