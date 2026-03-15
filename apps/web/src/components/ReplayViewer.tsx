"use client";

/**
 * ReplayViewer — full-page replay viewer (Phase 4)
 *
 * Orchestrates:
 *   - Replay loading (async fetch → validate)
 *   - Loading / error states
 *   - Playback state (playing, speed, currentStep, playbackKey)
 *   - Layout: 3D canvas + overlay panels
 *
 * This component owns all playback state. Child components receive only
 * what they need via props, keeping the data flow auditable.
 */

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";

import type { ReplayFile } from "@abyssal/replay-schema";
import {
  loadReplayFromPath,
  SAMPLE_REPLAY_PATH,
} from "@/lib/replayLoader";

import PlaybackControls from "./PlaybackControls";
import ReplayMetricsPanel from "./ReplayMetricsPanel";

// ─── Lazy-loaded 3D canvas (no SSR — WebGL requires browser) ─────────────────

const ReplayScene = dynamic(() => import("./ReplayScene"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#4a9aba",
        fontFamily: "monospace",
        fontSize: "0.85rem",
        letterSpacing: "0.08em",
      }}
    >
      INITIALISING WORLD…
    </div>
  ),
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReplayViewer() {
  // ── Async replay state ─────────────────────────────────────────────────────
  const [replay, setReplay] = useState<ReplayFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Playback state ─────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentStep, setCurrentStep] = useState(0);
  /** Increment to trigger a full playback reset inside AgentPlayback */
  const [playbackKey, setPlaybackKey] = useState(0);
  /** Camera mode: overview (orbit) or follow (track agent) */
  const [cameraMode, setCameraMode] = useState<"overview" | "follow">("overview");
  /** Scrubber seek: increment seekVersion to snap agent to seekToStep */
  const [seekVersion, setSeekVersion] = useState(0);
  const [seekToStep, setSeekToStep] = useState(0);

  // ── Load sample replay on mount ────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    loadReplayFromPath(SAMPLE_REPLAY_PATH).then((result) => {
      if (result.success) {
        setReplay(result.data);
        setLoadError(null);
      } else {
        setLoadError(
          result.error && "message" in result.error
            ? String((result.error as { message: string }).message)
            : "Replay validation failed"
        );
      }
      setIsLoading(false);
    });
  }, []);

  // ── Playback handlers ──────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    setPlaying(false);
    setCurrentStep(0);
    setPlaybackKey((k) => k + 1);
  }, []);

  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
    // Auto-pause at end of replay
    if (replay && step >= replay.steps.length - 1) {
      setPlaying(false);
    }
  }, [replay]);

  const handleSeek = useCallback((step: number) => {
    setPlaying(false);
    setCurrentStep(step);
    setSeekToStep(step);
    setSeekVersion((v) => v + 1);
  }, []);

  const handleCameraToggle = useCallback(() => {
    setCameraMode((m) => (m === "overview" ? "follow" : "overview"));
  }, []);

  // ── Render states ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={FULL_SCREEN}>
        <div style={STATUS_TEXT}>LOADING REPLAY…</div>
      </div>
    );
  }

  if (loadError || !replay) {
    return (
      <div style={FULL_SCREEN}>
        <div style={{ ...STATUS_TEXT, color: "#ff6060" }}>
          REPLAY ERROR
          <br />
          <span style={{ fontSize: "0.70rem", color: "#4a9aba" }}>
            {loadError ?? "unknown error"}
          </span>
        </div>
      </div>
    );
  }

  // ── Full viewer ────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#020a12",
      }}
    >
      {/* 3D canvas — fills viewport */}
      <div style={{ width: "100%", height: "100%" }}>
        <ReplayScene
          replay={replay}
          playing={playing}
          speed={speed}
          playbackKey={playbackKey}
          currentStep={currentStep}
          cameraMode={cameraMode}
          seekVersion={seekVersion}
          seekToStep={seekToStep}
          onStepChange={handleStepChange}
        />
      </div>

      {/* Top-left: metadata + metrics */}
      <ReplayMetricsPanel replay={replay} currentStep={currentStep} />

      {/* Bottom-centre: playback controls */}
      <PlaybackControls
        playing={playing}
        speed={speed}
        currentStep={currentStep}
        totalSteps={replay.steps.length}
        cameraMode={cameraMode}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onRestart={handleRestart}
        onSpeedChange={setSpeed}
        onSeek={handleSeek}
        onCameraToggle={handleCameraToggle}
      />
    </div>
  );
}

// ─── Shared layout styles ─────────────────────────────────────────────────────

const FULL_SCREEN: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#020a12",
};

const STATUS_TEXT: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.85rem",
  letterSpacing: "0.08em",
  color: "#4a9aba",
  textAlign: "center",
  lineHeight: 2,
};
