"use client";

/**
 * LeaderboardTable — aggregate benchmark metrics, one row per agent (Phase 6)
 *
 * Highlights the best value in each metric column (green for best, subtle
 * dimming for worst in key metrics). Stateless — pure display component.
 */

import type { CSSProperties } from "react";
import type { AgentSummary } from "@/lib/benchmarkLoader";
import { agentColor } from "@/lib/sampleBenchmark";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeaderboardTableProps {
  summaries: AgentSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

function fmt(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

/** Outcome badge: compact colored pill */
function OutcomeDot({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        marginRight: 5,
        flexShrink: 0,
      }}
      title={label}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #0d3b52",
};

const TITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  letterSpacing: "0.1em",
  color: "#2a6a9e",
  marginBottom: 10,
  textTransform: "uppercase" as const,
};

const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontFamily: "monospace",
  fontSize: "0.68rem",
};

const TH: CSSProperties = {
  textAlign: "right" as const,
  padding: "3px 6px",
  color: "#2a6a9e",
  letterSpacing: "0.04em",
  borderBottom: "1px solid #0d3b52",
  whiteSpace: "nowrap" as const,
  fontWeight: "normal" as const,
};

const TH_FIRST: CSSProperties = {
  ...TH,
  textAlign: "left" as const,
  paddingLeft: 0,
};

const TD_BASE: CSSProperties = {
  textAlign: "right" as const,
  padding: "4px 6px",
  color: "#7ab8d0",
  borderBottom: "1px solid rgba(13,59,82,0.4)",
  whiteSpace: "nowrap" as const,
};

const TD_FIRST: CSSProperties = {
  ...TD_BASE,
  textAlign: "left" as const,
  paddingLeft: 0,
};

const TD_BEST: CSSProperties = {
  ...TD_BASE,
  color: "#00ffa0",
  fontWeight: "bold" as const,
};

const TD_WORST: CSSProperties = {
  ...TD_BASE,
  color: "#3a5a6a",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LeaderboardTable({ summaries }: LeaderboardTableProps) {
  if (summaries.length === 0) return null;

  // ── Pre-compute best/worst per column ──────────────────────────────────────
  const best = {
    success:    Math.max(...summaries.map((s) => s.success_rate)),
    collision:  Math.min(...summaries.map((s) => s.collision_rate)),
    reward:     Math.max(...summaries.map((s) => s.mean_reward)),
    dist:       Math.min(...summaries.map((s) => s.mean_final_dist)),
  };
  const worst = {
    success:    Math.min(...summaries.map((s) => s.success_rate)),
    collision:  Math.max(...summaries.map((s) => s.collision_rate)),
    reward:     Math.min(...summaries.map((s) => s.mean_reward)),
    dist:       Math.max(...summaries.map((s) => s.mean_final_dist)),
  };

  // ── Rank by success rate then mean reward ──────────────────────────────────
  const ranked = [...summaries].sort((a, b) =>
    b.success_rate !== a.success_rate
      ? b.success_rate - a.success_rate
      : b.mean_reward - a.mean_reward
  );

  function tdStyle(value: number, bestVal: number, worstVal: number, higherIsBetter: boolean): CSSProperties {
    if (summaries.length < 2) return TD_BASE;
    const isBest = higherIsBetter ? value === bestVal : value === bestVal;
    const isWorst = higherIsBetter ? value === worstVal : value === worstVal;
    if (isBest && isBest !== isWorst) return TD_BEST;
    if (isWorst && isBest !== isWorst) return TD_WORST;
    return TD_BASE;
  }

  return (
    <div style={PANEL}>
      <div style={TITLE}>leaderboard</div>
      <table style={TABLE}>
        <thead>
          <tr>
            <th style={TH_FIRST}>agent</th>
            <th style={TH}>succ</th>
            <th style={TH}>coll</th>
            <th style={TH}>tout</th>
            <th style={TH}>reward</th>
            <th style={TH}>steps</th>
            <th style={TH}>dist</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s, rank) => {
            const color = agentColor(s.agent_id, rank);
            return (
              <tr key={s.agent_id}>
                <td style={TD_FIRST}>
                  <OutcomeDot color={color} label={s.agent_id} />
                  <span style={{ color }}>{s.agent_id}</span>
                  {rank === 0 && (
                    <span style={{ color: "#00ffa0", marginLeft: 5, fontSize: "0.6rem" }}>★</span>
                  )}
                </td>
                <td style={tdStyle(s.success_rate, best.success, worst.success, true)}>
                  {pct(s.success_rate)}
                </td>
                <td style={tdStyle(s.collision_rate, best.collision, worst.collision, false)}>
                  {pct(s.collision_rate)}
                </td>
                <td style={TD_BASE}>{pct(s.timeout_rate)}</td>
                <td style={tdStyle(s.mean_reward, best.reward, worst.reward, true)}>
                  {s.mean_reward >= 0 ? "+" : ""}{fmt(s.mean_reward)}
                </td>
                <td style={TD_BASE}>{fmt(s.mean_steps, 0)}</td>
                <td style={tdStyle(s.mean_final_dist, best.dist, worst.dist, false)}>
                  {fmt(s.mean_final_dist)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
