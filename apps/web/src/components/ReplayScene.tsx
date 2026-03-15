"use client";

/**
 * ReplayScene — R3F canvas that renders a seeded world + animated agent (Phase 4)
 *
 * Reuses all Phase 1 geometry components (TerrainMesh, ObstacleField, GoalMarker)
 * and adds AgentPlayback for replay-driven animation.
 *
 * The world is reconstructed deterministically from replay.header.worldSeed —
 * the same seed the Python benchmark used when the episode was recorded.
 */

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const FOG_COLOR = new THREE.Color(0x030e18);
const FOG_NEAR = 8;
const FOG_FAR = 90;
const BACKGROUND_COLOR = new THREE.Color(0x020a12);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReplaySceneProps {
  replay: ReplayFile;
  playing: boolean;
  speed: number;
  playbackKey: number;
  onStepChange?: (stepIndex: number) => void;
}

// ─── Inner scene (runs inside Canvas context) ─────────────────────────────────

interface InnerProps {
  replay: ReplayFile;
  playing: boolean;
  speed: number;
  playbackKey: number;
  onStepChange?: (stepIndex: number) => void;
}

function ReplayWorldScene({
  replay,
  playing,
  speed,
  playbackKey,
  onStepChange,
}: InnerProps) {
  const worldSeed = replay.header.worldSeed;

  // Reconstruct world geometry deterministically from the replay's world seed
  const spec = useMemo(() => generateWorldSpec(worldSeed), [worldSeed]);
  const grid = useMemo(
    () => generateTerrainGrid(spec, DEFAULT_TERRAIN_RESOLUTION),
    [spec]
  );
  const obstacles = useMemo(() => generateObstacles(spec), [spec]);

  return (
    <>
      {/* ── Atmosphere ─────────────────────────────────────────────────── */}
      <color attach="background" args={[BACKGROUND_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />

      {/* ── Lighting ───────────────────────────────────────────────────── */}
      <ambientLight color="#1a4a6e" intensity={1.8} />
      <directionalLight
        color="#2a6a9e"
        intensity={0.6}
        position={[10, 30, 10]}
        castShadow={false}
      />
      {/* Goal proximity glow */}
      <pointLight
        color="#00ffa0"
        intensity={12}
        distance={20}
        position={[
          spec.goal.position[0],
          spec.goal.position[1] + 2,
          spec.goal.position[2],
        ]}
      />

      {/* ── Static world geometry ──────────────────────────────────────── */}
      <TerrainMesh grid={grid} />
      <ObstacleField obstacles={obstacles} />
      <GoalMarker goal={spec.goal} />

      {/* ── Animated agent ─────────────────────────────────────────────── */}
      <AgentPlayback
        key={playbackKey}
        steps={replay.steps}
        playing={playing}
        speed={speed}
        playbackKey={playbackKey}
        onStepChange={onStepChange}
      />

      {/* ── Camera controls ────────────────────────────────────────────── */}
      <OrbitControls
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
      }}
    >
      <ReplayWorldScene
        replay={replay}
        playing={playing}
        speed={speed}
        playbackKey={playbackKey}
        onStepChange={onStepChange}
      />
    </Canvas>
  );
}
