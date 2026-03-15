"use client";

/**
 * RobustnessPanel — aggregate robustness comparison across degradation presets (Phase 7)
 *
 * Shows a compact table: one row per agent, columns = clear / heavy success rates
 * plus a Δ (drop from clear to heavy).
 *
 * Only shows presets that have data in the supplied robustness summary.
 * Stateless — pure display component.
 */

import type { CSSProperties } from "react";
import type { RobustnessSummaryRow } from "@/lib/benchmarkLoader";
import { agentColor } from "@/lib/sampleBenchmark";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RobustnessPanelProps {
  rows: RobustnessSummaryRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number | undefined): string {
  if (v === undefined) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function delta(clear: number | undefined, heavy: number | undefined): string {
  if (clear === undefined || heavy === undefined) return "—";
  const d = (heavy - clear) * 100;
  if (d === 0) return "±0%";
  return d > 0 ? `+${d.toFixed(0)}%` : `${d.toFixed(0)}%`;
}

function deltaColor(clear: number | undefined, heavy: number | undefined): string {
  if (clear === undefined || heavy === undefined) return "#2a6a9e";
  const d = heavy - clear;
  if (d < -0.05) return "#ff6060";  // got worse
  if (d > 0.05) return "#00ffa0";   // got better
  return "#2a6a9e";                 // no change
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
  padding: "2px 6px",
  color: "#2a6a9e",
  borderBottom: "1px solid #0d3b52",
  fontWeight: "normal" as const,
  whiteSpace: "nowrap" as const,
};

const TH_FIRST: CSSProperties = { ...TH, textAlign: "left" as const, paddingLeft: 0 };

const TD: CSSProperties = {
  textAlign: "right" as const,
  padding: "3px 6px",
  color: "#7ab8d0",
  borderBottom: "1px solid rgba(13,59,82,0.4)",
};

const TD_FIRST: CSSProperties = { ...TD, textAlign: "left" as const, paddingLeft: 0 };

// ─── Component ────────────────────────────────────────────────────────────────

export default function RobustnessPanel({ rows }: RobustnessPanelProps) {
  if (rows.length === 0) return null;

  // Build lookup: agentId → preset → row
  const lookup: Record<string, Record<string, RobustnessSummaryRow>> = {};
  const agentIds: string[] = [];
  for (const row of rows) {
    if (!lookup[row.agent_id]) {
      lookup[row.agent_id] = {};
      agentIds.push(row.agent_id);
    }
    lookup[row.agent_id][row.degradation_preset] = row;
  }

  const presets = Array.from(new Set(rows.map((r) => r.degradation_preset)));
  const hasHeavy = presets.includes("heavy");
  const hasClear = presets.includes("clear");

  return (
    <div style={PANEL}>
      <div style={TITLE}>robustness — success rate by condition</div>
      <table style={TABLE}>
        <thead>
          <tr>
            <th style={TH_FIRST}>agent</th>
            {hasClear && <th style={TH} title="Success rate under clear conditions (no degradation)">clear</th>}
            {hasHeavy && <th style={TH} title="Success rate under heavy degradation (σ=5m noise, 20% dropout)">heavy</th>}
            {hasClear && hasHeavy && <th style={TH} title="Change in success rate from clear → heavy">Δ</th>}
          </tr>
        </thead>
        <tbody>
          {agentIds.map((id, idx) => {
            const clearRow = lookup[id]?.["clear"];
            const heavyRow = lookup[id]?.["heavy"];
            const color = agentColor(id, idx);
            const d = hasClear && hasHeavy
              ? delta(clearRow?.success_rate, heavyRow?.success_rate)
              : undefined;
            const dc = hasClear && hasHeavy
              ? deltaColor(clearRow?.success_rate, heavyRow?.success_rate)
              : "#2a6a9e";

            return (
              <tr key={id}>
                <td style={{ ...TD_FIRST, color }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: color,
                      marginRight: 5,
                      flexShrink: 0,
                    }}
                  />
                  {id}
                </td>
                {hasClear && (
                  <td style={{ ...TD, color: "#00ffa0" }}>
                    {pct(clearRow?.success_rate)}
                  </td>
                )}
                {hasHeavy && (
                  <td style={{ ...TD, color: "#ff8080" }}>
                    {pct(heavyRow?.success_rate)}
                  </td>
                )}
                {d !== undefined && (
                  <td style={{ ...TD, color: dc, fontWeight: "bold" as const }}>
                    {d}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
