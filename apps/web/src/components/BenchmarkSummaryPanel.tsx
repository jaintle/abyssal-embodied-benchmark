"use client";

/**
 * BenchmarkSummaryPanel — benchmark metadata display (Phase 6)
 *
 * Shows: world seed, episode count, max steps, recorded date,
 * benchmark version, and the comparison episode seed.
 * Stateless — pure display.
 */

import type { CSSProperties } from "react";
import type { BenchmarkConfig } from "@/lib/benchmarkLoader";
import { agentColor } from "@/lib/sampleBenchmark";

export interface BenchmarkSummaryPanelProps {
  config: BenchmarkConfig;
  episodeSeed: number;
  /** Agent ids with loaded replays (shown as color swatches) */
  agentIds: string[];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL: CSSProperties = {
  padding: "14px 14px 10px",
  borderBottom: "1px solid #0d3b52",
};

const TITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.85rem",
  letterSpacing: "0.12em",
  color: "#4a9aba",
  marginBottom: 10,
  textTransform: "uppercase" as const,
};

const SUBTITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  letterSpacing: "0.1em",
  color: "#2a6a9e",
  marginBottom: 8,
  textTransform: "uppercase" as const,
};

const ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: 4,
};

const KEY: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  color: "#2a6a9e",
  letterSpacing: "0.04em",
  flexShrink: 0,
};

const VAL: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  color: "#7ab8d0",
  letterSpacing: "0.03em",
  textAlign: "right" as const,
};

const SWATCH_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 6,
  marginTop: 8,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function BenchmarkSummaryPanel({
  config,
  episodeSeed,
  agentIds,
}: BenchmarkSummaryPanelProps) {
  const date = config.recorded_at
    ? config.recorded_at.slice(0, 10)
    : "—";

  return (
    <div style={PANEL}>
      <div style={TITLE}>abyssal benchmark</div>

      <div style={SUBTITLE}>run config</div>

      <div style={ROW}>
        <span style={KEY}>world seed</span>
        <span style={VAL}>{config.world_seed}</span>
      </div>
      <div style={ROW}>
        <span style={KEY}>episodes</span>
        <span style={VAL}>{config.n_episodes}</span>
      </div>
      <div style={ROW}>
        <span style={KEY}>max steps</span>
        <span style={VAL}>{config.max_steps}</span>
      </div>
      <div style={ROW}>
        <span style={KEY}>version</span>
        <span style={VAL}>{config.benchmark_version}</span>
      </div>
      <div style={ROW}>
        <span style={KEY}>recorded</span>
        <span style={VAL}>{date}</span>
      </div>

      <div style={{ ...SUBTITLE, marginTop: 10 }}>comparison episode</div>
      <div style={ROW}>
        <span style={KEY}>seed</span>
        <span style={{ ...VAL, color: "#00ffa0", fontSize: "0.65rem" }}>
          {episodeSeed}
        </span>
      </div>

      <div style={{ ...SUBTITLE, marginTop: 10 }}>agents</div>
      <div style={SWATCH_ROW}>
        {agentIds.map((id, i) => (
          <span
            key={id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "monospace",
              fontSize: "0.68rem",
              color: agentColor(id, i),
              background: "rgba(13,59,82,0.35)",
              border: `1px solid ${agentColor(id, i)}44`,
              borderRadius: 3,
              padding: "2px 7px",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: agentColor(id, i),
                flexShrink: 0,
              }}
            />
            {id}
          </span>
        ))}
      </div>
    </div>
  );
}
