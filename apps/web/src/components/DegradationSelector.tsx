"use client";

/**
 * DegradationSelector — preset pill buttons for switching degradation condition (Phase 7)
 *
 * Renders one button per named preset.  Active preset is highlighted.
 * Stateless — parent owns the selected preset.
 */

import type { CSSProperties } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DegradationPreset = "clear" | "mild" | "heavy";

export const DEGRADATION_PRESETS: DegradationPreset[] = ["clear", "mild", "heavy"];

export interface DegradationSelectorProps {
  active: DegradationPreset;
  available: DegradationPreset[];
  onChange: (preset: DegradationPreset) => void;
}

// ─── Preset metadata ──────────────────────────────────────────────────────────

const PRESET_LABELS: Record<DegradationPreset, string> = {
  clear: "CLEAR",
  mild:  "MILD",
  heavy: "HEAVY",
};

const PRESET_COLORS: Record<DegradationPreset, string> = {
  clear: "#00ffa0",
  mild:  "#ffcc44",
  heavy: "#ff6060",
};

const PRESET_DESC: Record<DegradationPreset, string> = {
  clear: "No degradation — baseline (σ=0, vis=30m, dropout=0%)",
  mild:  "Moderate degradation (σ=1.5m, vis=18m, dropout=0%)",
  heavy: "Calibrated severe degradation (σ=2.3m, vis=12.5m, dropout=10%)",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL: CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid #0d3b52",
};

const TITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  letterSpacing: "0.1em",
  color: "#4a9aba",
  marginBottom: 8,
  textTransform: "uppercase" as const,
};

const PILLS: CSSProperties = {
  display: "flex",
  gap: 6,
};

function pillStyle(preset: DegradationPreset, isActive: boolean): CSSProperties {
  const color = PRESET_COLORS[preset];
  return {
    fontFamily: "monospace",
    fontSize: "0.68rem",
    letterSpacing: "0.06em",
    padding: "4px 10px",
    borderRadius: 4,
    cursor: "pointer",
    border: `1px solid ${isActive ? color : "#0d3b52"}`,
    background: isActive ? `${color}22` : "rgba(13,59,82,0.3)",
    color: isActive ? color : "#2a6a9e",
    transition: "border-color 0.12s, color 0.12s, background 0.12s",
    userSelect: "none" as const,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DegradationSelector({
  active,
  available,
  onChange,
}: DegradationSelectorProps) {
  return (
    <div style={PANEL}>
      <div style={TITLE}>degradation preset</div>
      <div style={PILLS}>
        {DEGRADATION_PRESETS.filter((p) => available.includes(p)).map((preset) => (
          <button
            key={preset}
            style={pillStyle(preset, preset === active)}
            onClick={() => onChange(preset)}
            title={PRESET_DESC[preset]}
            disabled={!available.includes(preset)}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: "0.62rem",
          color: PRESET_COLORS[active],
          marginTop: 6,
          letterSpacing: "0.03em",
        }}
      >
        {PRESET_DESC[active]}
      </div>
    </div>
  );
}
