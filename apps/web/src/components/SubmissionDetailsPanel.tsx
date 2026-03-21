"use client";

/**
 * SubmissionDetailsPanel — submission inspector overlay (Phase C)
 *
 * Shows full metadata, per-preset metrics, and action affordances
 * (replay, compare) for a selected LeaderboardEntry.
 *
 * Slides in from the right as a fixed overlay panel.
 * Loads metadata.json and summary.json on demand via submissionLoader.
 */

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { LeaderboardEntry } from "@abyssal/replay-schema";
import type { SubmissionMetadata } from "@abyssal/replay-schema";
import type { SubmissionSummary } from "@/lib/submissionLoader";
import { loadSubmissionMetadata, loadSubmissionSummary } from "@/lib/submissionLoader";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubmissionDetailsPanelProps {
  entry: LeaderboardEntry | null;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string; border: string }> = {
    verified:    { bg: "rgba(0,255,160,0.12)", fg: "#00ffa0", border: "#00ffa0" },
    provisional: { bg: "rgba(255,204,68,0.12)", fg: "#ffcc44", border: "#ffcc44" },
    rejected:    { bg: "rgba(255,80,80,0.12)",  fg: "#ff5050", border: "#ff5050" },
  };
  const c = colors[status] ?? colors.provisional;
  return (
    <span style={{
      display: "inline-block", fontFamily: "monospace", fontSize: "0.62rem",
      letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 3,
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
    }}>
      {status.toUpperCase()}
    </span>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const OVERLAY: CSSProperties = {
  position: "fixed",
  top: 36,            // below NavBar
  right: 0,
  bottom: 0,
  width: 400,
  background: "#020e18",
  borderLeft: "1px solid #0d3b52",
  overflowY: "auto" as const,
  zIndex: 90,
  display: "flex",
  flexDirection: "column",
};

const HEADER: CSSProperties = {
  padding: "16px 20px 12px",
  borderBottom: "1px solid #0d3b52",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const CLOSE_BTN: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  background: "none",
  border: "1px solid #1a4a6a",
  color: "#4a8aaa",
  borderRadius: 3,
  padding: "3px 8px",
  cursor: "pointer",
  flexShrink: 0,
};

const BODY: CSSProperties = {
  padding: "16px 20px",
  flex: 1,
};

const SECTION_TITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.62rem",
  letterSpacing: "0.1em",
  color: "#2a6a9e",
  textTransform: "uppercase" as const,
  marginBottom: 8,
  marginTop: 16,
};

const FIELD_ROW: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "130px 1fr",
  gap: "4px 12px",
  marginBottom: 5,
  fontFamily: "monospace",
  fontSize: "0.68rem",
};

const FIELD_KEY: CSSProperties = {
  color: "#2a6a9e",
  letterSpacing: "0.04em",
};

const FIELD_VAL: CSSProperties = {
  color: "#7ab8d0",
  wordBreak: "break-all" as const,
};

const METRICS_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 6,
};

const METRIC_CARD: CSSProperties = {
  background: "rgba(13,59,82,0.2)",
  border: "1px solid #0d3b52",
  borderRadius: 5,
  padding: "10px 12px",
};

const METRIC_LABEL: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.6rem",
  color: "#2a6a9e",
  letterSpacing: "0.08em",
  marginBottom: 3,
};

const METRIC_VALUE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "1rem",
  color: "#00ffa0",
  fontWeight: "bold" as const,
};

const METRIC_SUB: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.6rem",
  color: "#4a8aaa",
  marginTop: 2,
};

const ACTION_ROW: CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "14px 20px",
  borderTop: "1px solid #0d3b52",
};

const BTN: CSSProperties = {
  flex: 1,
  fontFamily: "monospace",
  fontSize: "0.7rem",
  letterSpacing: "0.05em",
  background: "rgba(13,59,82,0.5)",
  border: "1px solid #1a5a7a",
  color: "#4ab8ff",
  borderRadius: 4,
  padding: "8px 0",
  cursor: "pointer",
  textAlign: "center" as const,
};

const BTN_PRIMARY: CSSProperties = {
  ...BTN,
  background: "rgba(0,255,160,0.10)",
  border: "1px solid #00ffa0",
  color: "#00ffa0",
};

