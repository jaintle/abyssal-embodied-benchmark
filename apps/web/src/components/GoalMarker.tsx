"use client";

/**
 * GoalMarker — underwater navigation transponder buoy.
 *
 * Design intent: must be unmistakably readable as THE GOAL from any zoom
 * level and camera angle.  The previous "data pod" design blended into
 * the sandy seabed — safety orange has no contrast against warm sandy
 * fog at depth.
 *
 * New design: tall mooring post + large bright-green emissive float.
 * This is the classic vocabulary of underwater navigation markers used
 * in dive sites, AUV waypoints, and oceanographic surveys worldwide:
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  Float sphere — large, bright teal-green, strong emissive     │
 *   │  Float ring   — equatorial band, slightly brighter            │
 *   │  Mooring post — dark metal pole from float to seabed          │
 *   │  Seabed anchor — small flange at base of post                 │
 *   │  Acoustic pings — two expanding rings, teal-green             │
 *   │  Seafloor ring  — acceptance radius marker on the sand        │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Emissive intensity is high enough (3.5) that the float glows through
 * the fogExp2 scattering and is visible from the maximum camera distance.
 */

import { useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GoalSpec } from "@abyssal/worldgen";
import { TERRAIN_BASE_Y } from "./TerrainMesh";

interface GoalMarkerProps {
  goal: GoalSpec;
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const FLOAT_COL   = new THREE.Color("#00e8a0");   // bright teal-green float
const POST_COL    = new THREE.Color("#1e2e38");   // dark wet-metal post
const ANCHOR_COL  = new THREE.Color("#2a3a48");   // slightly lighter base plate
const PING_COL    = new THREE.Color("#00e8a0");   // matching ping rings

export default function GoalMarker({ goal }: GoalMarkerProps) {
  const [x, y, z] = goal.position;
  const ar = goal.acceptanceRadius;

  const ping1Ref = useRef<THREE.Mesh>(null);
  const ping2Ref = useRef<THREE.Mesh>(null);

  // Post runs from the goal Y position down to the seabed
  const seabedY    = TERRAIN_BASE_Y;
  const postLen    = Math.abs(y - seabedY) + 0.1;
  const postMidY   = (y + seabedY) / 2 - y;   // local offset from group origin

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Two acoustic pings, 1.5 s apart, each expanding 1× → 2.8×
    const updatePing = (
      ref: RefObject<THREE.Mesh | null>,
      offset: number,
      baseOpacity: number
    ) => {
      if (!ref.current) return;
      const p = ((t + offset) % 3.0) / 3.0;
      ref.current.scale.setScalar(1.0 + p * 1.8);
      (ref.current.material as THREE.MeshBasicMaterial).opacity =
        (1.0 - p) * baseOpacity;
    };

    updatePing(ping1Ref, 0.0,  0.55);
    updatePing(ping2Ref, 1.5,  0.35);
  });

  return (
    <group name="goal-marker" position={[x, y, z]}>

      {/* ── Mooring post — thin dark pole from float to seabed ─────────── */}
      <mesh position={[0, postMidY, 0]}>
        <cylinderGeometry args={[0.055, 0.055, postLen, 6]} />
        <meshStandardMaterial color={POST_COL} roughness={0.7} metalness={0.6} />
      </mesh>

      {/* ── Seabed anchor plate ──────────────────────────────────────────── */}
      <mesh position={[0, seabedY - y + 0.06, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.10, 10]} />
        <meshStandardMaterial color={ANCHOR_COL} roughness={0.8} metalness={0.5} />
      </mesh>

      {/* ── Main float sphere — large, strongly emissive ────────────────── */}
      {/* emissiveIntensity 3.5 makes it glow visibly through the fog */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.72, 18, 14]} />
        <meshStandardMaterial
          color={FLOAT_COL}
          emissive={FLOAT_COL}
          emissiveIntensity={3.5}
          roughness={0.22}
          metalness={0.0}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* ── Equatorial ring — slightly brighter band ─────────────────────── */}
      <mesh position={[0, 0, 0]}>
        <torusGeometry args={[0.74, 0.07, 8, 36]} />
        <meshStandardMaterial
          color={FLOAT_COL}
          emissive={FLOAT_COL}
          emissiveIntensity={5.0}
          roughness={0.12}
          metalness={0.0}
        />
      </mesh>

      {/* ── Acoustic ping rings ───────────────────────────────────────────── */}
      <mesh ref={ping1Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ar * 0.88, ar, 52]} />
        <meshBasicMaterial
          color={PING_COL}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ping2Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ar * 0.88, ar, 52]} />
        <meshBasicMaterial
          color={PING_COL}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* ── Seafloor acceptance ring — target zone on the sand ───────────── */}
      <mesh
        position={[0, seabedY - y + 0.09, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <ringGeometry args={[ar - 0.18, ar, 64]} />
        <meshBasicMaterial
          color={FLOAT_COL}
          transparent
          opacity={0.50}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* ── Point light — teal, illuminates surrounding seabed ───────────── */}
      <pointLight
        color={FLOAT_COL}
        intensity={18}
        distance={22}
        decay={2}
        position={[0, 0, 0]}
      />
    </group>
  );
}
