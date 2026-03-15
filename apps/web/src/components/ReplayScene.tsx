"use client";

/**
 * ReplayScene — R3F canvas rendering a seeded world + animated agent (Phase 4)
 *
 * Phase 10 upgrades: same cinematic atmosphere as WorldScene.
 * UnderwaterAtmosphere, CausticsLayer, ParticleField wired in.
 * Hardware antialias:true (postprocessing removed; R3F v9 incompatible).
 *
 * Phase 11: WaterSurface and GodRays always on.
 */

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  generateWorldSpec,
  generateTerrainGrid,
  generateObstacles,
  DEFAULT_TERRAIN_RESOLUTION,
} from "@abyssal/worldgen";
import type { ReplayFile } from "@abyssal/replay-schema";

import TerrainMesh from "./TerrainMesh";
import ObstacleField from "./ObstacleField";
import GoalMarker from "./GoalMarker";
import AgentPlayback from "./AgentPlayback";
import TrajectoryTrail from "./TrajectoryTrail";
import CameraController from "./CameraController";
import UnderwaterAtmosphere from "./UnderwaterAtmosphere";
import CausticsLayer from "./CausticsLayer";
import ParticleField from "./ParticleField";
import WaterSurface from "./WaterSurface";
import GodRays from "./GodRays";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReplaySceneProps {
  replay: ReplayFile;
  playing: boolean;
  speed: number;
  playbackKey: number;
  currentStep: number;
  cameraMode: "overview" | "follow";
  seekVersion: number;
  seekToStep: number;
  onStepChange?: (stepIndex: number) => void;
}

// ─── Inner scene ──────────────────────────────────────────────────────────────

interface InnerProps {
  replay: ReplayFile;
  playing: boolean;
  speed: number;
  playbackKey: number;
  currentStep: number;
  cameraMode: "overview" | "follow";
  seekVersion: number;
  seekToStep: number;
  onStepChange?: (stepIndex: number) => void;
}

function ReplayWorldScene({
  replay,
  playing,
  speed,
  playbackKey,
  currentStep,
  cameraMode,
  seekVersion,
  seekToStep,
  onStepChange,
}: InnerProps) {
  const worldSeed = replay.header.worldSeed;
  const spec      = useMemo(() => generateWorldSpec(worldSeed), [worldSeed]);
  const grid      = useMemo(() => generateTerrainGrid(spec, DEFAULT_TERRAIN_RESOLUTION), [spec]);
  const obstacles = useMemo(() => generateObstacles(spec), [spec]);

  return (
    <>
      {/* ── Atmosphere ─────────────────────────────────────────────── */}
      <UnderwaterAtmosphere />

      {/* ── Static world geometry ──────────────────────────────────── */}
      <TerrainMesh grid={grid} />
      <ObstacleField obstacles={obstacles} />
      <GoalMarker goal={spec.goal} />

      {/* ── Volumetric cues ────────────────────────────────────────── */}
      <CausticsLayer />
      <ParticleField />

      {/* ── Always-on surface effects (Phase 11) ─────────────────────── */}
      <WaterSurface />
      <GodRays />

      {/* ── Trajectory trail ──────────────────────────────────────── */}
      <TrajectoryTrail steps={replay.steps} currentStep={currentStep} />

      {/* ── Animated agent ─────────────────────────────────────────── */}
      <AgentPlayback
        key={playbackKey}
        steps={replay.steps}
        playing={playing}
        speed={speed}
        playbackKey={playbackKey}
        seekVersion={seekVersion}
        seekToStep={seekToStep}
        onStepChange={onStepChange}
      />

      {/* ── Camera ─────────────────────────────────────────────────── */}
      <CameraController
        mode={cameraMode}
        steps={replay.steps}
        currentStep={currentStep}
      />
      <OrbitControls
        enabled={cameraMode === "overview"}
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={120}
        maxPolarAngle={Math.PI * 0.55}
        target={[0, 0, 0]}
      />

    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function ReplayScene({
  replay,
  playing,
  speed,
  playbackKey,
  currentStep,
  cameraMode,
  seekVersion,
  seekToStep,
  onStepChange,
}: ReplaySceneProps) {
  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{
        fov: 55,
        near: 0.5,
        far: 200,
        position: [30, 22, 42],
      }}
      shadows={false}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
      }}
    >
      <ReplayWorldScene
        replay={replay}
        playing={playing}
        speed={speed}
        playbackKey={playbackKey}
        currentStep={currentStep}
        cameraMode={cameraMode}
        seekVersion={seekVersion}
        seekToStep={seekToStep}
        onStepChange={onStepChange}
      />
    </Canvas>
  );
}
