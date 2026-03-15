"use client";

/**
 * ReplayMetricsPanel — metadata + metrics overlay (Phase 4)
 *
 * Shows:
 *   Header info: benchmarkVersion, worldSeed, episodeSeed, policyId
 *   Live:        current step / total steps
 *   Derived:     totalReward, goalReached, collisionOccurred, stepCount
 *
 * Styled identically to the Phase 1 debug overlay — monospace, dark,
 * benchmark-aesthetic. Positioned top-left.
 */

import type { CSSProperties } from "react";
import type { ReplayFile } from "@abyssal/replay-schema";
import { deriveMetrics, type ReplaySummaryMetrics } from "@/lib/replayLoader";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReplayMetricsPanelProps {
  replay: ReplayFile;
  currentStep: number;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANEL: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  padding: "12px 16px",
  background: "rgba(2, 10, 18, 0.78)",
  borderRight: "1px solid #0d3b52",
  borderBottom: "1px solid #0d3b52",
  borderBottomRightRadius: 6,
  fontFamily: "monospace",
  fontSize: "0.72rem",
  lineHeight: 1.75,
  color: "#4a9aba",
  userSelect: "none",
  pointerEvents: "none",
  minWidth: 210,
};

const SECTION_TITLE: CSSProperties = {
  color: "#2a6a9e",
  fontSize: "0.60rem",
  letterSpacing: "0.12em",
  marginTop: 8,
  marginBottom: 2,
  textTransform: "uppercase",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span style={{ color: "#2a6a9e" }}>{label.padEnd(10, " ")}</span>
      {value}
    </div>
  );
}

function StatusBadge({
  value,
  trueColor = "#00ffa0",
  falseColor = "#4a9aba",
}: {
  value: boolean;
  trueColor?: string;
  falseColor?: string;
}) {
  return (
    <span style={{ color: value ? trueColor : falseColor }}>
      {value ? "YES" : "NO"}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReplayMetricsPanel({
  replay,
  currentStep,
}: ReplayMetricsPanelProps) {
  const { header, steps } = replay;
  const metrics: ReplaySummaryMetrics = deriveMetrics(replay);

  // Live reward up to current step
  const liveReward = steps
    .slice(0, currentStep + 1)
    .reduce((sum, s) => sum + s.reward, 0);

  const currentStepData = steps[currentStep];

  return (
    <div style={PANEL}>
      {/* Title */}
      <div style={{ color: "#00ffa0", fontWeight: "bold", marginBottom: 4 }}>
        ABYSSAL REPLAY
      </div>

      {/* Header metadata */}
      <div style={SECTION_TITLE}>episode</div>
      <Row label="version " value={header.benchmarkVersion} />
      <Row label="policy  " value={header.policyId} />
      <Row label="world   " value={`seed ${header.worldSeed}`} />
      <Row label="episode " value={`seed ${header.episodeSeed}`} />

      {/* Live playback position */}
      <div style={SECTION_TITLE}>playback</div>
      <Row
        label="step    "
        value={
          <>
            <span style={{ color: "#c0e0f0" }}>
              {String(currentStep).padStart(3, "0")}
            </span>
            <span style={{ color: "#2a6a9e" }}> / {steps.length - 1}</span>
          </>
        }
      />
      <Row
        label="reward  "
        value={
          <span
            style={{
              color: liveReward >= 0 ? "#00ffa0" : "#ff6060",
            }}
          >
            {liveReward >= 0 ? "+" : ""}
            {liveReward.toFixed(2)}
          </span>
        }
      />
      {currentStepData && (
        <Row
          label="pos     "
          value={
            <span style={{ color: "#c0e0f0" }}>
              {currentStepData.position[0].toFixed(1)},
              {currentStepData.position[2].toFixed(1)}
            </span>
          }
        />
      )}

      {/* Episode outcome */}
      <div style={SECTION_TITLE}>outcome</div>
      <Row
        label="goal    "
        value={<StatusBadge value={metrics.goalReached} />}
      />
      <Row
        label="collision"
        value={
          <StatusBadge
            value={metrics.collisionOccurred}
            trueColor="#ff6060"
            falseColor="#4a9aba"
          />
        }
      />
      <Row
        label="steps   "
        value={<span style={{ color: "#c0e0f0" }}>{metrics.stepCount}</span>}
      />
      <Row
        label="Σreward "
        value={
          <span
            style={{
              color: metrics.totalReward >= 0 ? "#00ffa0" : "#ff6060",
            }}
          >
            {metrics.totalReward >= 0 ? "+" : ""}
            {metrics.totalReward.toFixed(2)}
          </span>
        }
      />

      {/* Hint */}
      <div
        style={{
          marginTop: 8,
          color: "#1a4a6e",
          fontSize: "0.62rem",
        }}
      >
        drag to orbit · scroll to zoom
      </div>
    </div>
  );
}
