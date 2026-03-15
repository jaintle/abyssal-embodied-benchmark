"use client";

/**
 * WorldScene — React Three Fiber canvas for one seeded underwater world.
 *
 * Renders:
 *   - Underwater fog + background colour
 *   - Ambient + directional lighting (blue-tinted)
 *   - Seabed terrain mesh (from TerrainGrid)
 *   - Obstacle field (from ObstacleData[])
 *   - Goal marker (from GoalSpec)
 *
 * The scene is fully driven by the WorldSpec passed in as a prop.
 * No animation, no physics, no agent at this stage.
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

import TerrainMesh from "./TerrainMesh";
import ObstacleField from "./ObstacleField";
import GoalMarker from "./GoalMarker";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorldSceneProps {
  /** Primary world seed — all geometry is deterministic from this value. */
  seed: number;
}

// ─── Underwater atmosphere constants ─────────────────────────────────────────

const FOG_COLOR = new THREE.Color(0x030e18);
const FOG_NEAR = 8;
const FOG_FAR = 90;
const BACKGROUND_COLOR = new THREE.Color(0x020a12);

// ─── Inner scene (inside Canvas context) ─────────────────────────────────────

interface SceneProps {
  seed: number;
}

function UnderwaterScene({ seed }: SceneProps) {
  // All generation is memoised — same seed → same result every render
  const spec = useMemo(() => generateWorldSpec(seed), [seed]);

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
      {/* Dim blue ambient — simulates scattered underwater light */}
      <ambientLight color="#1a4a6e" intensity={2.2} />

      {/* Weak directional from above — caustic-like overhead light */}
      <directionalLight
        color="#2a6a9e"
        intensity={0.6}
        position={[10, 30, 10]}
        castShadow={false}
      />

      {/* Green-tinted fill near goal — goal proximity glow */}
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

      {/* ── World geometry ─────────────────────────────────────────────── */}
      <TerrainMesh grid={grid} />
      <ObstacleField obstacles={obstacles} />
      <GoalMarker goal={spec.goal} />

      {/* ── Controls ───────────────────────────────────────────────────── */}
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

export default function WorldScene({ seed }: WorldSceneProps) {
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
      <UnderwaterScene seed={seed} />
    </Canvas>
  );
}
