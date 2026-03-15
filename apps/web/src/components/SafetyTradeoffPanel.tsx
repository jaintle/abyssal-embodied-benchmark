"use client";

/**
 * SafetyTradeoffPanel — compact safety-performance tradeoff table (Phase 8)
 *
 * Shows the key tradeoff metrics for comparing standard vs cautious agents:
 *   collision rate  ←→  timeout rate  ←→  mean action magnitude
 *
 * Stateless — pure display component.
 */

import type { CSSProperties } from "react";
import type { RobustnessSummaryRow } from "@/lib/benchmarkLoader";
import { agentColor } from "@/lib/sampleBenchmark";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SafetyTradeoffPanelProps {
  rows: RobustnessSummaryRow[];
  /** Active degradation preset to filter rows. If undefined, show all presets. */
  activePreset?: string;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL: CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid #0d3b52",
};

const TITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  letterSpacing: "0.1em",
  color: "#2a6a9e",
  marginBottom: 8,
  textTransform: "uppercase" as const,
};

const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontFamily: "monospace",
  fontSize: "0.65rem",
};

const TH: CSSProperties = {
  textAlign: "right" as const,
  padding: "2px 5px",
  color: "#2a6a9e",
  letterSpacing: "0.04em",
  borderBottom: "1px solid #0d3b52",
  fontWeight: "normal" as const,
  whiteSpace: "nowrap" as const,
};

const TH_FIRST: CSSProperties = {
  ...TH,
  textAlign: "left" as const,
  paddingLeft: 0,
};

const TD: CSSProperties = {
  textAlign: "right" as const,
  padding: "3px 5px",
  color: "#7ab8d0",
  borderBottom: "1px solid rgba(13,59,82,0.4)",
  whiteSpace: "nowrap" as const,
};

const TD_FIRST: CSSProperties = {
  ...TD,
  textAlign: "left" as const,
  paddingLeft: 0,
};

const TD_GOOD: CSSProperties = { ...TD, color: "#00ffa0" };
const TD_BAD:  CSSProperties = { ...TD, color: "#ff6060" };

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function fmtMag(v?: number): string {
  return v !== undefined ? v.toFixed(2) : "—";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SafetyTradeoffPanel({ rows, activePreset }: SafetyTradeoffPanelProps) {
  // Filter to active preset if specified; otherwise show all rows
  const filtered = activePreset
    ? rows.filter((r) => r.degradation_preset === activePreset)
    : rows;

  if (filtered.length === 0) return null;

  // Compute column bests for collision and speed
  const bestColl = Math.min(...filtered.map((r) => r.collision_rate));
  const bestMag  = Math.min(...filtered.map((r) => r.mean_action_magnitude ?? 1));

  return (
    <div style={PANEL}>
      <div style={TITLE}>safety tradeoff</div>
      <table style={TABLE}>
        <thead>
          <tr>
            <th style={TH_FIRST}>agent</th>
            <th style={TH} title="Collision rate — lower is safer">coll%</th>
            <th style={TH} title="Timeout rate — higher means slower">tout%</th>
            <th style={TH} title="Mean action magnitude — lower = more conservative">speed</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, idx) => {
            const color = agentColor(r.agent_id, idx);
            const collTd =
              r.collision_rate === bestColl && filtered.length > 1 ? TD_GOOD :
              r.collision_rate >  0                                 ? TD_BAD  : TD;
            const speedTd =
              (r.mean_action_magnitude ?? 1) === bestMag && filtered.length > 1
                ? TD_GOOD : TD;
            return (
              <tr key={`${r.agent_id}-${r.degradation_preset}`}>
                <td style={TD_FIRST}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: color,
                      marginRight: 5,
                      verticalAlign: "middle",
                    }}
                  />
                  <span style={{ color }}>{r.agent_id}</span>
                </td>
                <td style={collTd}>{pct(r.collision_rate)}</td>
                <td style={TD}>{pct(r.timeout_rate)}</td>
                <td style={speedTd}>{fmtMag(r.mean_action_magnitude)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Interpretive footnote */}
      <div
        style={{
          fontFamily: "monospace",
          fontSize: "0.58rem",
          color: "#2a6a9e",
          marginTop: 6,
          lineHeight: 1.4,
        }}
      >
        cautious: lower coll · lower speed · higher tout
      </div>
    </div>
  );
}
