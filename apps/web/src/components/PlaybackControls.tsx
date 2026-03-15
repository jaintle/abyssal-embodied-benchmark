"use client";

/**
 * PlaybackControls — 2D overlay controls for replay playback (Phase 4)
 *
 * Renders as an absolutely-positioned DOM overlay over the 3D canvas.
 * Contains: play/pause toggle, restart button, speed selector, progress bar.
 *
 * Kept deliberately minimal — benchmark-oriented, not game-like.
 */

import type { CSSProperties } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaybackControlsProps {
  playing: boolean;
  speed: number;
  currentStep: number;
  totalSteps: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: number) => void;
}

// ─── Speed options ────────────────────────────────────────────────────────────

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
  gap: 8,
  pointerEvents: "auto",
  userSelect: "none",
};

const CONTROLS_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "rgba(2, 10, 18, 0.82)",
  border: "1px solid #0d3b52",
  borderRadius: 6,
  padding: "7px 14px",
};

const BTN_BASE: CSSProperties = {
  background: "rgba(13, 59, 82, 0.6)",
  border: "1px solid #1a5a7a",
  borderRadius: 4,
  color: "#4a9aba",
  fontFamily: "monospace",
  fontSize: "0.78rem",
  padding: "3px 10px",
  cursor: "pointer",
  letterSpacing: "0.05em",
};

const BTN_ACTIVE: CSSProperties = {
  ...BTN_BASE,
  background: "rgba(0, 255, 160, 0.12)",
  border: "1px solid #00ffa0",
  color: "#00ffa0",
};

const DIVIDER: CSSProperties = {
  width: 1,
  height: 18,
  background: "#0d3b52",
  margin: "0 4px",
};

const PROGRESS_TRACK: CSSProperties = {
  width: 220,
  height: 3,
  background: "rgba(13, 59, 82, 0.8)",
  borderRadius: 2,
  overflow: "hidden",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlaybackControls({
  playing,
  speed,
  currentStep,
  totalSteps,
  onPlay,
  onPause,
  onRestart,
  onSpeedChange,
}: PlaybackControlsProps) {
  const progress = totalSteps > 0 ? currentStep / (totalSteps - 1) : 0;
  const atEnd = currentStep >= totalSteps - 1;

  return (
    <div style={CONTAINER}>
      {/* Progress bar */}
      <div style={PROGRESS_TRACK}>
        <div
          style={{
            height: "100%",
            width: `${Math.round(progress * 100)}%`,
            background: atEnd ? "#00ffa0" : "#4a9aba",
            transition: "width 0.08s linear",
          }}
        />
      </div>

      {/* Control buttons */}
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
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "0.70rem",
            color: "#2a6a9e",
            letterSpacing: "0.04em",
          }}
        >
          SPEED
        </span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            style={s === speed ? BTN_ACTIVE : BTN_BASE}
            onClick={() => onSpeedChange(s)}
          >
            {s}×
          </button>
        ))}

        <div style={DIVIDER} />

        {/* Step counter */}
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "0.70rem",
            color: "#2a6a9e",
            minWidth: 70,
            textAlign: "right",
            letterSpacing: "0.04em",
          }}
        >
          {currentStep.toString().padStart(3, "0")}&nbsp;/&nbsp;
          {(totalSteps - 1).toString().padStart(3, "0")}
        </span>
      </div>
    </div>
  );
}
