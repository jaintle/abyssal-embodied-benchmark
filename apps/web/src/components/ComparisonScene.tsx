"use client";

/**
 * ComparisonScene — R3F canvas rendering multiple agents in one shared world
 * (Phase 6)
 *
 * Phase 10 upgrades: same cinematic atmosphere as WorldScene / ReplayScene.
 * UnderwaterAtmosphere, CausticsLayer, ParticleField wired in.
 * Hardware antialias:true (postprocessing removed; R3F v9 incompatible).
 */

import { useMemo, useRef, useState, useCallback } from "react";
import type { CSSProperties, MutableRefObject } from "react";
import { Canvas } from "@react-three/fiber";
import {
  PerfCollector,
  PerformanceHUD,
  PerfToggle,
  type RenderStats,
} from "./PerformanceOverlay";
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

  // ── Per-agent live step refs ─────────────────────────────────────────────
  // Each ref is written every frame by its AgentPlayback (via liveStepRef)
  // and read every frame by its TrajectoryTrail — zero React re-renders.
  const stepRefsContainer = useRef<MutableRefObject<number>[]>([]);
  // Grow the array when agents are added; initialise new refs to seekToStep.
  while (stepRefsContainer.current.length < agents.length) {
    stepRefsContainer.current.push({ current: seekToStep });
  }
  const stepRefs = stepRefsContainer.current;

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
          {/* stepRefs[i] is written by AgentPlayback and read by TrajectoryTrail */}
          <TrajectoryTrail
            steps={agent.replay.steps}
            stepRef={stepRefs[i]}
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
            liveStepRef={stepRefs[i]}
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
  const [perfStats, setPerfStats] = useState<RenderStats | null>(null);
  const [showPerf, setShowPerf] = useState(false);
  const togglePerf = useCallback(() => setShowPerf((v) => !v), []);

  return (
    <div style={SCENE_ROOT}>
      {/* P key toggles performance HUD */}
      <PerfToggle onToggle={togglePerf} />

      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{
          fov: 55,
          near: 0.5,
          far: 200,
          // Elevated angled overview: water surface at top, full terrain + goal
          // visible — benchmark audit reference camera position.
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
        {/* PerfCollector runs inside Canvas so it can access the renderer */}
        <PerfCollector onStats={setPerfStats} />
      </Canvas>

      {/* HUD is HTML rendered over the canvas */}
      <PerformanceHUD stats={perfStats} visible={showPerf} />
    </div>
  );
}

const SCENE_ROOT: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};
