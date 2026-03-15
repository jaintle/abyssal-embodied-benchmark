"use client";

/**
 * AgentBehaviorBadge — compact badge showing agent policy type (Phase 8)
 *
 * Classifies agent_id into one of four categories and renders a small
 * colored pill: CAUTIOUS / PPO / HEURISTIC / RANDOM.
 *
 * Stateless — pure display.
 */

import type { CSSProperties } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentClass = "cautious" | "ppo" | "heuristic" | "random" | "unknown";

function classifyAgent(agentId: string): AgentClass {
  const id = agentId.toLowerCase();
  if (id.includes("cautious")) return "cautious";
  if (id === "ppo" || id.startsWith("ppo_") || id.startsWith("ppo:")) return "ppo";
  if (id === "heuristic") return "heuristic";
  if (id === "random") return "random";
  return "unknown";
}

const CLASS_LABELS: Record<AgentClass, string> = {
  cautious:  "CAUTIOUS",
  ppo:       "PPO",
  heuristic: "HEURISTIC",
  random:    "RANDOM",
  unknown:   "?",
};

const CLASS_COLORS: Record<AgentClass, string> = {
  cautious:  "#ffcc44",
  ppo:       "#4ab8ff",
  heuristic: "#00ffa0",
  random:    "#ff6060",
  unknown:   "#7ab8d0",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentBehaviorBadge({ agentId }: { agentId: string }) {
  const cls = classifyAgent(agentId);
  const color = CLASS_COLORS[cls];
  const label = CLASS_LABELS[cls];

  const style: CSSProperties = {
    display: "inline-block",
    fontFamily: "monospace",
    fontSize: "0.54rem",
    letterSpacing: "0.05em",
    padding: "1px 5px",
    borderRadius: 3,
    border: `1px solid ${color}55`,
    background: `${color}18`,
    color,
    marginLeft: 5,
    verticalAlign: "middle",
    lineHeight: "1.4",
    userSelect: "none",
  };

  return <span style={style}>{label}</span>;
}
