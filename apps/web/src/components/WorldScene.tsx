"use client";

/**
 * WorldScene — React Three Fiber canvas for one seeded underwater world.
 *
 * Phase 10 rendering upgrades:
 *   - UnderwaterAtmosphere replaces inline fog/lights/background
 *   - CausticsLayer — animated caustic projector (AdditiveBlending shader)
 *   - ParticleField  — GPU-animated marine snow
 *   - Hardware antialias:true (postprocessing removed; R3F v9 incompatible)
 *
 * Phase 11 always-on additions:
 *   - WaterSurface — Gerstner-wave ocean surface viewed from below
 *   - GodRays      — volumetric light shafts from surface to seabed
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

import TerrainMesh from "./TerrainMesh";
import ObstacleField from "./ObstacleField";
import GoalMarker from "./GoalMarker";
import UnderwaterAtmosphere from "./UnderwaterAtmosphere";
import CausticsLayer from "./CausticsLayer";
import ParticleField from "./ParticleField";
import WaterSurface from "./WaterSurface";
import GodRays from "./GodRays";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorldSceneProps {
  seed: number;
}

// ─── Inner scene (inside Canvas context) ─────────────────────────────────────

function UnderwaterScene({ seed }: { seed: number }) {
  const spec      = useMemo(() => generateWorldSpec(seed), [seed]);
  const grid      = useMemo(() => generateTerrainGrid(spec, DEFAULT_TERRAIN_RESOLUTION), [spec]);
  const obstacles = useMemo(() => generateObstacles(spec), [spec]);

  return (
    <>
      {/* ── Atmosphere: fog, hemisphere light, directional sun ──────── */}
      <UnderwaterAtmosphere />

      {/* ── Static world geometry ───────────────────────────────────── */}
      <TerrainMesh grid={grid} />
      <ObstacleField obstacles={obstacles} />
      <GoalMarker goal={spec.goal} />

      {/* ── Volumetric cues ─────────────────────────────────────────── */}
      <CausticsLayer />
      <ParticleField />

      {/* ── Always-on surface effects (Phase 11) ─────────────────────── */}
      <WaterSurface />
      <GodRays />

      {/* ── Controls ────────────────────────────────────────────────── */}
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
        stencil: false,
      }}
    >
      <UnderwaterScene seed={seed} />
    </Canvas>
  );
}
