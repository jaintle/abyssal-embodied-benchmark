"use client";

/**
 * ComparisonScene — R3F canvas rendering multiple agents in one shared world
 * (Phase 6)
 *
 * Phase 10 upgrades: same cinematic atmosphere as WorldScene / ReplayScene.
 * UnderwaterAtmosphere, CausticsLayer, ParticleField wired in.
 * Hardware antialias:true (postprocessing removed; R3F v9 incompatible).
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
import UnderwaterAtmosphere from "./UnderwaterAtmosphere";
import CausticsLayer from "./CausticsLayer";
import ParticleField from "./ParticleField";
import SeabedFloor from "./SeabedFloor";
import WaterSurface from "./WaterSurface";
import GodRays from "./GodRays";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComparisonAgent {
  agentId: string;
  replay: ReplayFile;
  color: string;
}

export interface ComparisonSceneProps {
  worldSeed: number;
  agents: ComparisonAgent[];
  playing: boolean;
  speed: number;
  playbackKey: number;
  seekVersion: number;
  seekToStep: number;
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
  const spec      = useMemo(() => generateWorldSpec(worldSeed), [worldSeed]);
  const grid      = useMemo(() => generateTerrainGrid(spec, DEFAULT_TERRAIN_RESOLUTION), [spec]);
  const obstacles = useMemo(() => generateObstacles(spec), [spec]);

  const longestAgentIndex = useMemo(
    () =>
      agents.reduce(
        (maxIdx, a, i, arr) =>
          (a.replay.steps?.length ?? 0) > (arr[maxIdx].replay.steps?.length ?? 0) ? i : maxIdx,
        0
      ),
    [agents]
  );

  const handleStepChange = (agentIndex: number) => (step: number) => {
    if (agentIndex === longestAgentIndex) onStepChange?.(step);
  };

  return (
    <>
      {/* ── Atmosphere ─────────────────────────────────────────────── */}
      <UnderwaterAtmosphere />

      {/* ── Static world geometry ──────────────────────────────────── */}
      <SeabedFloor />
      <TerrainMesh grid={grid} />
      <ObstacleField obstacles={obstacles} />
      <GoalMarker goal={spec.goal} />

      {/* ── Volumetric cues ────────────────────────────────────────── */}
      <CausticsLayer />
      <ParticleField />

      {/* ── Always-on surface effects (Phase 11) ─────────────────────── */}
      <WaterSurface />
      <GodRays />

      {/* ── Per-agent trail + animated sphere ─────────────────────── */}
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
            showGlow={i === 0}
            showPointLight={false}
            onStepChange={handleStepChange(i)}
          />
        </group>
      ))}

      {/* ── Camera (overview only) ──────────────────────────────────── */}
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
        stencil: false,
      }}
    >
      <ComparisonWorldScene {...props} />
    </Canvas>
  );
}
