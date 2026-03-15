"use client";

/**
 * ComparisonScene — R3F canvas rendering multiple agents in one shared world
 * (Phase 6)
 *
 * All agents share the same world seed → same terrain, obstacles, and goal.
 * Each agent gets a distinct color for its sphere and trajectory trail.
 * Playback is synchronized: all agents receive the same playing/speed/seek
 * state simultaneously.
 *
 * Architecture:
 *   ComparisonScene (Canvas wrapper)
 *     └── ComparisonWorldScene (inner scene, runs inside Canvas context)
 *           ├── shared world geometry (terrain, obstacles, goal)
 *           ├── AgentPlayback × N  (one per agent, colored)
 *           ├── TrajectoryTrail × N
 *           ├── CameraController (overview-only in comparison mode)
 *           └── OrbitControls
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
import TrajectoryTrail from "./TrajectoryTrail";

// ─── Constants ────────────────────────────────────────────────────────────────

const FOG_COLOR = new THREE.Color(0x030e18);
const FOG_NEAR = 8;
const FOG_FAR = 90;
const BACKGROUND_COLOR = new THREE.Color(0x020a12);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComparisonAgent {
  agentId: string;
  replay: ReplayFile;
  color: string;
}

export interface ComparisonSceneProps {
  /** All agents must share the same world seed */
  worldSeed: number;
  agents: ComparisonAgent[];
  playing: boolean;
  speed: number;
  playbackKey: number;
  seekVersion: number;
  seekToStep: number;
  /** Called with the step index from the longest-running agent */
  onStepChange?: (stepIndex: number) => void;
}

// ─── Inner scene ──────────────────────────────────────────────────────────────

interface InnerProps extends ComparisonSceneProps {}

function ComparisonWorldScene({
  worldSeed,
  agents,
  playing,
  speed,
  playbackKey,
  seekVersion,
  seekToStep,
  onStepChange,
}: InnerProps) {
  const spec = useMemo(() => generateWorldSpec(worldSeed), [worldSeed]);
  const grid = useMemo(() => generateTerrainGrid(spec, DEFAULT_TERRAIN_RESOLUTION), [spec]);
  const obstacles = useMemo(() => generateObstacles(spec), [spec]);

  // Report canonical step from the agent with the MOST replay steps.
  // Shorter agents finish early and stop emitting; if we reported from
  // agent[0] it might have fewer steps than others, freezing the scrubber.
  const longestAgentIndex = useMemo(
    () =>
      agents.reduce(
        (maxIdx, a, i, arr) =>
          a.replay.steps.length > arr[maxIdx].replay.steps.length ? i : maxIdx,
        0
      ),
    [agents]
  );

  const handleStepChange = (agentIndex: number) => (step: number) => {
    if (agentIndex === longestAgentIndex) onStepChange?.(step);
  };

  return (
    <>
      {/* ── Atmosphere ──────────────────────────────────────────────────── */}
      <color attach="background" args={[BACKGROUND_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, FOG_NEAR, FOG_FAR]} />

      {/* ── Lighting ────────────────────────────────────────────────────── */}
      <ambientLight color="#1a4a6e" intensity={2.2} />
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

      {/* ── Static world geometry ────────────────────────────────────────── */}
      <TerrainMesh grid={grid} />
      <ObstacleField obstacles={obstacles} />
      <GoalMarker goal={spec.goal} />

      {/* ── Per-agent trail + animated sphere ───────────────────────────── */}
      {agents.map((agent, i) => (
        <group key={agent.agentId}>
          <TrajectoryTrail
            steps={agent.replay.steps}
            currentStep={seekToStep}
            color={agent.color}
          />
          <AgentPlayback
            key={`${agent.agentId}-${playbackKey}`}
            steps={agent.replay.steps}
            playing={playing}
            speed={speed}
            playbackKey={playbackKey}
            seekVersion={seekVersion}
            seekToStep={seekToStep}
            agentColor={agent.color}
            showGlow={i === 0}          // glow only on lead agent to reduce clutter
            showPointLight={false}       // one shared ambient light instead
            onStepChange={handleStepChange(i)}
          />
        </group>
      ))}

      {/* ── Camera (overview only — follow doesn't work with N agents) ───── */}
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

export default function ComparisonScene(props: ComparisonSceneProps) {
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
      <ComparisonWorldScene {...props} />
    </Canvas>
  );
}
