"use client";

/**
 * MultiReplayViewer — state container for the multi-agent comparison view (Phase 6)
 *
 * Responsibilities:
 *   - Load the sample benchmark bundle (config + summaries + replays) on mount
 *   - Build ComparisonAgent[] from loaded replays + agent colour palette
 *   - Own all shared playback state (playing, speed, currentStep, …)
 *   - Render two-column layout:
 *       left  → BenchmarkSummaryPanel + LeaderboardTable
 *       right → ComparisonScene (3D canvas) + ReplayComparisonControls overlay
 *
 * Stateless children receive only the props they need.
 */

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { CSSProperties } from "react";

import { loadSampleBenchmark, agentColor } from "@/lib/sampleBenchmark";
import type { BenchmarkBundle } from "@/lib/benchmarkLoader";
import type { ComparisonAgent } from "./ComparisonScene";
import BenchmarkSummaryPanel from "./BenchmarkSummaryPanel";
import LeaderboardTable from "./LeaderboardTable";
import ReplayComparisonControls from "./ReplayComparisonControls";

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

/** Build ComparisonAgent[] from a loaded bundle, skipping agents without replays. */
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
  // ── Async bundle state ─────────────────────────────────────────────────────
  const [bundle, setBundle] = useState<BenchmarkBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Playback state ─────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentStep, setCurrentStep] = useState(0);
  /** Increment to trigger full playback reset inside each AgentPlayback */
  const [playbackKey, setPlaybackKey] = useState(0);
  /** Increment to snap all agents to seekToStep */
  const [seekVersion, setSeekVersion] = useState(0);
  const [seekToStep, setSeekToStep] = useState(0);

  // ── Load sample benchmark on mount ─────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    loadSampleBenchmark().then((result) => {
      if (result.success) {
        setBundle(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? "Failed to load benchmark bundle");
      }
      setIsLoading(false);
    });
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────
  const comparisonAgents: ComparisonAgent[] = bundle
    ? buildComparisonAgents(bundle)
    : [];

  /** Total steps for the scrubber = longest replay among loaded agents */
  const totalSteps = comparisonAgents.reduce(
    (max, a) => Math.max(max, a.replay.steps.length),
    1
  );

  /** Agent IDs that have loaded replays */
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
      // Auto-pause at end of the longest replay
      if (step >= totalSteps - 1) {
        setPlaying(false);
      }
    },
    [totalSteps]
  );

  const handleSeek = useCallback((step: number) => {
    setPlaying(false);
    setCurrentStep(step);
    setSeekToStep(step);
    setSeekVersion((v) => v + 1);
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
        />
        <LeaderboardTable summaries={bundle.summaries} />
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