const SPINNER: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  color: "#2a6a9e",
  padding: "24px",
  textAlign: "center" as const,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubmissionDetailsPanel({
  entry,
  onClose,
}: SubmissionDetailsPanelProps) {
  const router = useRouter();
  const [metadata, setMetadata] = useState<SubmissionMetadata | null>(null);
  const [summary, setSummary] = useState<SubmissionSummary | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [sumError, setSumError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entry) {
      setMetadata(null);
      setSummary(null);
      setMetaError(null);
      setSumError(null);
      return;
    }
    setLoading(true);
    setMetadata(null);
    setSummary(null);
    setMetaError(null);
    setSumError(null);

    const loadAll = async () => {
      const [metaResult, sumResult] = await Promise.all([
        loadSubmissionMetadata(entry.metadata_path),
        loadSubmissionSummary(entry.summary_path),
      ]);
      if (metaResult.success) {
        setMetadata(metaResult.data);
      } else {
        setMetaError(metaResult.error);
      }
      if (sumResult.success) {
        setSummary(sumResult.data);
      } else {
        setSumError(sumResult.error);
      }
      setLoading(false);
    };

    loadAll();
  }, [entry?.submission_id]);

  if (!entry) return null;

  const presets = summary ? Object.entries(summary.presets) : [];

  return (
    <div style={OVERLAY}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={HEADER}>
        <div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "0.9rem",
              color: "#7ab8d0",
              marginBottom: 6,
            }}
          >
            {entry.display_name}
          </div>
          <StatusBadge status={entry.status} />
          {entry.status === "verified" && entry.date_verified && (
            <span
              style={{
                marginLeft: 8,
                fontFamily: "monospace",
                fontSize: "0.6rem",
                color: "#2a6a9e",
              }}
            >
              verified {entry.date_verified}
            </span>
          )}
        </div>
        <button style={CLOSE_BTN} onClick={onClose}>
          ✕ CLOSE
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div style={BODY}>
        {/* Submission ID + agent */}
        <div style={SECTION_TITLE}>Submission</div>
        <div style={FIELD_ROW}><span style={FIELD_KEY}>submission_id</span><span style={FIELD_VAL}>{entry.submission_id}</span></div>
        <div style={FIELD_ROW}><span style={FIELD_KEY}>agent_id</span><span style={FIELD_VAL}>{entry.agent_id}</span></div>
        <div style={FIELD_ROW}><span style={FIELD_KEY}>algorithm</span><span style={FIELD_VAL}>{entry.algorithm_family}</span></div>
        <div style={FIELD_ROW}><span style={FIELD_KEY}>obs_type</span><span style={FIELD_VAL}>{entry.observation_type}</span></div>
        <div style={FIELD_ROW}><span style={FIELD_KEY}>benchmark</span><span style={FIELD_VAL}>{entry.benchmark_version}</span></div>

        {/* Team / authorship */}
        <div style={SECTION_TITLE}>Author</div>
        <div style={FIELD_ROW}><span style={FIELD_KEY}>team</span><span style={FIELD_VAL}>{entry.team_name}</span></div>
        {loading && <div style={SPINNER}>loading metadata…</div>}
        {metaError && (
          <div style={{ fontFamily: "monospace", fontSize: "0.65rem", color: "#ff9944", padding: "6px 0" }}>
            Metadata unavailable: {metaError}
          </div>
        )}
        {metadata && (
          <>
            <div style={FIELD_ROW}><span style={FIELD_KEY}>author</span><span style={FIELD_VAL}>{metadata.author_name}</span></div>
            <div style={FIELD_ROW}><span style={FIELD_KEY}>contact</span><span style={FIELD_VAL}>{metadata.contact}</span></div>
            {metadata.institution && (
              <div style={FIELD_ROW}><span style={FIELD_KEY}>institution</span><span style={FIELD_VAL}>{metadata.institution}</span></div>
            )}
            <div style={FIELD_ROW}><span style={FIELD_KEY}>commit</span><span style={FIELD_VAL}>{metadata.commit_hash}</span></div>
            <div style={FIELD_ROW}><span style={FIELD_KEY}>license</span><span style={FIELD_VAL}>{metadata.license}</span></div>
            {metadata.repo_url && (
              <div style={FIELD_ROW}>
                <span style={FIELD_KEY}>repo</span>
                <a
                  href={metadata.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...FIELD_VAL, color: "#4ab8ff", textDecoration: "none" }}
                >
                  {metadata.repo_url.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
            {metadata.paper_url && (
              <div style={FIELD_ROW}>
                <span style={FIELD_KEY}>paper</span>
                <a
                  href={metadata.paper_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...FIELD_VAL, color: "#4ab8ff", textDecoration: "none" }}
                >
                  paper link
                </a>
              </div>
            )}
            {metadata.training_notes && (
              <>
                <div style={SECTION_TITLE}>Training Notes</div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.66rem",
                    color: "#7ab8d0",
                    lineHeight: 1.6,
                    background: "rgba(13,59,82,0.2)",
                    border: "1px solid #0d3b52",
                    borderRadius: 4,
                    padding: "8px 10px",
                  }}
                >
                  {metadata.training_notes}
                </div>
              </>
            )}
            {metadata.model_size && (
              <div style={{ ...FIELD_ROW, marginTop: 8 }}>
                <span style={FIELD_KEY}>model_size</span>
                <span style={FIELD_VAL}>{metadata.model_size}</span>
              </div>
            )}
            {metadata.hardware_notes && (
              <div style={FIELD_ROW}>
                <span style={FIELD_KEY}>hardware</span>
                <span style={FIELD_VAL}>{metadata.hardware_notes}</span>
              </div>
            )}
          </>
        )}

        {/* Per-preset metrics */}
        {sumError && (
          <div style={{ fontFamily: "monospace", fontSize: "0.65rem", color: "#ff9944", padding: "8px 0" }}>
            Summary unavailable: {sumError}
          </div>
        )}
        {presets.length > 0 && (
          <>
            <div style={SECTION_TITLE}>Benchmark Metrics</div>
            {presets.map(([preset, m]) => (
              <div key={preset} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.62rem",
                    color: preset === "heavy" ? "#ffcc44" : "#88ff00",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                  }}
                >
                  {preset.toUpperCase()} PRESET
                </div>
                <div style={METRICS_GRID}>
                  <div style={METRIC_CARD}>
                    <div style={METRIC_LABEL}>SUCCESS RATE</div>
                    <div style={METRIC_VALUE}>{pct(m.success_rate)}</div>
                    <div style={METRIC_SUB}>{m.n_episodes} episodes</div>
                  </div>
                  <div style={METRIC_CARD}>
                    <div style={METRIC_LABEL}>COLLISION RATE</div>
                    <div style={{ ...METRIC_VALUE, color: m.collision_rate > 0.2 ? "#ff6060" : "#7ab8d0" }}>
                      {pct(m.collision_rate)}
                    </div>
                  </div>
                  <div style={METRIC_CARD}>
                    <div style={METRIC_LABEL}>MEAN REWARD</div>
                    <div style={METRIC_VALUE}>{m.mean_reward >= 0 ? "+" : ""}{fmt(m.mean_reward)}</div>
                  </div>
                  <div style={METRIC_CARD}>
                    <div style={METRIC_LABEL}>DIST TO GOAL</div>
                    <div style={{ ...METRIC_VALUE, color: "#7ab8d0" }}>{fmt(m.mean_final_dist)}</div>
                  </div>
                </div>
              </div>
            ))}
            {summary && (
              <div style={{ fontFamily: "monospace", fontSize: "0.62rem", color: "#1a4a6a", marginTop: 8 }}>
                world_seed={summary.world_seed} · {summary.n_episodes} episodes
              </div>
            )}
          </>
        )}

        {/* Entry-level success rates (fallback if no summary) */}
        {presets.length === 0 && (entry.clear_success_rate !== null || entry.heavy_success_rate !== null) && (
          <>
            <div style={SECTION_TITLE}>Reported Metrics</div>
            <div style={METRICS_GRID}>
              {entry.clear_success_rate !== null && (
                <div style={METRIC_CARD}>
                  <div style={METRIC_LABEL}>CLEAR SUCCESS</div>
                  <div style={METRIC_VALUE}>{pct(entry.clear_success_rate)}</div>
                </div>
              )}
              {entry.heavy_success_rate !== null && (
                <div style={METRIC_CARD}>
                  <div style={METRIC_LABEL}>HEAVY SUCCESS</div>
                  <div style={METRIC_VALUE}>{pct(entry.heavy_success_rate)}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div style={ACTION_ROW}>
        <button
          style={BTN_PRIMARY}
          onClick={() => {
            router.push(`/replays?agents=${entry.submission_id}&preset=clear&episode=1`);
          }}
        >
          ▶ REPLAY
        </button>
        <button
          style={BTN}
          onClick={() => {
            router.push(`/replays?agents=${entry.submission_id}&preset=clear`);
          }}
        >
          ⊕ COMPARE
        </button>
      </div>
    </div>
  );
}
