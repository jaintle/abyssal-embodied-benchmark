"use client";

/**
 * MultiReplayViewer — state container for the multi-agent comparison view (Phase 6 / Phase 7)
 *
 * Phase 7 additions:
 *   - DegradationSelector: switch between "clear" and "heavy" presets
 *   - RobustnessPanel: compact Δ table (clear → heavy success rate)
 *   - Per-preset bundle loading: switching preset reloads config, summaries, and replays
 *   - BenchmarkSummaryPanel now receives activePreset
 *
 * Layout (two-column):
 *   left  → sidebar: BenchmarkSummaryPanel + DegradationSelector + LeaderboardTable
 *                     + RobustnessPanel
 *   right → ComparisonScene (3D canvas) + ReplayComparisonControls overlay
 */

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { CSSProperties } from "react";

import {
  loadPresetBenchmark,
  loadSampleRobustnessSummary,
  agentColor,
  ROBUSTNESS_PRESETS,
  type SamplePreset,
} from "@/lib/sampleBenchmark";
import type { BenchmarkBundle, RobustnessSummaryRow } from "@/lib/benchmarkLoader";
import type { ComparisonAgent } from "./ComparisonScene";
import BenchmarkSummaryPanel from "./BenchmarkSummaryPanel";
import LeaderboardTable from "./LeaderboardTable";
import ReplayComparisonControls from "./ReplayComparisonControls";
import DegradationSelector from "./DegradationSelector";
import RobustnessPanel from "./RobustnessPanel";

// ─── Lazy-loaded 3D canvas (no SSR — WebGL requires browser) ─────────────────

const ComparisonScene = dynamic(() => import("./ComparisonScene"), {
  ssr: false,
  loading: () => (
    <div style={CANVAS_LOADING}>
      INITIALISING WORLD…
    </div>
  ),
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const ROOT: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  background: "#020a12",
  overflow: "hidden",
};

const SIDEBAR: CSSProperties = {
  width: 280,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  borderRight: "1px solid #0d3b52",
  overflowY: "auto",
  overflowX: "hidden",
};

const CANVAS_WRAPPER: CSSProperties = {
  flex: 1,
  position: "relative",
  overflow: "hidden",
};

const CANVAS_LOADING: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#4a9aba",
  fontFamily: "monospace",
  fontSize: "0.85rem",
  letterSpacing: "0.08em",
};

const FULL_SCREEN: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#020a12",
};

const STATUS_TEXT: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.85rem",
  letterSpacing: "0.08em",
  color: "#4a9aba",
  textAlign: "center",
  lineHeight: 2 as const,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildComparisonAgents(bundle: BenchmarkBundle): ComparisonAgent[] {
  return bundle.config.agent_ids
    .map((id, i) => {
      const replay = bundle.replays[id];
      if (!replay) return null;
      return { agentId: id, replay, color: agentColor(id, i) };
    })
    .filter((a): a is ComparisonAgent => a !== null);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MultiReplayViewer() {
  // ── Bundle state ───────────────────────────────────────────────────────────
  const [bundle, setBundle] = useState<BenchmarkBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Degradation state (Phase 7) ────────────────────────────────────────────
  const [activePreset, setActivePreset] = useState<SamplePreset>("clear");
  const [robustnessSummary, setRobustnessSummary] = useState<RobustnessSummaryRow[]>([]);

  // ── Playback state ─────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentStep, setCurrentStep] = useState(0);
  const [playbackKey, setPlaybackKey] = useState(0);
  const [seekVersion, setSeekVersion] = useState(0);
  const [seekToStep, setSeekToStep] = useState(0);

  // ── Load robustness summary once on mount ──────────────────────────────────
  useEffect(() => {
    loadSampleRobustnessSummary().then((result) => {
      if (result.success) setRobustnessSummary(result.data);
    });
  }, []);

  // ── Load bundle whenever preset changes ───────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    setPlaying(false);
    setCurrentStep(0);
    setSeekToStep(0);
    setPlaybackKey((k) => k + 1);

    loadPresetBenchmark(activePreset).then((result) => {
      if (result.success) {
        setBundle(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? "Failed to load benchmark bundle");
      }
      setIsLoading(false);
    });
  }, [activePreset]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const comparisonAgents: ComparisonAgent[] = bundle
    ? buildComparisonAgents(bundle)
    : [];

  const totalSteps = comparisonAgents.reduce(
    (max, a) => Math.max(max, a.replay.steps.length),
    1
  );

  const loadedAgentIds = comparisonAgents.map((a) => a.agentId);

  // ── Playback handlers ──────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    setPlaying(false);
    setCurrentStep(0);
    setSeekToStep(0);
    setPlaybackKey((k) => k + 1);
  }, []);

  const handleStepChange = useCallback(
    (step: number) => {
      setCurrentStep(step);
      if (step >= totalSteps - 1) setPlaying(false);
    },
    [totalSteps]
  );

  const handleSeek = useCallback((step: number) => {
    setPlaying(false);
    setCurrentStep(step);
    setSeekToStep(step);
    setSeekVersion((v) => v + 1);
  }, []);

  // Cast is safe: DegradationSelector only fires onChange with presets in `available`
  const handlePresetChange = useCallback((preset: string) => {
    if (ROBUSTNESS_PRESETS.includes(preset as SamplePreset)) {
      setActivePreset(preset as SamplePreset);
    }
  }, []);

  // ── Render: loading ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={FULL_SCREEN}>
        <div style={STATUS_TEXT}>LOADING BENCHMARK…</div>
      </div>
    );
  }

  // ── Render: error ──────────────────────────────────────────────────────────
  if (loadError || !bundle) {
    return (
      <div style={FULL_SCREEN}>
        <div style={{ ...STATUS_TEXT, color: "#ff6060" }}>
          BENCHMARK ERROR
          <br />
          <span style={{ fontSize: "0.70rem", color: "#4a9aba" }}>
            {loadError ?? "unknown error"}
          </span>
        </div>
      </div>
    );
  }

  // ── Render: full viewer ────────────────────────────────────────────────────
  return (
    <div style={ROOT}>
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside style={SIDEBAR}>
        <BenchmarkSummaryPanel
          config={bundle.config}
          episodeSeed={bundle.episodeSeed}
          agentIds={loadedAgentIds}
          activePreset={activePreset}
        />

        {/* Degradation preset selector (Phase 7) */}
        <DegradationSelector
          active={activePreset}
          available={[...ROBUSTNESS_PRESETS]}
          onChange={handlePresetChange}
        />

        <LeaderboardTable summaries={bundle.summaries} />

        {/* Robustness drop table (Phase 7) */}
        {robustnessSummary.length > 0 && (
          <RobustnessPanel rows={robustnessSummary} />
        )}
      </aside>

      {/* ── Right: 3D canvas + controls overlay ─────────────────────────── */}
      <div style={CANVAS_WRAPPER}>
        {comparisonAgents.length > 0 ? (
          <>
            <ComparisonScene
              worldSeed={bundle.config.world_seed}
              agents={comparisonAgents}
              playing={playing}
              speed={speed}
              playbackKey={playbackKey}
              seekVersion={seekVersion}
              seekToStep={seekToStep}
              onStepChange={handleStepChange}
            />

            <ReplayComparisonControls
              playing={playing}
              speed={speed}
              currentStep={currentStep}
              totalSteps={totalSteps}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onRestart={handleRestart}
              onSpeedChange={setSpeed}
              onSeek={handleSeek}
            />
          </>
        ) : (
          <div style={CANVAS_LOADING}>
            NO REPLAY DATA AVAILABLE
          </div>
        )}
      </div>
    </div>
  );
}
