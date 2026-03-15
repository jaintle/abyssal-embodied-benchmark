"use client";

/**
 * ReplayComparisonControls — shared playback controls for multi-agent view (Phase 6)
 *
 * Like PlaybackControls but without the camera-mode toggle:
 * the comparison canvas is always in orbit / overview mode so the user
 * can pan and inspect all agent trajectories simultaneously.
 *
 * Stateless — pure display.  The parent (MultiReplayViewer) owns all state.
 */

import type { CSSProperties } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReplayComparisonControlsProps {
  playing: boolean;
  speed: number;
  currentStep: number;
  totalSteps: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (step: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEEDS = [0.5, 1, 2, 4] as const;

// ─── Styles ───────────────────────────────────────────────────────────────────

const CONTAINER: CSSProperties = {
  position: "absolute",
  bottom: 20,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  pointerEvents: "auto",
  userSelect: "none",
};

const CONTROLS_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "rgba(2, 10, 18, 0.82)",
  border: "1px solid #0d3b52",
  borderRadius: 6,
  padding: "6px 12px",
};

const SCRUBBER_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "rgba(2, 10, 18, 0.82)",
  border: "1px solid #0d3b52",
  borderRadius: 6,
  padding: "5px 12px",
  width: 460,
  boxSizing: "border-box" as const,
};

const BTN_BASE: CSSProperties = {
  background: "rgba(13, 59, 82, 0.6)",
  border: "1px solid #1a5a7a",
  borderRadius: 4,
  color: "#4a9aba",
  fontFamily: "monospace",
  fontSize: "0.75rem",
  padding: "3px 9px",
  cursor: "pointer",
  letterSpacing: "0.04em",
  lineHeight: 1.4,
};

const BTN_ACTIVE: CSSProperties = {
  ...BTN_BASE,
  background: "rgba(0, 255, 160, 0.12)",
  border: "1px solid #00ffa0",
  color: "#00ffa0",
};

const DIVIDER: CSSProperties = {
  width: 1,
  height: 16,
  background: "#0d3b52",
  margin: "0 2px",
  flexShrink: 0,
};

const LABEL: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.68rem",
  color: "#2a6a9e",
  letterSpacing: "0.05em",
  flexShrink: 0,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReplayComparisonControls({
  playing,
  speed,
  currentStep,
  totalSteps,
  onPlay,
  onPause,
  onRestart,
  onSpeedChange,
  onSeek,
}: ReplayComparisonControlsProps) {
  const atEnd = currentStep >= totalSteps - 1;
  const max = Math.max(totalSteps - 1, 1);

  return (
    <div style={CONTAINER}>
      {/* ── Scrubber row ─────────────────────────────────────────────── */}
      <div style={SCRUBBER_ROW}>
        <span style={LABEL}>
          {String(currentStep).padStart(3, "0")}
        </span>
        <input
          type="range"
          min={0}
          max={max}
          value={currentStep}
          onChange={(e) => onSeek(parseInt(e.target.value, 10))}
          style={{
            flex: 1,
            cursor: "pointer",
            accentColor: "#00ffa0",
            height: 3,
          }}
        />
        <span style={LABEL}>
          {String(max).padStart(3, "0")}
        </span>
      </div>

      {/* ── Control buttons row ──────────────────────────────────────── */}
      <div style={CONTROLS_ROW}>
        {/* Restart */}
        <button style={BTN_BASE} onClick={onRestart} title="Restart">
          ↩ RST
        </button>

        <div style={DIVIDER} />

        {/* Play / Pause */}
        <button
          style={playing ? BTN_ACTIVE : BTN_BASE}
          onClick={playing ? onPause : onPlay}
          title={playing ? "Pause" : "Play"}
          disabled={atEnd && !playing}
        >
          {playing ? "⏸ PAUSE" : "▶ PLAY"}
        </button>

        <div style={DIVIDER} />

        {/* Speed selector */}
        <span style={LABEL}>SPEED</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            style={s === speed ? BTN_ACTIVE : BTN_BASE}
            onClick={() => onSpeedChange(s)}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
